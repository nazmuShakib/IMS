import { describe, expect, it, vi } from 'vitest';
import { correctMovement, correctMovementInTransaction } from '@/services/stock';
import type { Repositories } from '@/repositories';
import type { StockMovement, Product, AuditLog, ProductUnit } from '@/domain/types';
import { bulkCorrectionState } from '@/lib/movement-correction';

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const movement = (n: number, patch: Partial<StockMovement> = {}): StockMovement => ({ id: id(n), productId: id(99), unitId: null, type: 'IN', reason: 'PURCHASE', quantity: 10, unitCost: 10000, unitPrice: null, supplierId: null, customerName: null, customerPhone: null, reference: null, note: null, actorId: 'admin', idempotencyKey: `receipt-${n}`, reversesId: null, createdAt: `2026-09-${String(n).padStart(2, '0')}T00:00:00.000Z`, ...patch });
function memory(rows = [movement(1), movement(2, { unitCost: 20000 })], serial = false) {
  let state = { product: { id: id(99), trackingType: serial ? 'SERIAL' : 'QUANTITY', quantityOnHand: 20, avgCostPrice: 15000 } as Product,
    movements: structuredClone(rows), audits: [] as AuditLog[], unit: { id: id(88), status: 'SOLD' } as ProductUnit };
  let failAudit = false, conflict = false;
  const tx = {
    movements: {
      findById: async (id: string) => state.movements.find(row => row.id === id) ?? null,
      findByIdempotencyKey: async (key: string) => state.movements.find(row => row.idempotencyKey === key) ?? null,
      findByProduct: async () => structuredClone(state.movements),
      record: async (row: StockMovement) => { state.movements.push(row); return row; },
    },
    products: { findById: async () => structuredClone(state.product), _applyQuantityDelta: async (_id: string, delta: number, average: number) => { state.product.quantityOnHand += delta; state.product.avgCostPrice = average; return state.product; } },
    units: { findById: async () => state.unit, transitionStatus: async (_id: string, expected: string, next: ProductUnit['status']) => { if (state.unit.status !== expected) throw Error('status conflict'); state.unit.status = next; return state.unit; } },
    supplierReturns: { findByMovement: async () => ({ id: 'return' }) }, usedDeviceAcquisitions: { findByUnit: async () => ({ tradeInSaleId: 'sale' }) }, sales: { findById: async () => ({ invoiceNumber: 'INV-1' }) },
    auditLogs: { create: async (row: AuditLog) => { if (failAudit) throw Error('audit failed'); state.audits.push(row); return row; } },
  };
  let queue = Promise.resolve<unknown>(null);
  const repositories = { ...tx, transaction: vi.fn((fn: (tx: Repositories) => Promise<unknown>) => {
    const run = queue.then(async () => {
      const before = structuredClone(state);
      try { if (conflict) { conflict = false; throw Object.assign(Error('conflict'), { code: 'P2034' }); } return await fn(tx as unknown as Repositories); }
      catch (error) { state = before; throw error; }
    }); queue = run.catch(() => {}); return run;
  }) } as unknown as Repositories;
  return { repositories, get state() { return state; }, failAudit: () => { failAudit = true; }, conflict: () => { conflict = true; } };
}
const input = (n = 2, patch = {}) => ({ movementId: id(n), actorId: 'admin', note: ' Wrong receipt ', idempotencyKey: `correction-${n}`, ...patch });

