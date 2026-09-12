import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ role: vi.fn(), capability: vi.fn(), check: vi.fn() }));
vi.mock('@/lib/session', () => ({ requirePageRole: mocks.role, requireCapability: mocks.capability }));
vi.mock('@/repositories', () => ({ db: { reconciliation: { check: mocks.check } } }));
vi.mock('@/components/stock/StockConsistencyWorkspace', () => ({ StockConsistencyWorkspace: () => null }));
import Page from '@/app/(dashboard)/stock/reconcile/page';
import { checkStockAction } from '@/actions/reconciliation';
const report = { checkedAt: '2026-09-11T18:30:00Z', productsChecked: 3, productsMatching: 3, productsWithDifferences: 0, rows: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.check.mockResolvedValue(report); });
it('authorizes initial reads and returns the report', async () => {
  expect((await Page()).props.initialReport).toEqual(report);
  expect(mocks.role).toHaveBeenCalledWith('ADMIN', 'MANAGER');
  mocks.check.mockClear(); mocks.role.mockRejectedValueOnce(Error('Forbidden'));
  await expect(Page()).rejects.toThrow('Forbidden'); expect(mocks.check).not.toHaveBeenCalled();
});
it('checks rerun permission before reading and returns a fresh report', async () => {
  expect(await checkStockAction()).toEqual({ report });
  expect(mocks.capability).toHaveBeenCalledWith('CORRECT_STOCK');
  mocks.check.mockClear(); mocks.capability.mockRejectedValueOnce(Error('Forbidden'));
  await expect(checkStockAction()).rejects.toThrow('Forbidden'); expect(mocks.check).not.toHaveBeenCalled();
});
it('returns recoverable failure instead of a false healthy report', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.check.mockRejectedValue(Error('Database unavailable'));
  expect((await Page()).props.initialReport).toBeNull();
  expect(await checkStockAction()).toEqual({ error: 'consistency.failed' });
  log.mockRestore();
});
