import { describe, expect, it } from 'vitest';
import { receiveStock } from '@/services/stock';
import { receiveStockSchema, receiptFieldsSchema, receiptFormInput, parseReceiptCost, serialBatchSchema, type ReceiveStockInput } from '@/lib/stock-receipt';
import type { AuditLog, Product, ProductUnit, StockMovement } from '@/domain/types';
import type { Repositories } from '@/repositories';

const productId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const input = (patch: Partial<ReceiveStockInput> = {}): ReceiveStockInput => ({
  productId, unitCost: 12500, reason: 'PURCHASE', quantity: 3, actorId: 'staff-1', idempotencyKey: 'receipt-test-key', ...patch,
});

function memory(trackingType: 'SERIAL' | 'QUANTITY' = 'QUANTITY') {
  let product = { id: productId, name: 'Test product', sku: 'TEST-1', isActive: true, trackingType,
    quantityOnHand: 4, avgCostPrice: 10000 } as Product;
  let movements: StockMovement[] = [];
  let units: ProductUnit[] = [];
  let audits: AuditLog[] = [];
  let failAudit = false;
  const tx = {
    products: {
      findById: async (id: string) => id === productId ? product : null,
      _applyQuantityDelta: async (_id: string, quantity: number, avgCostPrice: number) => {
        product = { ...product, quantityOnHand: product.quantityOnHand + quantity, avgCostPrice }; return product;
      },
    },
    suppliers: { findById: async () => ({ id: supplierId, isActive: false }) },
    units: {
      findBySerial: async (serial: string) => units.find((unit) => unit.serialNo.toLowerCase() === serial.toLowerCase()) ?? null,
      findById: async (id: string) => units.find((unit) => unit.id === id) ?? null,
      createMany: async (values: ProductUnit[]) => { units.push(...values); return values; },
      transitionStatus: async (id: string, expected: string, status: ProductUnit['status'], patch: Partial<ProductUnit>) => {
        const index = units.findIndex((unit) => unit.id === id && unit.status === expected);
        if (index < 0) throw new Error('Concurrent status change');
        units[index] = { ...units[index]!, ...patch, status }; return units[index];
      },
    },
    movements: {
      findByIdempotencyKey: async (key: string) => movements.find((row) => row.idempotencyKey === key) ?? null,
      findById: async (id: string) => movements.find((row) => row.id === id) ?? null,
      record: async (row: StockMovement) => { movements.push(row); return row; },
    },
    auditLogs: {
      findByEntity: async (_entity: string, id: string) => audits.filter((row) => row.entityId === id),
      create: async (row: AuditLog) => { if (failAudit) throw new Error('Audit failed'); audits.push(row); return row; },
    },
  };
  const repositories = { ...tx, transaction: async <T>(fn: (tx: Repositories) => Promise<T>) => {
    const before = structuredClone({ product, movements, units, audits });
    try { return await fn(tx as unknown as Repositories); }
    catch (error) { ({ product, movements, units, audits } = before); throw error; }
  } } as unknown as Repositories;
  return { repositories, get product() { return product; }, get movements() { return movements; }, get audits() { return audits; }, get units() { return units; },
    deactivate: () => { product.isActive = false; }, failAudit: () => { failAudit = true; } };
}

describe('receipt validation', () => {
  it.each([['ABC', 'abc'], ['   '], Array.from({ length: 501 }, (_, index) => `UNIT-${index}`)])('rejects invalid serial batches', (...serials) => {
    expect(serialBatchSchema.safeParse(serials).success).toBe(false);
    expect(receiveStockSchema.safeParse(input({ quantity: undefined, serialNumbers: serials })).success).toBe(false);
  });
  it('trims identifiers before checking length and uniqueness', () => {
    expect(serialBatchSchema.parse([' ABC ', 'DEF'])).toEqual(['ABC', 'DEF']);
    expect(serialBatchSchema.safeParse([' ABC ', 'abc']).success).toBe(false);
  });
  it.each(['-1', 'abc123', '12abc', '1.234', '1,2', '', 'Infinity'])('rejects malformed cost %s', (value) => {
    expect(Number.isNaN(parseReceiptCost(value))).toBe(true);
  });
  it('accepts zero and correctly grouped BDT input', () => {
    expect(parseReceiptCost('৳ 12,500.25')).toBe(1250025);
    expect(parseReceiptCost('0')).toBe(0);
  });
  it('rejects returns at the receiving form boundary, while preserving the historical service reason', () => {
    const fd = new FormData();
    Object.entries({ productId, unitCost: '125', quantity: '3', reason: 'CUSTOMER_RETURN', idempotencyKey: 'receipt-test-key' }).forEach(([key, value]) => fd.set(key, value));
    expect(receiptFieldsSchema.safeParse(receiptFormInput(fd, 'QUANTITY')).success).toBe(false);
    expect(receiveStockSchema.safeParse(input({ reason: 'CUSTOMER_RETURN' })).success).toBe(true);
  });
});