describe('ledger corrections', () => {
  it('restores the previous average cost and audits in the stock transaction', async () => {
    const f = memory(); const result = await correctMovement(input(), f.repositories, '127.0.0.1');
    expect(f.state.product).toMatchObject({ quantityOnHand: 10, avgCostPrice: 10000 });
    expect(result).toMatchObject({ quantity: -10, reason: 'CORRECTION', reversesId: id(2), note: 'Wrong receipt' });
    expect(f.state.audits).toEqual([expect.objectContaining({ entityId: result.id, ip: '127.0.0.1', after: result })]);
    expect(f.repositories.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('reverses an older receipt without undoing the later receipt', async () => {
    const f = memory(); await correctMovement(input(1), f.repositories);
    expect(f.state.product).toMatchObject({ quantityOnHand: 10, avgCostPrice: 20000 });
    await correctMovement(input(2), f.repositories);
    expect(f.state.product).toMatchObject({ quantityOnHand: 0, avgCostPrice: 0 });
    expect(f.state.movements.reduce((sum, row) => sum + row.quantity, 0)).toBe(0);
  });
  it('rolls back stock, correction and audit on audit failure', async () => {
    const f = memory(); f.failAudit(); await expect(correctMovement(input(), f.repositories)).rejects.toThrow('audit failed');
    expect(f.state.product).toMatchObject({ quantityOnHand: 20, avgCostPrice: 15000 }); expect(f.state.movements).toHaveLength(2); expect(f.state.audits).toEqual([]);
  });
  it('reverses either same-price gorilla-glass receipt independently', async () => {
    for (const target of [1, 2]) {
      const f = memory([movement(1, { quantity: 40, unitCost: 3000 }), movement(2, { quantity: 9, unitCost: 3000 })]);
      f.state.product.quantityOnHand = 49; f.state.product.avgCostPrice = 3000;
      await correctMovement(input(target), f.repositories);
      expect(f.state.product).toMatchObject({ quantityOnHand: target === 1 ? 9 : 40, avgCostPrice: 3000 });
    }
  });
  it('allows later stock-out when the remaining receipts cover it at the same recorded cost', async () => {
    const rows = [movement(1), movement(2), movement(3, { reason: 'SALE', type: 'OUT', quantity: -5 })];
    const f = memory(rows); f.state.product.quantityOnHand = 15; f.state.product.avgCostPrice = 10000;
    await correctMovement(input(1), f.repositories);
    expect(f.state.product).toMatchObject({ quantityOnHand: 5, avgCostPrice: 10000 });
    expect(f.state.movements.find(row => row.id === id(3))).toEqual(rows[2]);
  });
  it('rejects receipts already needed for stock-out without changing stock or audit', async () => {
    const f = memory([movement(1), movement(2, { reason: 'SALE', type: 'OUT', quantity: -5 })]);
    f.state.product.quantityOnHand = 5; f.state.product.avgCostPrice = 10000;
    await expect(correctMovement(input(1), f.repositories)).rejects.toThrow('ledger.receiptInUse');
    expect(f.state.product.quantityOnHand).toBe(5); expect(f.state.movements).toHaveLength(2); expect(f.state.audits).toEqual([]);
  });
  it('protects recorded sale costs when reversing a differently priced receipt', async () => {
    const f = memory([movement(1), movement(2, { unitCost: 20000 }), movement(3, { reason: 'SALE', type: 'OUT', quantity: -5, unitCost: 15000 })]);
    f.state.product.quantityOnHand = 15;
    await expect(correctMovement(input(1), f.repositories)).rejects.toThrow('ledger.receiptCostDependency');
    expect(f.state.product).toMatchObject({ quantityOnHand: 15, avgCostPrice: 15000 }); expect(f.state.audits).toEqual([]);
  });
  it('replays simultaneous identical requests without duplicate stock or audits', async () => {
    const f = memory(); const [a, b] = await Promise.all([correctMovement(input(), f.repositories), correctMovement(input(), f.repositories)]);
    expect(a).toEqual(b); expect(f.state.movements).toHaveLength(3); expect(f.state.audits).toHaveLength(1);
  });
  it.each([{ actorId: 'other' }, { note: 'different' }, { movementId: id(1) }])('rejects altered retry identity %j', async patch => {
    const f = memory(); await correctMovement(input(), f.repositories);
    await expect(correctMovement(input(2, patch), f.repositories)).rejects.toThrow('ledger.keyMismatch'); expect(f.state.audits).toHaveLength(1);
  });
  it('retries serialization conflicts and rejects a different-key double reversal', async () => {
    const f = memory(); f.conflict(); await correctMovement(input(), f.repositories);
    expect(f.repositories.transaction).toHaveBeenCalledTimes(2);
    await expect(correctMovement(input(2, { idempotencyKey: 'another-key' }), f.repositories)).rejects.toThrow('already been reversed');
  });
  it.each(['WARRANTY_REPLACEMENT', 'CUSTOMER_RETURN', 'DAMAGE'] as const)('blocks warranty-owned %s before touching stock', async reason => {
    const f = memory([movement(2, { reason, unitId: id(88), warrantyClaimId: id(77), quantity: -1 })], true);
    await expect(correctMovement(input(), f.repositories)).rejects.toThrow('ledger.warrantyOwned'); expect(f.state.unit.status).toBe('SOLD'); expect(f.state.movements).toHaveLength(1);
  });
  it.each(['SALE', 'RETURN_TO_SUPPLIER', 'TRADE_IN'] as const)('keeps %s in its owning workflow', async reason => {
    const f = memory([movement(2, { reason, unitId: id(88) })], true);
    await expect(correctMovement(input(), f.repositories)).rejects.toThrow(/invoice|Supplier Returns/); expect(f.state.movements).toHaveLength(1);
  });
  it('enforces bulk dependencies even when a managed workflow permits sale correction', async () => {
    const f = memory([movement(1), movement(2, { reason: 'SALE', type: 'OUT', quantity: -1 }), movement(3)]);
    await expect(correctMovementInTransaction(input(2), f.repositories, { allowSale: true })).rejects.toThrow('ledger.laterActivity');
  });
  it('rejects inconsistent quantity, cost, and malformed correction history', () => {
    const rows = [movement(1), movement(2, { unitCost: 20000 })];
    for (const product of [{ quantityOnHand: 21, avgCostPrice: 15000 }, { quantityOnHand: 20, avgCostPrice: 17000 }]) expect(() => bulkCorrectionState(product, rows[1]!, rows)).toThrow('ledger.inconsistentHistory');
    expect(() => bulkCorrectionState({ quantityOnHand: 20, avgCostPrice: 15000 }, rows[1]!, [...rows, movement(3, { reason: 'CORRECTION', reversesId: 'missing' })])).toThrow('ledger.inconsistentHistory');
  });
  it('replays weighted rounding exactly and restores an outbound quantity', async () => {
    const rows = [movement(1, { quantity: 2, unitCost: 101 }), movement(2, { quantity: 1, unitCost: 102 }), movement(3, { reason: 'DAMAGE', type: 'OUT', quantity: -1, unitCost: 101 })];
    const f = memory(rows); f.state.product.quantityOnHand = 2; f.state.product.avgCostPrice = 101;
    await correctMovement(input(3), f.repositories); expect(f.state.product).toMatchObject({ quantityOnHand: 3, avgCostPrice: 101 });
  });
});
