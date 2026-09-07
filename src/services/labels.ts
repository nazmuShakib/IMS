import type { Role } from '@/domain/types';
import { hasPermission } from '@/lib/permissions';
import { labelBarcodeFit, type LabelPrintRequest, type LabelPrintState, type LabelScanState } from '@/lib/label-print';
import type { Repositories } from '@/repositories';

export async function prepareLabelJob(input: LabelPrintRequest, role: Role, db: Repositories): Promise<LabelPrintState> {
  if (!hasPermission(role, 'PRINT_LABELS')) return { error: 'labels.notAllowed' };
  const fail = (field: 'productId' | 'unitIds' | 'copies', error: string): LabelPrintState => ({ error: 'labels.fixErrors', fieldErrors: { [field]: error } });
  const product = await db.products.findById(input.productId);
  if (!product) return fail('productId', 'labels.productUnavailable');
  const canReprint = hasPermission(role, 'REPRINT_NON_STOCK_LABELS');
  let units: Awaited<ReturnType<Repositories['units']['findByProduct']>> = [];
  if (product.trackingType === 'SERIAL') {
    const ids = [...new Set(input.unitIds)];
    if (!ids.length) return fail('unitIds', 'labels.selectRequired');
    if (ids.length * input.copies > 500) return fail('copies', 'labels.maxError');
    const available = new Map((await db.units.findByProduct(product.id)).map(unit => [unit.id, unit]));
    if (ids.some(id => !available.has(id))) return fail('unitIds', 'labels.invalidUnits');
    units = ids.map(id => available.get(id)!);
    if (!canReprint && units.some(unit => unit.status !== 'IN_STOCK')) return fail('unitIds', 'labels.stockRequired');
    const invalid = units.map(unit => labelBarcodeFit(unit.serialNo)).find(fit => fit.error);
    if (invalid?.error) return fail('unitIds', invalid.error);
  } else {
    if (input.unitIds.length) return fail('unitIds', 'labels.invalidUnits');
    if (!canReprint && product.quantityOnHand <= 0) return fail('productId', 'labels.stockRequired');
    if (!product.barcode) return fail('productId', 'labels.productBarcodeRequired');
    const fit = labelBarcodeFit(product.barcode);
    if (fit.error) return fail('productId', fit.error);
  }
  return { job: {
    product: { id: product.id, name: product.name, sku: product.sku, barcode: product.barcode, trackingType: product.trackingType },
    units: units.map(({ id, serialNo, status, receivedAt }) => ({ id, serialNo, status, receivedAt })),
    copies: input.copies, layout: input.layout,
    labelCount: (product.trackingType === 'SERIAL' ? units.length : 1) * input.copies,
  } };
}

export async function resolveLabelIdentifier(value: string, role: Role, db: Repositories): Promise<LabelScanState> {
  if (!hasPermission(role, 'PRINT_LABELS')) return { error: 'labels.notAllowed' };
  const identifier = value.trim();
  if (!identifier || identifier.length > 120) return { error: 'labels.invalidScan' };
  const unit = await db.units.findBySerial(identifier);
  if (unit) {
    if (!hasPermission(role, 'REPRINT_NON_STOCK_LABELS') && unit.status !== 'IN_STOCK') return { error: 'labels.stockRequired' };
    if (!await db.products.findById(unit.productId)) return { error: 'labels.productUnavailable' };
    return { productId: unit.productId, unit: { id: unit.id, serialNo: unit.serialNo, status: unit.status, receivedAt: unit.receivedAt } };
  }
  const product = await db.products.findByBarcode(identifier) ?? await db.products.findBySku(identifier);
  if (!product) return { error: 'labels.scanNotFound' };
  if (!hasPermission(role, 'REPRINT_NON_STOCK_LABELS') && product.trackingType === 'QUANTITY' && product.quantityOnHand <= 0) return { error: 'labels.stockRequired' };
  return { productId: product.id };
}
