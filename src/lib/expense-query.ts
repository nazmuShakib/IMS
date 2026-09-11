import { OPERATING_EXPENSE_STATUSES, PAYMENT_METHODS, type ExpenseCategory, type OperatingExpense, type OperatingExpenseStatus, type PaymentMethod } from '@/domain/types';
import { one, paginate, type PageRequest, type PageResult, type RawParams } from './catalog-query';
import type { ExpenseOrder, OperatingExpenseFilters } from '@/repositories/types';
import type { Locale } from './i18n/config';

export const MAX_EXPENSE_PAISA = 2_147_483_647;
export function validExpenseDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseExpenseAmount(value: string): number {
  const text = value.trim().replace(/^৳\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid amount.');
  const [whole, fraction = ''] = text.replaceAll(',', '').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > MAX_EXPENSE_PAISA) throw new Error('Amount exceeds the supported limit.');
  return amount;
}
export function expenseDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function expenseDisplayDate(value: string, locale: Locale = 'en'): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T00:00:00+06:00` : value));
}
export interface ExpenseQuery extends PageRequest {
  query?: string; from?: string; to?: string; categoryId?: string; paymentMethod?: PaymentMethod;
  recordedById?: string; status?: OperatingExpenseStatus; minAmount?: number; maxAmount?: number;
  order: ExpenseOrder; groupBy: 'none' | 'category' | 'payment';
}
export interface ExpenseSummary {
  activeTotal: number; activeCount: number; voidedCount: number; lowest: number; highest: number;
  byCategory: Array<{ categoryId: string; name: string; amount: number }>;
  byPaymentMethod: Array<{ paymentMethod: PaymentMethod; amount: number }>;
}
export interface ExpensePage extends PageResult<OperatingExpense> { summary: ExpenseSummary }
export class ExpenseQueryError extends Error {
  constructor(public details: Record<string, string>) { super('Invalid expense filters.'); }
}
export function parseExpenseQuery(raw: RawParams, _now?: Date): ExpenseQuery {
  const errors: Record<string, string> = {};
  const from = one(raw, 'from') || undefined, to = one(raw, 'to') || undefined;
  for (const [key, value] of Object.entries({ from, to })) if (value && !validExpenseDate(value)) errors[key] = 'Enter a valid calendar date.';
  if (!Object.keys(errors).length && from && to && from > to) errors.to = 'End date must be on or after start date.';
  function money(key: string) {
    if (!one(raw, key)) return undefined;
    try { return parseExpenseAmount(one(raw, key)); } catch (error) { errors[key] = (error as Error).message; return undefined; }
  }
  const minAmount = money('minAmount'), maxAmount = money('maxAmount');
  if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) errors.maxAmount = 'Maximum amount must be at least the minimum amount.';
  const payment = one(raw, 'paymentMethod'), status = one(raw, 'status');
  if (payment && !PAYMENT_METHODS.includes(payment as PaymentMethod)) errors.paymentMethod = 'Choose a valid payment method.';
  if (status && !OPERATING_EXPENSE_STATUSES.includes(status as OperatingExpenseStatus)) errors.status = 'Choose a valid status.';
  if (Object.keys(errors).length) throw new ExpenseQueryError(errors);
  const requestedPage = Number(one(raw, 'page'));
  return {
    query: one(raw, 'query') || undefined, from, to, categoryId: one(raw, 'categoryId') || undefined,
    paymentMethod: payment as PaymentMethod || undefined, recordedById: one(raw, 'recordedById') || undefined,
    status: status as OperatingExpenseStatus || undefined, minAmount, maxAmount,
    order: ['oldest', 'amount-desc', 'amount-asc'].includes(one(raw, 'order')) ? one(raw, 'order') as ExpenseOrder : 'newest',
    groupBy: ['category', 'payment'].includes(one(raw, 'groupBy')) ? one(raw, 'groupBy') as ExpenseQuery['groupBy'] : 'none',
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: [25, 50, 100].includes(Number(one(raw, 'pageSize'))) ? Number(one(raw, 'pageSize')) : 25,
  };
}
export function expenseUrl(query: ExpenseQuery, pagination = true): string {
  const params = new URLSearchParams();
  for (const key of ['query', 'from', 'to', 'categoryId', 'paymentMethod', 'recordedById', 'status', 'minAmount', 'maxAmount', 'order', 'groupBy', 'page', 'pageSize'] as const) {
    const value = query[key];
    if (!pagination && (key === 'page' || key === 'pageSize')) continue;
    if (value === undefined || value === '' || (key === 'order' && value === 'newest') || (key === 'groupBy' && value === 'none') || (key === 'page' && value === 1) || (key === 'pageSize' && value === 25)) continue;
    params.set(key, String(key === 'minAmount' || key === 'maxAmount' ? Number(value) / 100 : value));
  }
  return `/expenses${params.size ? `?${params}` : ''}`;
}
export function expenseRepositoryFilters(query: ExpenseQuery): OperatingExpenseFilters {
  return { ...query, from: query.from ? new Date(`${query.from}T00:00:00+06:00`) : undefined, to: query.to ? new Date(`${query.to}T23:59:59.999+06:00`) : undefined };
}
export function orderExpenses(a: OperatingExpense, b: OperatingExpense, order: ExpenseOrder = 'newest'): number {
  return (order === 'amount-desc' ? b.amount - a.amount : order === 'amount-asc' ? a.amount - b.amount : 0)
    || (order === 'oldest' ? a.expenseDate.localeCompare(b.expenseDate) : b.expenseDate.localeCompare(a.expenseDate))
    || (order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)) || a.id.localeCompare(b.id);
}
export function summarizeExpenses(expenses: OperatingExpense[], categories: ExpenseCategory[]): ExpenseSummary {
  const active = expenses.filter(item => item.status === 'ACTIVE');
  const names = new Map(categories.map(item => [item.id, item.name]));
  const categoryTotals = new Map<string, number>(), methodTotals = new Map<PaymentMethod, number>();
  for (const item of active) { categoryTotals.set(item.categoryId, (categoryTotals.get(item.categoryId) ?? 0) + item.amount); methodTotals.set(item.paymentMethod, (methodTotals.get(item.paymentMethod) ?? 0) + item.amount); }
  return {
    activeTotal: active.reduce((sum, item) => sum + item.amount, 0), activeCount: active.length, voidedCount: expenses.length - active.length,
    lowest: active.reduce((min, item) => Math.min(min, item.amount), active[0]?.amount ?? 0), highest: active.reduce((max, item) => Math.max(max, item.amount), 0),
    byCategory: [...categoryTotals].map(([categoryId, amount]) => ({ categoryId, name: names.get(categoryId) ?? '', amount })).sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId)),
    byPaymentMethod: [...methodTotals].map(([paymentMethod, amount]) => ({ paymentMethod, amount })).sort((a, b) => b.amount - a.amount || a.paymentMethod.localeCompare(b.paymentMethod)),
  };
}
export function expensePageFromRows(rows: OperatingExpense[], categories: ExpenseCategory[], query: ExpenseQuery): ExpensePage {
  return { ...paginate(rows, query), summary: summarizeExpenses(rows, categories) };
}