describe('receiving transactions and replay', () => {
  it('records three identical bulk receipts independently and computes weighted average cost', async () => {
    const db = memory();
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const result = await receiveStock(input({ idempotencyKey: `receipt-key-${index}` }), db.repositories);
      ids.push(result.receipt.id);
      expect(result.receipt).toMatchObject({ count: 3, totalCost: 37500 });
    }
    expect(new Set(ids).size).toBe(3);
    expect(db.product.quantityOnHand).toBe(13);
    expect(db.movements).toHaveLength(3);
    expect(db.audits).toHaveLength(3);
    expect(db.product.avgCostPrice).toBe(11731);
  });
  it('replays every serialized movement with the original receipt snapshot and no additional writes', async () => {
    const db = memory('SERIAL');
    const request = input({ quantity: undefined, serialNumbers: ['ONE', 'TWO', 'THREE'], warrantyMonths: 12 });
    const first = await receiveStock(request, db.repositories, '127.0.0.1');
    // jsonb may reorder keys; the comparison must remain semantic.
    const audit = db.audits[0]!.after as Record<string, unknown>;
    audit.request = Object.fromEntries(Object.entries(audit.request as object).reverse());
    const replay = await receiveStock({ ...request, serialNumbers: ['three', 'ONE', 'TWO'] }, db.repositories);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.movements).toHaveLength(3);
    expect(replay.receipt.totalCost).toBe(37500);
    expect(db.units).toHaveLength(3);
    expect(db.audits).toHaveLength(1);
    expect(db.audits[0]!.ip).toBe('127.0.0.1');
  });
  it.each([{ actorId: 'staff-2' }, { quantity: 4 }, { unitCost: 9000 }, { note: 'changed' }, { warrantyMonths: 24 }])('rejects reuse for changed receipt %j', async (patch) => {
    const db = memory();
    await receiveStock(input(), db.repositories);
    await expect(receiveStock(input(patch), db.repositories)).rejects.toThrow('different receiving request');
    expect(db.movements).toHaveLength(1);
  });
  it('rolls back stock and movements when audit creation fails', async () => {
    const db = memory(); db.failAudit();
    await expect(receiveStock(input(), db.repositories)).rejects.toThrow('Audit failed');
    expect(db.product.quantityOnHand).toBe(4);
    expect(db.movements).toHaveLength(0);
    expect(db.audits).toHaveLength(0);
  });
  it('rolls back serialized units when audit creation fails', async () => {
    const db = memory('SERIAL'); db.failAudit();
    await expect(receiveStock(input({ quantity: undefined, serialNumbers: ['ONE'] }), db.repositories)).rejects.toThrow('Audit failed');
    expect(db.units).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
  });
  it('rejects inactive products and suppliers at commit', async () => {
    const db = memory();
    await expect(receiveStock(input({ supplierId }), db.repositories)).rejects.toThrow('supplier is no longer active');
    db.deactivate();
    await expect(receiveStock(input(), db.repositories)).rejects.toThrow('product is no longer active');
    expect(db.movements).toHaveLength(0);
  });
  it('revives only a voided serial under the same product', async () => {
    const db = memory('SERIAL');
    await receiveStock(input({ quantity: undefined, serialNumbers: ['ONE'] }), db.repositories);
    const unit = db.units[0]!; unit.status = 'VOID';
    const result = await receiveStock(input({ quantity: undefined, serialNumbers: ['ONE'], idempotencyKey: 'new-receipt-key', unitCost: 14000 }), db.repositories);
    expect(db.units).toHaveLength(1);
    expect(db.units[0]).toMatchObject({ id: unit.id, status: 'IN_STOCK', costPrice: 14000 });
    expect(result.movements[0]!.unitId).toBe(unit.id);
    await expect(receiveStock(input({ quantity: undefined, serialNumbers: ['ONE'], idempotencyKey: 'another-receipt-key' }), db.repositories)).rejects.toThrow('already in the system');
  });
  it('does not guess totals or create stock for an incomplete legacy receipt', async () => {
    const db = memory();
    await receiveStock(input(), db.repositories);
    db.audits[0]!.after = { movementIds: db.movements.map((row) => row.id) };
    await expect(receiveStock(input(), db.repositories)).rejects.toThrow('already recorded');
    expect(db.product.quantityOnHand).toBe(7);
  });
});
