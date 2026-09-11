import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), correct: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireCapability: mocks.permission }));
vi.mock('@/lib/audit', () => ({ requestAuditIp: async () => '127.0.0.1' }));
vi.mock('@/repositories', () => ({ db: {} }));
vi.mock('@/services/stock', () => ({ correctMovement: mocks.correct }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
import { reverseMovementAction } from '@/actions/stock';
const data = () => { const fd = new FormData(); fd.set('movementId', 'movement'); fd.set('note', '  Wrong receipt  '); fd.set('idempotencyKey', 'same-request'); return fd; };
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockReset().mockResolvedValue({ id: 'admin' }); mocks.correct.mockReset(); mocks.refresh.mockReset(); });
it('checks the live correction capability before accessing inventory', async () => {
  mocks.permission.mockRejectedValueOnce(Error('Forbidden'));
  await expect(reverseMovementAction({}, data())).rejects.toThrow('Forbidden'); expect(mocks.correct).not.toHaveBeenCalled();
  expect(mocks.permission).toHaveBeenCalledWith('CORRECT_STOCK');
});
it('passes identity and audit IP into the transaction and returns only a safe receipt', async () => {
  mocks.correct.mockResolvedValue({ id: 'correction', productId: 'p', quantity: -1, createdAt: '2026-09-02', unitCost: 12345 });
  const result = await reverseMovementAction({}, data());
  expect(mocks.correct).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'admin', note: 'Wrong receipt', idempotencyKey: 'same-request' }), {}, '127.0.0.1');
  expect(result.receipt?.id).toBe('correction'); expect(JSON.stringify(result)).not.toContain('unitCost');
});
it('does not turn a committed correction into failure when refresh fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.correct.mockResolvedValue({ id: 'correction', productId: 'p', quantity: -1, createdAt: '2026-09-02' });
  mocks.refresh.mockImplementation(() => { throw Error('Cache unavailable'); });
  expect((await reverseMovementAction({}, data())).receipt?.id).toBe('correction'); log.mockRestore();
});
it('distinguishes a rejected correction from an uncertain connection outcome', async () => {
  mocks.correct.mockRejectedValueOnce(Error('ledger.laterActivity'));
  expect(await reverseMovementAction({}, data())).toEqual({ outcome: 'rejected', error: 'ledger.laterActivity' });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {}); mocks.correct.mockRejectedValueOnce(Error('Connection lost'));
  expect(await reverseMovementAction({}, data())).toEqual({ outcome: 'unconfirmed', error: 'ledger.unconfirmed' }); log.mockRestore();
});
