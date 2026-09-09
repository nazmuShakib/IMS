import { beforeEach, expect, it, vi } from 'vitest';
import { prismaRepositories as postgres } from '@/repositories/prisma';
import { jsonRepositories as json } from '@/repositories/json';
const mocks = vi.hoisted(() => ({ customerCount: vi.fn(), customers: vi.fn(), saleCount: vi.fn(), sales: vi.fn(), aggregate: vi.fn(), memory: new Map<string, any[]>() }));
vi.mock('@/lib/prisma', () => ({ prisma: { customer: { count: mocks.customerCount, findMany: mocks.customers }, sale: { count: mocks.saleCount, aggregate: mocks.aggregate, findMany: mocks.sales } } }));
vi.mock('@/repositories/json/store', async original => ({ ...await original<typeof import('@/repositories/json/store')>(), readAll: async (name: string) => mocks.memory.get(name) ?? [] }));
beforeEach(() => { vi.clearAllMocks(); mocks.memory.clear(); mocks.customerCount.mockResolvedValue(125); mocks.customers.mockResolvedValue([]); mocks.saleCount.mockResolvedValue(61); mocks.aggregate.mockResolvedValue({ _count: 60, _sum: { total: 100000 } }); mocks.sales.mockResolvedValue([]); });
it('bounds PostgreSQL reads, selects minimal rows, and counts the same customer filter', async () => {
  const result = await postgres.customers.findPage({ q: '+880 1712-345678', page: 999, pageSize: 50 });
  expect(result).toMatchObject({ page: 3, pageCount: 3, totalCount: 125 });
  const args = mocks.customers.mock.calls[0]![0];
  expect(args).toMatchObject({ take: 50, skip: 100, select: { id: true, name: true, phone: true, isActive: true }, orderBy: [{ name: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] });
  expect(args.where.OR).toContainEqual({ phoneNormalized: '01712345678' });
  expect(args.where).not.toHaveProperty('isActive'); expect(mocks.customerCount).toHaveBeenCalledWith({ where: args.where });
});
it('aggregates completed history independently of the bounded invoice page', async () => {
  expect(await postgres.sales.findCustomerHistoryPage('c1', { page: 9, pageSize: 25 })).toMatchObject({ page: 3, totalCount: 61, completedPurchases: 60, lifetimeSales: 100000 });
  expect(mocks.aggregate).toHaveBeenCalledWith({ where: { customerId: 'c1', status: 'COMPLETED' }, _count: true, _sum: { total: true } });
  expect(mocks.sales).toHaveBeenCalledWith({ where: { customerId: 'c1' }, orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], take: 25, skip: 50 });
});
it('uses the JSON adapter for inactive canonical-phone search and stable history summaries', async () => {
  mocks.memory.set('customers', [{ id: 'c1', name: 'Ali', phone: '01712345678', phoneNormalized: '01712345678', isActive: false, createdAt: '2026-01-01' }]);
  const result = await json.customers.findPage({ q: '+8801712345678', page: 1, pageSize: 25 }); expect(result.totalCount).toBe(1); expect(result.rows[0]!.isActive).toBe(false);
  mocks.memory.set('sales', [{ id: 's1', customerId: 'c1', status: 'COMPLETED', total: 500, occurredAt: '2026-01-01' }, { id: 's2', customerId: 'c1', status: 'VOIDED', total: 1000, occurredAt: '2026-02-01' }]);
  expect(await json.sales.findCustomerHistoryPage('c1', { page: 1, pageSize: 25 })).toMatchObject({ totalCount: 2, completedPurchases: 1, lifetimeSales: 500 });
});
