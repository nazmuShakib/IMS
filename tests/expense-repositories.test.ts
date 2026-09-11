import { beforeEach, expect, it, vi } from 'vitest';
import { prismaRepositories as postgres } from '@/repositories/prisma';
import { jsonRepositories as json } from '@/repositories/json';
import { expenseRepositoryFilters, parseExpenseQuery, summarizeExpenses } from '@/lib/expense-query';
import { expenseWhere } from '@/repositories/prisma/expenses';
import { expenseCategories, expenseFixtures } from './expense-fixtures';
const mocks = vi.hoisted(() => ({ count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), categories: vi.fn(), memory: new Map<string, unknown[]>() }));
vi.mock('@/lib/prisma', () => ({ prisma: { operatingExpense: { count: mocks.count, aggregate: mocks.aggregate, groupBy: mocks.groupBy, findMany: mocks.findMany }, expenseCategory: { findMany: mocks.categories } } }));
vi.mock('@/repositories/json/store', async original => ({ ...await original<typeof import('@/repositories/json/store')>(), readAll: async (key: string) => mocks.memory.get(key) ?? [] }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.memory.set('operating-expenses', expenseFixtures()); mocks.memory.set('expense-categories', expenseCategories);
  mocks.count.mockResolvedValue(2125); mocks.aggregate.mockResolvedValue({ _count: 1700, _sum: { amount: 1020000 }, _min: { amount: 200 }, _max: { amount: 1000 } });
  mocks.groupBy.mockResolvedValue([]); mocks.findMany.mockResolvedValue([]); mocks.categories.mockResolvedValue([]);
});
it('pages JSON beyond 2000 matches and exports all rows with stable summaries', async () => {
  const query = parseExpenseQuery({ page: '999', pageSize: '100' });
  const page = await json.operatingExpenses.findPage(query), first = await json.operatingExpenses.findPage({ ...query, page: 1 });
  expect(page).toMatchObject({ page: 22, totalCount: 2125, pageCount: 22 }); expect(page.rows).toHaveLength(25);
  expect(first.rows).toHaveLength(100); expect(first.summary).toEqual(page.summary);
  expect(page.summary).toEqual(summarizeExpenses(expenseFixtures(), expenseCategories));
  expect(await json.operatingExpenses.findForExport(query)).toHaveLength(2125);
});
it('includes inactive categories and preserves deterministic amount/date ties', async () => {
  for (const order of ['newest', 'oldest', 'amount-desc', 'amount-asc']) {
    const rows = await json.operatingExpenses.findForExport(parseExpenseQuery({ categoryId: 'old', order }));
    expect(rows.every(row => row.categoryId === 'old')).toBe(true);
    const tie = rows.filter(row => row.amount === rows[0]?.amount); expect(tie.map(row => row.id)).toEqual(tie.map(row => row.id).sort());
  }
});
it('bounds PostgreSQL table reads and calculates full filtered aggregates at the source', async () => {
  const query = parseExpenseQuery({ page: '999', pageSize: '100', minAmount: '0', categoryId: 'old' });
  const page = await postgres.operatingExpenses.findPage(query);
  expect(page).toMatchObject({ page: 22, totalCount: 2125, summary: { activeCount: 1700, voidedCount: 425 } });
  const where = expenseWhere(expenseRepositoryFilters(query));
  expect(mocks.count).toHaveBeenCalledWith({ where });
  expect(mocks.findMany).toHaveBeenCalledWith({ where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: 2100, take: 100 });
  expect(mocks.aggregate.mock.calls[0]![0].where).toEqual({ AND: [where, { status: 'ACTIVE' }] });
  expect(mocks.groupBy).toHaveBeenCalledTimes(2);
});
it('exports PostgreSQL without the legacy row limit and treats wildcard searches literally', async () => {
  const query = parseExpenseQuery({ query: '50%_discount', page: '2' });
  await postgres.operatingExpenses.findForExport(query);
  const args = mocks.findMany.mock.calls[0]![0]; expect(args).not.toHaveProperty('take'); expect(args).not.toHaveProperty('skip');
  expect(args.where.OR[0].expenseNumber.contains).toBe('50\\%\\_discount');
});
