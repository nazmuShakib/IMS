import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reconcile: vi.fn() }));
vi.mock('@/repositories', () => ({ db: { reconciliation: { check: mocks.reconcile } } }));
let originalExitCode: typeof process.exitCode;
beforeEach(() => { vi.resetModules(); mocks.reconcile.mockReset(); originalExitCode = process.exitCode; process.exitCode = undefined; });
afterEach(() => { process.exitCode = originalExitCode; vi.restoreAllMocks(); });
it('reports a successful check without setting a failing exit status', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {}); mocks.reconcile.mockResolvedValue({ rows: [], valuation: { rows: [] } });
  await import('../scripts/reconcile');
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining('Reconciliation OK')));
  expect(process.exitCode).toBeUndefined();
});
it('reports differences and sets exit status 1', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.reconcile.mockResolvedValue({ rows: [{ sku: 'GLASS', onHand: 9, ledgerSum: 10, drift: -1 }], valuation: { rows: [] } });
  await import('../scripts/reconcile');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(error).toHaveBeenCalledWith('GLASS: on-hand=9, ledger=10, drift=-1');
});
it('sets exit status 1 on database failure instead of reporting success', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {}), failure = Error('Unavailable');
  mocks.reconcile.mockRejectedValue(failure); await import('../scripts/reconcile');
  await vi.waitFor(() => expect(process.exitCode).toBe(1)); expect(error).toHaveBeenCalledWith(failure);
});

it.each([null, 1000])('fails when quantities match but valuation is unverified or different (%s)', async expectedValue => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.reconcile.mockResolvedValue({ rows: [], valuation: { rows: [{ sku: 'GLASS', recordedValue: 2000, expectedValue, difference: expectedValue === null ? null : 1000, units: [], issue: expectedValue === null ? 'valuation.historyMissing' : null }] } });
  await import('../scripts/reconcile'); await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(error).toHaveBeenCalledWith(expect.stringContaining('GLASS: recorded value='));
});
