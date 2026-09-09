import type { Customer, Sale } from '@/domain/types';
import { one, pageRequest, paginate, type PageRequest, type PageResult, type RawParams } from '@/lib/catalog-query';
import { isBangladeshMobile, normalizeBangladeshMobile } from '@/lib/phone';
import { saleOccurredAt } from '@/lib/sale-timing';

export type CustomerListRow = Pick<Customer, 'id' | 'name' | 'phone' | 'isActive'>;
export interface CustomerQuery extends PageRequest { q: string }
export interface CustomerHistoryPage extends PageResult<Sale> { completedPurchases: number; lifetimeSales: number }
export const customerQuery = (raw: RawParams): CustomerQuery => ({ q: one(raw, 'q'), ...pageRequest(raw) });
export function customerSearchTerms(query: string) {
  const term = query.trim();
  const digits = term.replace(/\D/g, '');
  return { term, digits, normalized: isBangladeshMobile(term) ? normalizeBangladeshMobile(term) : '' };
}
export function customerUrl(query: CustomerQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== 25) params.set('pageSize', String(query.pageSize));
  return `/customers${params.size ? `?${params}` : ''}`;
}
export function customerReturnTo(value: string): string {
  try {
    if (!value.startsWith('/customers') || value.includes('\\')) return '/customers';
    const url = new URL(value, 'https://ims.invalid');
    if (url.origin !== 'https://ims.invalid' || url.pathname !== '/customers') return '/customers';
    return customerUrl(customerQuery(Object.fromEntries([...url.searchParams.keys()].map(key => [key, url.searchParams.getAll(key)]))));
  } catch { return '/customers'; }
}
export function customerPageFromRows(customers: Customer[], query: CustomerQuery): PageResult<CustomerListRow> {
  const { term, digits, normalized } = customerSearchTerms(query.q);
  const rows = customers.filter(row => !term || row.name.toLowerCase().includes(term.toLowerCase())
    || row.phone?.includes(term) || Boolean(digits && row.phoneNormalized?.includes(digits))
    || Boolean(normalized && row.phoneNormalized === normalized))
    .sort((a, b) => a.name.localeCompare(b.name) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const result = paginate(rows, query);
  return { ...result, rows: result.rows.map(({ id, name, phone, isActive }) => ({ id, name, phone, isActive })) };
}
export function customerHistoryFromRows(sales: Sale[], customerId: string, request: PageRequest): CustomerHistoryPage {
  const rows = sales.filter(sale => sale.customerId === customerId)
    .sort((a, b) => saleOccurredAt(b).localeCompare(saleOccurredAt(a)) || a.id.localeCompare(b.id));
  const completed = rows.filter(sale => sale.status === 'COMPLETED');
  return { ...paginate(rows, request), completedPurchases: completed.length, lifetimeSales: completed.reduce((sum, sale) => sum + sale.total, 0) };
}
