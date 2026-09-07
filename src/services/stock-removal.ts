import { db, type Repositories } from '@/repositories';
import { uuidv7 } from '@/lib/ids';
import { RemovalValidationError, type RemovalInput, type RemovalReceipt } from '@/lib/stock-removal';
import { recordStockOutInTransaction } from '@/services/stock';
import { createSupplierReturnInTransaction } from '@/services/supplier-returns';

/** Stock, return records and audits share the same commit and request identity. */
export async function removeStock(input: RemovalInput & { actorId: string }, repositories: Repositories = db, ip: string | null = null) {
  return repositories.transaction(async tx => {
    const previous = await tx.movements.findByIdempotencyKey(input.idempotencyKey);
    const product = await tx.products.findById(input.productId);
    if (!product) throw new RemovalValidationError('productId', 'removal.productUnavailable');
    if ((product.trackingType === 'SERIAL') !== (input.mode === 'serial')) throw new RemovalValidationError('productId', 'removal.trackingChanged');
    if (!previous) {
      if (input.mode === 'serial') {
        const unit = await tx.units.findBySerial(input.serialNo!);
        if (!unit || unit.productId !== product.id || unit.status !== 'IN_STOCK') throw new RemovalValidationError('serialNo', 'removal.deviceUnavailable');
      } else if (product.quantityOnHand < input.quantity!) {
        throw new RemovalValidationError('quantity', 'removal.insufficient', product.quantityOnHand);
      }
      if (input.supplierId && !(await tx.suppliers.findById(input.supplierId))?.isActive) throw new RemovalValidationError('supplierId', 'removal.supplierUnavailable');
    }
    const result = input.reason === 'RETURN_TO_SUPPLIER'
      ? await createSupplierReturnInTransaction({ ...input, reason: 'RETURN_TO_SUPPLIER', supplierId: input.supplierId!, returnReason: input.returnReason! }, tx)
      : { movement: await recordStockOutInTransaction(input, tx), supplierReturn: undefined };
    const { movement, supplierReturn } = result;
    if (previous) {
      const audit = (await tx.auditLogs.findByEntity('StockMovement', movement.id)).find(row => row.action === 'stock.out');
      const saved = (audit?.after as { removal?: RemovalReceipt } | null)?.removal;
      if (saved) return { receipt: saved, replayed: true };
    }
    const unit = movement.unitId ? await tx.units.findById(movement.unitId) : null;
    const supplier = supplierReturn ? await tx.suppliers.findById(supplierReturn.supplierId) : null;
    const receipt: RemovalReceipt = {
      movementId: movement.id, productId: movement.productId, productName: product.name, sku: product.sku,
      serialNo: unit?.serialNo ?? null, quantity: Math.abs(movement.quantity), reason: movement.reason,
      reference: movement.reference, note: movement.note,
      ...(supplierReturn ? { supplierReturn: { id: supplierReturn.id, returnNumber: supplierReturn.returnNumber,
        supplierName: supplier?.name ?? '', returnReason: supplierReturn.reason } } : {}),
    };
    // Historical records remain replayable, without adding duplicate audits.
    if (!previous) {
      await tx.auditLogs.create({ id: uuidv7(), actorId: input.actorId, action: 'stock.out', entity: 'StockMovement', entityId: movement.id,
        before: null, after: { ...movement, removal: receipt }, ip, createdAt: movement.createdAt });
      if (supplierReturn) await tx.auditLogs.create({ id: uuidv7(), actorId: input.actorId, action: 'supplier_return.create', entity: 'SupplierReturn',
        entityId: supplierReturn.id, before: null, after: supplierReturn, ip, createdAt: supplierReturn.createdAt });
    }
    return { receipt, replayed: Boolean(previous) };
  }, { isolationLevel: 'Serializable' });
}
