import { describe, expect, it } from 'vitest';
import { removalFieldsSchema } from '@/lib/stock-removal';
import { removeStock } from '@/services/stock-removal';
import { recordStockOutInTransaction } from '@/services/stock';
import type { Repositories } from '@/repositories';
const productId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const fields = (patch = {}) => ({ mode: 'bulk', productId, serialNo: '', quantity: '2', reason: 'DAMAGE', supplierId: '', returnReason: '', reference: '', note: '', idempotencyKey: 'remove-key-1', ...patch });
const request = (patch = {}) => ({ ...removalFieldsSchema.parse(fields(patch)), actorId: 'admin' });
function memory(serial = false) {
  let state = {
    product: { id: productId, name: 'Test product', sku: 'TEST', trackingType: serial ? 'SERIAL' : 'QUANTITY', isActive: false, quantityOnHand: 20, avgCostPrice: 1000 },
    unit: { id: 'unit', productId, serialNo: 'DEVICE', status: 'IN_STOCK', costPrice: 1000 },
    supplier: { id: supplierId, name: 'Supplier', isActive: true },
    movements: [] as any[], audits: [] as any[], returns: [] as any[],
  };
  let failAudit = 0;
  const tx = {
    products: { findById: async (id: string) => id === productId ? state.product : null,
      _applyQuantityDelta: async (_id: string, delta: number) => { if (state.product.quantityOnHand + delta < 0) throw new Error('Insufficient stock'); state.product.quantityOnHand += delta; return state.product; } },
    units: { findBySerial: async (serial: string) => serial.toLowerCase() === 'device' ? state.unit : null, findById: async () => state.unit,
      transitionStatus: async (_id: string, expected: string, next: string) => { if (state.unit.status !== expected) throw new Error('Stock changed'); state.unit.status = next; return state.unit; } },
    suppliers: { findById: async (id: string) => id === supplierId ? state.supplier : null },
    movements: { findByIdempotencyKey: async (key: string) => state.movements.find(row => row.idempotencyKey === key) ?? null,
      record: async (row: any) => { state.movements.push(row); return row; } },
    auditLogs: { create: async (row: any) => { if (failAudit && state.audits.length + 1 === failAudit) throw new Error('Audit failed'); state.audits.push(row); return row; },
      findByEntity: async (_entity: string, id: string) => state.audits.filter(row => row.entityId === id) },
    supplierReturns: { findByMovement: async (id: string) => state.returns.find(row => row.movementId === id) ?? null,
      nextReturnNumber: async () => `SRT-${state.returns.length + 1}`, create: async (row: any) => { state.returns.push(row); return row; } },
  };
  const repositories = { ...tx, transaction: async (fn: any) => { const before = structuredClone(state); try { return await fn(tx); } catch (err) { state = before; throw err; } } } as unknown as Repositories;
  return { repositories, get state() { return state; }, failAudit: (index: number) => { failAudit = index; } };
}
describe('removal form validation', () => {
  it.each(['', ' ', '0', '-1', '2.5', '1e3', '0x10', '1,000', 'abc', '9007199254740992'])('rejects quantity %j', quantity => expect(removalFieldsSchema.safeParse(fields({ quantity })).success).toBe(false));
  it('accepts whole quantities and trims optional text', () => expect(request({ quantity: ' 12 ', note: ' hello ' })).toMatchObject({ quantity: 12, note: 'hello', reference: null }));
  it.each(['', 'SALE', 'INTERNAL_USE', 'PURCHASE'])('requires an allowed deliberate reason: %j', reason => expect(removalFieldsSchema.safeParse(fields({ reason })).success).toBe(false));
  it('requires supplier and return reason, and bounds identifiers and notes', () => {
    for (const patch of [{ reason: 'RETURN_TO_SUPPLIER' }, { mode: 'serial', serialNo: '' }, { mode: 'serial', serialNo: 'a'.repeat(121) }, { note: 'a'.repeat(1001) }, { reference: 'a'.repeat(101) }]) expect(removalFieldsSchema.safeParse(fields(patch)).success).toBe(false);
    expect(removalFieldsSchema.safeParse(fields({ mode: 'serial', serialNo: 'a'.repeat(120) })).success).toBe(true);
  });
});
describe('atomic removal and request identity', () => {
  it('records three identical operations and replays each without duplicate stock or audits', async () => {
    const db = memory();
    for (let index = 0; index < 3; index++) {
      const input = request({ idempotencyKey: `removal-${index}` });
      const first = await removeStock(input, db.repositories);
      const second = await removeStock(input, db.repositories);
      expect(first.replayed).toBe(false); expect(second).toEqual({ ...first, replayed: true });
    }
    expect(db.state.product.quantityOnHand).toBe(14); expect(db.state.movements).toHaveLength(3); expect(db.state.audits).toHaveLength(3);
  });
  it.each([{ actorId: 'other' }, { quantity: 3 }, { reason: 'LOSS' }, { note: 'different' }, { reference: 'other' }, { productId: '33333333-3333-4333-8333-333333333333' }])('rejects changed requests %j', async patch => {
    const db = memory(); const input = request(); await removeStock(input, db.repositories);
    await expect(recordStockOutInTransaction({ ...input, ...patch } as any, db.repositories)).rejects.toThrow('removal.keyMismatch');
    expect(db.state.movements).toHaveLength(1);
  });
  it('rejects keys from inbound movements', async () => {
    const db = memory(); await removeStock(request(), db.repositories); db.state.movements[0].type = 'IN';
    await expect(removeStock(request(), db.repositories)).rejects.toThrow('removal.keyMismatch');
  });
  it('replays recorded summaries even after product renaming', async () => {
    const db = memory(); const first = await removeStock(request(), db.repositories); db.state.product.name = 'Renamed';
    expect((await removeStock(request(), db.repositories)).receipt).toEqual(first.receipt);
  });
  it('rolls back quantity, movement and audit on audit failure and allows the same retry', async () => {
    const db = memory(); db.failAudit(1);
    await expect(removeStock(request(), db.repositories)).rejects.toThrow('Audit failed');
    expect(db.state.product.quantityOnHand).toBe(20); expect(db.state.movements).toHaveLength(0);
    db.failAudit(0); await removeStock(request(), db.repositories); expect(db.state.product.quantityOnHand).toBe(18);
  });
  it('commits supplier return and both audits together, including rollback of the second audit', async () => {
    const db = memory(true); const input = request({ mode: 'serial', serialNo: 'DEVICE', reason: 'RETURN_TO_SUPPLIER', supplierId, returnReason: 'DEFECTIVE' });
    db.failAudit(2); await expect(removeStock(input, db.repositories)).rejects.toThrow('Audit failed');
    expect(db.state.unit.status).toBe('IN_STOCK'); expect(db.state.returns).toHaveLength(0); expect(db.state.audits).toHaveLength(0);
    db.failAudit(0); const first = await removeStock(input, db.repositories);
    expect(first.receipt.supplierReturn?.returnNumber).toBe('SRT-1');
    expect((await removeStock(input, db.repositories)).replayed).toBe(true);
    expect(db.state.unit.status).toBe('RETURNED'); expect(db.state.audits).toHaveLength(2);
    await expect(removeStock({ ...input, returnReason: 'OTHER' }, db.repositories)).rejects.toThrow('removal.keyMismatch');
    await expect(removeStock({ ...input, supplierId: '33333333-3333-4333-8333-333333333333' }, db.repositories)).rejects.toThrow('removal.keyMismatch');
    await expect(removeStock({ ...input, serialNo: 'OTHER' }, db.repositories)).rejects.toThrow('removal.keyMismatch');
  });
  it('allows archived stock, rejects exhausted stock and unavailable suppliers', async () => {
    const db = memory(); await removeStock(request(), db.repositories);
    await expect(removeStock(request({ idempotencyKey: 'another-key', quantity: '19' }), db.repositories)).rejects.toMatchObject({ field: 'quantity', available: 18 });
    db.state.supplier.isActive = false;
    await expect(removeStock(request({ reason: 'RETURN_TO_SUPPLIER', supplierId, returnReason: 'OTHER', idempotencyKey: 'return-key' }), db.repositories)).rejects.toMatchObject({ field: 'supplierId' });
  });
  it('rejects non-stock devices without changing inventory', async () => {
    const db = memory(true); db.state.unit.status = 'SOLD';
    await expect(removeStock(request({ mode: 'serial', serialNo: 'DEVICE' }), db.repositories)).rejects.toMatchObject({ field: 'serialNo' });
    expect(db.state.movements).toHaveLength(0);
  });
});
