import { describe, expect, it } from 'vitest';
import type { Customer, Sale } from '@/domain/types';
import { customerQuery, customerUrl, customerReturnTo, customerPageFromRows, customerHistoryFromRows } from '@/lib/customer-query';
const customers: Customer[] = Array.from({ length: 125 }, (_, i) => ({ id: `c-${String(i).padStart(3, '0')}`, name: `Customer ${String(i).padStart(3, '0')}`, phone: '01712345678', phoneNormalized: '01712345678', isActive: i % 2 === 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
describe('customer directory queries', () => {
  it('safely parses repeated, whitespace, and invalid pagination parameters', () => {
    expect(customerQuery({ q: [' Ali ', 'ignored'], page: '-1', pageSize: '999' })).toEqual({ q: 'Ali', page: 1, pageSize: 25 });
    expect(customerQuery({ q: '  ', page: '999999999999999999' }).q).toBe('');
    expect(customerUrl(customerQuery({ q: ' A & B ', page: '2', pageSize: '50' }))).toBe('/customers?q=A+%26+B&page=2&pageSize=50');
  });
  it('pages all 125 matches, includes inactive records, and returns only public row fields', () => {
    const page = customerPageFromRows(customers, { q: 'customer', page: 999, pageSize: 50 });
    expect(page).toMatchObject({ totalCount: 125, pageCount: 3, page: 3, pageSize: 50 });
    expect(page.rows).toHaveLength(25);
    expect(page.rows.some(row => !row.isActive)).toBe(true);
    expect(Object.keys(page.rows[0]!)).toEqual(['id', 'name', 'phone', 'isActive']);
    expect(customerPageFromRows(customers, { q: '', page: 1, pageSize: 25 }).totalCount).toBe(125);
  });
  it.each(['01712345678', '+880 1712-345678', '8801712345678', '1712345678', '3456'])('matches mobile query %s', q => {
    expect(customerPageFromRows(customers, { q, page: 1, pageSize: 25 }).totalCount).toBe(125);
  });
  it('never matches empty digits for a name-only query', () => {
    expect(customerPageFromRows(customers, { q: 'Missing', page: 1, pageSize: 25 })).toMatchObject({ rows: [], totalCount: 0, page: 1, pageCount: 1 });
  });
  it('breaks duplicate-name ties by creation time then ID', () => {
    const rows = [{ ...customers[0]!, id: 'b', name: 'Same' }, { ...customers[0]!, id: 'a', name: 'Same' }, { ...customers[0]!, id: 'c', name: 'Same', createdAt: '2026-02-01T00:00:00.000Z' }];
    expect(customerPageFromRows(rows, { q: '', page: 1, pageSize: 25 }).rows.map(row => row.id)).toEqual(['c', 'a', 'b']);
  });
  it('allows only canonical customer directory return destinations', () => {
    expect(customerReturnTo('/customers?q=Ali&page=2&pageSize=50&bad=1')).toBe('/customers?q=Ali&page=2&pageSize=50');
    for (const value of ['https://evil.test/customers', '//evil.test/customers', '/customers/123', '/customers/../settings', '/customers\\evil', '']) expect(customerReturnTo(value)).toBe('/customers');
  });
  it('keeps completed summaries across history pages, excludes other customers and voided sales, and uses occurrence time', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `s-${String(i).padStart(2, '0')}`, customerId: 'c-000', status: i === 0 ? 'VOIDED' : 'COMPLETED', total: 1000, occurredAt: i === 1 ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z', completedAt: '2026-03-01T00:00:00.000Z' } as Sale));
    rows.push({ ...rows[0]!, id: 'other', customerId: 'other', status: 'COMPLETED', total: 100000 });
    const first = customerHistoryFromRows(rows, 'c-000', { page: 1, pageSize: 25 });
    const last = customerHistoryFromRows(rows, 'c-000', { page: 9, pageSize: 25 });
    expect(first.rows[0]!.id).toBe('s-01');
    expect(first).toMatchObject({ totalCount: 30, completedPurchases: 29, lifetimeSales: 29000 });
    expect(last).toMatchObject({ page: 2, totalCount: 30, completedPurchases: 29, lifetimeSales: 29000 });
    expect(last.rows).toHaveLength(5);
  });
});
