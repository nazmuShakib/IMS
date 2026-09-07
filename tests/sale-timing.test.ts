import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDhakaSaleTime, resolveSaleTime, saleOccurredAt, movementOccurredAt, settlementOccurredAt } from '@/lib/sale-timing';
import { checkoutCart } from '@/services/checkout';
import type { Repositories } from '@/repositories';
import type { Sale, StockMovement, ProductUnit } from '@/domain/types';
const now = new Date('2026-09-01T04:00:00.000Z');
const actual = '2026-08-31T17:30:00.000Z';
const earlier = { saleTiming: 'earlier' as const, saleOccurredAt: '2026-08-31T23:30' };
const productId = '11111111-1111-4111-8111-111111111111';
const cartId = '22222222-2222-4222-8222-222222222222';
function fixture(serial = false) {
  let saved: Sale | null = null;
  const movements: StockMovement[] = [];
  const unit = { id: '33333333-3333-4333-8333-333333333333', productId, serialNo: 'IMEI', status: 'IN_STOCK', costPrice: 400, warrantyDays: 15 } as ProductUnit;
  const tx = {
    carts: { findByIdForUpdate: async () => ({ id: cartId, actorId: 'actor' }), delete: vi.fn() },
    sales: { findByIdempotencyKey: async () => saved, nextInvoiceNumber: vi.fn(async () => 'INV-2026-1'), create: async (s: Sale) => { saved = s; return s; }, createItem: vi.fn() },
    products: { findById: async () => ({ id: productId, isActive: true, trackingType: serial ? 'SERIAL' : 'QUANTITY', quantityOnHand: 10, name: 'Product', sku: 'SKU', avgCostPrice: 500, defaultSalePrice: 1000 }), _applyQuantityDelta: vi.fn() },
    units: { findById: async () => unit, transitionStatus: vi.fn(async (_id, _from, status, patch) => Object.assign(unit, patch, { status })) },
    movements: { record: async (m: StockMovement) => { movements.push(m); return m; } },
    auditLogs: { create: vi.fn() },
    customers: { findById: async () => ({ id: productId, isActive: true }), update: vi.fn() },
    emi: { nextContractNumber: vi.fn(async () => 'EMI-2026-1'), createContract: vi.fn(), createInstallment: vi.fn() },
  } as unknown as Repositories;
  const repositories = { transaction: async (fn: (r: Repositories) => unknown) => fn(tx) } as Repositories;
  const input: Parameters<typeof checkoutCart>[0] = { cartId, actorId: 'actor', actorName: 'Manager', actorRole: 'MANAGER', idempotencyKey: 'timing-test-key', lines: [{ clientId: 'line', productId, unitId: serial ? unit.id : null, quantity: 1, actualUnitPrice: 1000 }], customerId: null, paymentMethod: 'CASH', tradeInPayoutMethod: 'CASH', paymentStatus: 'PAID', reference: null, note: null, isEmi: false, emiTermMonths: null, emiDownPayment: 0, emiFirstDueDate: null, identificationType: null, identificationNumber: null, auditIp: null, ...earlier };
  return { tx, repositories, input, movements, unit };
}
afterEach(() => vi.useRealTimers());
describe('actual sale time', () => {
  it.each(['', '2026-02-30T10:00', '2026-09-01T24:01', '2026-09-01', '2026-09-01T10:00Z'])('rejects invalid local date %s', value => expect(parseDhakaSaleTime(value)).toBeNull());
  it('uses Dhaka midnight boundaries and keeps old records compatible', () => {
    expect(parseDhakaSaleTime('2026-09-01T00:00')).toBe('2026-08-31T18:00:00.000Z');
    expect(saleOccurredAt({ completedAt: actual })).toBe(actual);
    expect(movementOccurredAt({ createdAt: actual })).toBe(actual);
    expect(settlementOccurredAt({ recordedAt: actual })).toBe(actual);
    expect(resolveSaleTime({}, 'STAFF', now)).toBe(now.toISOString());
  });
  it('enforces seven exact days, future limits, and permissions', () => {
    expect(resolveSaleTime({ saleTiming: 'earlier', saleOccurredAt: '2026-08-25T10:00' }, 'ADMIN', now)).toBe('2026-08-25T04:00:00.000Z');
    expect(() => resolveSaleTime({ saleTiming: 'earlier', saleOccurredAt: '2026-08-25T09:59' }, 'ADMIN', now)).toThrow('seven days');
    expect(() => resolveSaleTime({ saleTiming: 'earlier', saleOccurredAt: '2026-09-01T10:01' }, 'ADMIN', now)).toThrow('future');
    expect(() => resolveSaleTime(earlier, 'STAFF', now)).toThrow('Admins and Managers');
  });
  it.each([false, true])('records actual time and preserves entry cost (serial=%s)', async serial => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const f = fixture(serial); const sale = await checkoutCart(f.input, f.repositories);
    expect(sale).toMatchObject({ occurredAt: actual, createdAt: now.toISOString(), completedAt: now.toISOString(), amountPaid: 1000 });
    expect(f.movements[0]).toMatchObject({ occurredAt: actual, createdAt: now.toISOString(), unitCost: serial ? 400 : 500 });
    expect(f.tx.sales.nextInvoiceNumber).toHaveBeenCalledWith(now);
    expect(f.tx.auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ createdAt: now.toISOString(), after: expect.objectContaining({ occurredAt: actual, recordedAt: now.toISOString(), saleTiming: 'earlier' }) }));
    if (serial) expect(f.unit).toMatchObject({ soldAt: actual, warrantyExpiresAt: '2026-09-15T17:30:00.000Z' });
  });
  it('replays after the eligibility window expires and rejects changed timing', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); const f = fixture();
    const sale = await checkoutCart(f.input, f.repositories);
    vi.setSystemTime('2026-10-01T04:00:00Z');
    expect(await checkoutCart(f.input, f.repositories)).toBe(sale);
    expect(f.movements).toHaveLength(1);
    await expect(checkoutCart({ ...f.input, saleTiming: 'now' }, f.repositories)).rejects.toThrow('different sale time');
    await expect(checkoutCart({ ...f.input, saleOccurredAt: '2026-08-31T23:31' }, f.repositories)).rejects.toThrow('different sale time');
  });
  it('rejects unauthorized earlier checkout before writing inventory', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); const f = fixture();
    await expect(checkoutCart({ ...f.input, actorRole: 'STAFF' }, f.repositories)).rejects.toThrow('Admins and Managers');
    expect(f.movements).toEqual([]);
  });
  it('accepts an agreed EMI due date before entry, anchored to the sale date', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); const f = fixture();
    await checkoutCart({ ...f.input, isEmi: true, customerId: productId, emiTermMonths: 3, emiFirstDueDate: '2026-08-31T00:00:00.000Z', identificationType: 'NID', identificationNumber: '12345' }, f.repositories);
    expect(f.tx.emi.createContract).toHaveBeenCalledWith(expect.objectContaining({ firstDueDate: '2026-08-31T00:00:00.000Z', createdAt: now.toISOString(), status: 'OVERDUE' }));
    expect(f.tx.emi.createInstallment).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1, status: 'OVERDUE' }));
  });
});
