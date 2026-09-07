import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ capability: vi.fn(), remove: vi.fn(), revalidate: vi.fn(), findUnit: vi.fn(), findProduct: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireCapability: mocks.capability, getSession: vi.fn(), canSeeCosts: vi.fn() }));
vi.mock('@/lib/audit', () => ({ requestAuditIp: async () => null, writeAudit: vi.fn() }));
vi.mock('@/repositories', () => ({ db: { units: { findBySerial: mocks.findUnit }, products: { findById: mocks.findProduct } } }));
vi.mock('@/services/stock-removal', () => ({ removeStock: mocks.remove }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { lookupSerial, stockOutAction } from '@/actions/stock';
import { RemovalValidationError } from '@/lib/stock-removal';
const id = '11111111-1111-4111-8111-111111111111';
const data = (patch = {}) => {
  const fd = new FormData(); Object.entries({ mode: 'bulk', productId: id, quantity: '2', reason: 'DAMAGE', reference: '', note: '', idempotencyKey: 'request-key', ...patch }).forEach(([key, value]) => fd.set(key, String(value))); return fd;
};
beforeEach(() => { vi.clearAllMocks(); mocks.capability.mockReset().mockResolvedValue({ id: 'admin', role: 'ADMIN' }); mocks.remove.mockReset(); mocks.revalidate.mockReset(); });
describe('removal action boundaries', () => {
  it('authorizes lookup and removal before accessing stock', async () => {
    mocks.capability.mockRejectedValue(new Error('Forbidden'));
    await expect(stockOutAction({}, data())).rejects.toThrow('Forbidden'); await expect(lookupSerial({}, data({ serialNo: 'DEVICE' }))).rejects.toThrow('Forbidden');
    expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.findUnit).not.toHaveBeenCalled(); expect(mocks.capability).toHaveBeenCalledWith('REMOVE_STOCK');
  });
  it.each([{ quantity: '1e3' }, { quantity: '0x10' }, { quantity: '' }, { reason: 'SALE' }, { reason: 'INTERNAL_USE' }, { note: 'a'.repeat(1001) }])('rejects invalid posted input %j', async patch => {
    const result = await stockOutAction({}, data(patch)); expect(result.outcome).toBe('rejected'); expect(Object.keys(result.fieldErrors!)).not.toHaveLength(0); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('returns stock conflicts beside the quantity with current availability', async () => {
    mocks.remove.mockRejectedValue(new RemovalValidationError('quantity', 'removal.insufficient', 1));
    expect(await stockOutAction({}, data())).toMatchObject({ outcome: 'rejected', fieldErrors: { quantity: 'removal.insufficient' }, available: 1 });
  });
  it('reports an unconfirmed result without claiming rollback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.remove.mockRejectedValue(new Error('Connection lost'));
    expect(await stockOutAction({}, data())).toEqual({ outcome: 'unconfirmed', error: 'removal.unconfirmed' }); log.mockRestore();
  });
  it('preserves recorded results even when cache refresh fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const saved = { receipt: { movementId: 'movement', productId: id, productName: 'Saved product' }, replayed: true };
    mocks.remove.mockResolvedValue(saved); mocks.revalidate.mockImplementation(() => { throw new Error('Cache failed'); });
    expect(await stockOutAction({}, data())).toEqual(saved); log.mockRestore();
  });
  it('validates the full device-number limit before lookup and returns localized lookup failures', async () => {
    expect((await lookupSerial({}, data({ serialNo: 'A'.repeat(121) }))).error).toBe('removal.serialLong'); expect(mocks.findUnit).not.toHaveBeenCalled();
    mocks.findUnit.mockResolvedValue(null); expect((await lookupSerial({}, data({ serialNo: 'A'.repeat(120) }))).error).toBe('removal.serialNotFound');
    expect(mocks.findUnit).toHaveBeenCalledWith('A'.repeat(120));
  });
});
