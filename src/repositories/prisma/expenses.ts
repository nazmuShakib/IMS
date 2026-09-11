import type { Prisma } from '@prisma/client';
import type { OperatingExpense } from '@/domain/types';
import { expenseRepositoryFilters, type ExpenseQuery, type ExpensePage } from '@/lib/expense-query';
import type { OperatingExpenseFilters } from '../types';

export function expenseWhere(filters: OperatingExpenseFilters = {}): Prisma.OperatingExpenseWhereInput {
  const query = filters.query?.trim();
  return {
    expenseDate: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    categoryId: filters.categoryId, paymentMethod: filters.paymentMethod, recordedById: filters.recordedById, status: filters.status,
    amount: filters.minAmount !== undefined || filters.maxAmount !== undefined ? { gte: filters.minAmount, lte: filters.maxAmount } : undefined,
    ...(query ? { OR: ['expenseNumber', 'description', 'paidTo', 'reference'].map(key => ({ [key]: { contains: query.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } })) } : {}),
  };
}
export function expenseOrder(filters: OperatingExpenseFilters = {}): Prisma.OperatingExpenseOrderByWithRelationInput[] {
  return [
    ...(filters.order === 'amount-desc' || filters.order === 'amount-asc' ? [{ amount: filters.order === 'amount-desc' ? 'desc' as const : 'asc' as const }] : []),
    { expenseDate: filters.order === 'oldest' ? 'asc' : 'desc' }, { createdAt: filters.order === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' },
  ];
}
export async function readExpensePage(client: Prisma.TransactionClient, query: ExpenseQuery, map: (row: Prisma.OperatingExpenseGetPayload<object>) => OperatingExpense): Promise<ExpensePage> {
  const filters = expenseRepositoryFilters(query), where = expenseWhere(filters);
  const active = { AND: [where, { status: 'ACTIVE' as const }] };
  const [totalCount, totals, groups, methods] = await Promise.all([
    client.operatingExpense.count({ where }),
    client.operatingExpense.aggregate({ where: active, _count: true, _sum: { amount: true }, _min: { amount: true }, _max: { amount: true } }),
    client.operatingExpense.groupBy({ by: ['categoryId'], where: active, _sum: { amount: true }, orderBy: [{ _sum: { amount: 'desc' } }, { categoryId: 'asc' }] }),
    client.operatingExpense.groupBy({ by: ['paymentMethod'], where: active, _sum: { amount: true }, orderBy: [{ _sum: { amount: 'desc' } }, { paymentMethod: 'asc' }] }),
  ]);
  const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize)), page = Math.min(query.page, pageCount);
  const [rows, categories] = await Promise.all([
    client.operatingExpense.findMany({ where, orderBy: expenseOrder(filters), skip: (page - 1) * query.pageSize, take: query.pageSize }),
    client.expenseCategory.findMany({ where: { id: { in: groups.map(g => g.categoryId) } }, select: { id: true, name: true } }),
  ]);
  const names = new Map(categories.map(c => [c.id, c.name]));
  return { rows: rows.map(map), page, pageSize: query.pageSize, pageCount, totalCount, summary: {
    activeTotal: totals._sum.amount ?? 0, activeCount: totals._count, voidedCount: totalCount - totals._count, lowest: totals._min.amount ?? 0, highest: totals._max.amount ?? 0,
    byCategory: groups.map(g => ({ categoryId: g.categoryId, name: names.get(g.categoryId) ?? '', amount: g._sum.amount ?? 0 })),
    byPaymentMethod: methods.map(g => ({ paymentMethod: g.paymentMethod, amount: g._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount || a.paymentMethod.localeCompare(b.paymentMethod)),
  } };
}
