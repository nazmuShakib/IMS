import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import CustomersPage from '@/app/(dashboard)/customers/page';
import CustomerPage from '@/app/(dashboard)/customers/[id]/page';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import type { Sale, EmiContract } from '@/domain/types';
const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'bn', require: vi.fn(), directory: vi.fn(), history: vi.fn(), customer: vi.fn(), contracts: vi.fn(), installments: vi.fn(), settlements: vi.fn(), register: vi.fn() }));
vi.mock('@/repositories', () => ({ db: {
  customers: { findPage: mocks.directory, findById: mocks.customer, findAll: () => { throw new Error('Unbounded read'); } },
  sales: { findCustomerHistoryPage: mocks.history, findByCustomer: () => { throw new Error('Unbounded history'); } },
  emi: { findContractsBySales: mocks.contracts, findInstallmentsByContracts: mocks.installments, findEarlySettlementsByContracts: mocks.settlements },
} }));
vi.mock('@/lib/session', () => ({ requirePageCapability: mocks.require, getSession: async () => ({ locale: mocks.locale }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('Not found'); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/customers/CustomerRegister', () => ({ CustomerRegister: (props: unknown) => { mocks.register(props); return <p>Customer directory</p>; } }));
const sale = (id: string, paymentStatus: Sale['paymentStatus'] = 'UNPAID', status: Sale['status'] = 'COMPLETED'): Sale => ({ id, invoiceNumber: `INV-${id}`, customerId: 'c1', status, paymentStatus, paymentMethod: 'CASH', total: 10000, occurredAt: '2026-09-01T12:00:00.000Z', completedAt: '2026-09-02T12:00:00.000Z' } as Sale);
const contract = (id: string, status: EmiContract['status'] = 'ACTIVE', downPayment = 0): EmiContract => ({ id: `e-${id}`, saleId: id, status, downPayment, tradeInCredit: 0 } as EmiContract);
beforeEach(() => {
  vi.clearAllMocks(); mocks.locale = 'en'; mocks.require.mockResolvedValue({ role: 'STAFF' });
  mocks.customer.mockResolvedValue({ id: 'c1', name: 'Ali', phone: '01712345678', phoneNormalized: '01712345678', isActive: true });
  mocks.directory.mockResolvedValue({ rows: [], totalCount: 125, page: 2, pageCount: 3, pageSize: 50 });
  mocks.history.mockResolvedValue({ rows: [], totalCount: 60, page: 2, pageCount: 3, pageSize: 25, completedPurchases: 59, lifetimeSales: 590000 });
  mocks.contracts.mockResolvedValue([]); mocks.installments.mockResolvedValue([]); mocks.settlements.mockResolvedValue([]);
});
it('uses bounded directory reads, safely parses URLs, and retains the customer permission boundary', async () => {
  renderToStaticMarkup(await CustomersPage({ searchParams: Promise.resolve({ q: [' Ali ', 'ignored'], page: '2', pageSize: '50' }) }));
  expect(mocks.require).toHaveBeenCalledWith('MANAGE_CUSTOMERS');
  expect(mocks.directory).toHaveBeenCalledExactlyOnceWith({ q: 'Ali', page: 2, pageSize: 50 });
  expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ confirmedQuery: 'Ali', meta: expect.objectContaining({ totalCount: 125 }) }));
});
it('keeps all-history summaries and originating URL while paging invoices', async () => {
  const html = renderToStaticMarkup(await CustomerPage({ params: Promise.resolve({ id: 'c1' }), searchParams: Promise.resolve({ page: '2', returnTo: '/customers?q=Ali&page=3&pageSize=50' }) }));
  expect(mocks.history).toHaveBeenCalledExactlyOnceWith('c1', { page: 2, pageSize: 25 });
  expect(html).toContain('/customers?q=Ali&amp;page=3&amp;pageSize=50'); expect(html).toContain('tel:01712345678');
  expect(html).toContain('59'); expect(html).toContain('5,900.00');
});
it('renders current payment status for regular, EMI, and voided invoices', async () => {
  const rows = [sale('regular-paid', 'PAID'), sale('regular-partial', 'PARTIALLY_PAID'), sale('regular-unpaid'), sale('untouched'), sale('partial'), sale('paid'), sale('early'), sale('voided', 'UNPAID', 'VOIDED')];
  mocks.history.mockResolvedValue({ rows, totalCount: 8, page: 1, pageCount: 1, pageSize: 25, completedPurchases: 7, lifetimeSales: 70000 });
  mocks.contracts.mockResolvedValue([contract('untouched'), contract('partial', 'ACTIVE', 1000), contract('paid', 'PAID'), contract('early', 'PAID')]);
  mocks.settlements.mockResolvedValue([{ contractId: 'e-early' }]);
  const html = renderToStaticMarkup(await CustomerPage({ params: Promise.resolve({ id: 'c1' }), searchParams: Promise.resolve({}) }));
  const rowHtml = (id: string) => html.match(new RegExp(`<tr[^>]*><td[^>]*><a[^>]*href="/invoices/${id}"[\\s\\S]*?</tr>`))?.[0] ?? '';
  expect(rowHtml('regular-paid')).toContain('Paid'); expect(rowHtml('regular-partial')).toContain('Partially paid');
  expect(rowHtml('regular-unpaid')).toContain('Unpaid'); expect(rowHtml('regular-unpaid')).not.toContain('Cash');
  expect(rowHtml('untouched')).toContain('Unpaid'); expect(rowHtml('partial')).toContain('Partially paid');
  expect(rowHtml('paid')).toContain('Paid'); expect(rowHtml('paid')).not.toContain('Unpaid');
  expect(rowHtml('early')).toContain('Settled early'); expect(rowHtml('early')).not.toContain('Unpaid');
  expect(rowHtml('voided')).toContain('Voided'); expect(rowHtml('voided')).not.toMatch(/Unpaid|Paid|Cash/);
  expect(mocks.contracts).toHaveBeenCalledExactlyOnceWith(rows.map(row => row.id));
  expect(mocks.installments).toHaveBeenCalledOnce(); expect(mocks.settlements).toHaveBeenCalledOnce();
});
it('localizes status and dates and handles missing customers', async () => {
  mocks.locale = 'bn'; mocks.history.mockResolvedValue({ rows: [sale('voided', 'UNPAID', 'VOIDED')], totalCount: 1, page: 1, pageCount: 1, pageSize: 25, completedPurchases: 0, lifetimeSales: 0 });
  const html = renderToStaticMarkup(<I18nProvider locale="bn">{await CustomerPage({ params: Promise.resolve({ id: 'c1' }), searchParams: Promise.resolve({}) })}</I18nProvider>);
  expect(html).not.toMatch(/VOIDED|UNPAID|CASH/); expect(html).toContain('২০২৬');
  mocks.customer.mockResolvedValue(null);
  await expect(CustomerPage({ params: Promise.resolve({ id: 'missing' }), searchParams: Promise.resolve({}) })).rejects.toThrow('Not found');
});
