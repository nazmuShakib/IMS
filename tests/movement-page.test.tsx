import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), page: vi.fn(), products: vi.fn(), users: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: mocks.session }));
vi.mock('@/repositories', () => ({ db: { movements: { findPage: mocks.page }, products: { findAll: mocks.products }, users: { findAll: mocks.users } } }));
vi.mock('@/components/stock/MovementWorkspace', () => ({ MovementWorkspace: () => null }));
import Page from '@/app/(dashboard)/stock/movements/page';
import { ledgerData, ledgerMovement } from './movement-fixtures';
import { movementPageFromRows, parseMovementQuery } from '@/lib/movement-query';
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockReset().mockResolvedValue({ role: 'STAFF' });
  const data = ledgerData([ledgerMovement(1), ledgerMovement(2, { reason: 'CORRECTION', reversesId: 'm0001', quantity: -1 })]);
  mocks.page.mockResolvedValue(movementPageFromRows(data, parseMovementQuery({})));
  mocks.products.mockResolvedValue([{ id: 'p', name: 'Phone', sku: 'PHONE', avgCostPrice: 12345 }]);
  mocks.users.mockResolvedValue([{ id: 'u', name: 'Auth name', email: 'private@example.invalid' }]);
});
it('strips costs and private option fields from the complete staff payload', async () => {
  const page = await Page({ searchParams: Promise.resolve({}) });
  const payload = JSON.stringify(page.props);
  for (const key of ['unitCost', 'avgCostPrice', 'email', 'idempotencyKey']) expect(payload).not.toContain(key);
  expect(page.props.users).toEqual([{ id: 'u', name: 'Auth name' }]);
});
it('does not query movements for invalid filters and preserves invalid inputs for correction', async () => {
  const page = await Page({ searchParams: Promise.resolve({ from: '2026-02-31', reason: 'LOSS' }) });
  expect(mocks.page).not.toHaveBeenCalled(); expect(page.props.initialErrors.from).toBe('catalog.invalidDate');
  expect(page.props.invalidValues).toMatchObject({ from: '2026-02-31', reason: 'LOSS' });
});
it('authorizes before repository reads and passes server query parameters', async () => {
  await Page({ searchParams: Promise.resolve({ reason: 'SALE', page: '3', pageSize: '50' }) });
  expect(mocks.page).toHaveBeenCalledWith(expect.objectContaining({ reason: 'SALE', page: 3, pageSize: 50 }));
  vi.clearAllMocks(); mocks.session.mockRejectedValueOnce(Error('Unauthenticated'));
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('Unauthenticated'); expect(mocks.page).not.toHaveBeenCalled();
});
