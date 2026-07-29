import Link from 'next/link';

import { Card, EmptyState, Input, PageHeader, Select, TableViewport } from '@/components/ui';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import type { SaleFilters } from '@/repositories/types';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function dateBoundary(value: string, endOfDay = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+06:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function moneyBoundary(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const paisa = Math.round(Number(value) * 100);
  return Number.isSafeInteger(paisa) ? paisa : undefined;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  await requireCapability('VIEW_INVOICES');
  const raw = await searchParams;
  const query = one(raw, 'q');
  const from = one(raw, 'from');
  const to = one(raw, 'to');
  const customerType = one(raw, 'customerType');
  const paymentStatus = one(raw, 'paymentStatus');
  const paymentMethod = one(raw, 'paymentMethod');
  const minTotal = one(raw, 'minTotal');
  const maxTotal = one(raw, 'maxTotal');
  const filterFormKey = [
    query,
    from,
    to,
    customerType,
    paymentStatus,
    paymentMethod,
    minTotal,
    maxTotal,
  ].join('|');
  const filters: SaleFilters = {
    query: query || undefined,
    from: dateBoundary(from),
    to: dateBoundary(to, true),
    customerType: customerType === 'WALK_IN' || customerType === 'REGISTERED'
      ? customerType
      : undefined,
    paymentStatus: PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
      ? paymentStatus as PaymentStatus
      : undefined,
    paymentMethod: PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)
      ? paymentMethod as PaymentMethod
      : undefined,
    minTotal: moneyBoundary(minTotal),
    maxTotal: moneyBoundary(maxTotal),
  };
  const hasFilters = Object.values(filters).some((value) => value !== undefined);
  const invalidPriceRange = filters.minTotal !== undefined
    && filters.maxTotal !== undefined
    && filters.minTotal > filters.maxTotal;
  const invalidDateRange = filters.from && filters.to && filters.from > filters.to;
  const sales = invalidPriceRange || invalidDateRange
    ? []
    : await db.sales.search(filters, 500);

  return (
    <>
      <PageHeader
        title="Invoices"
        count={`${sales.length}${sales.length === 500 ? '+' : ''} ${hasFilters ? 'matching' : 'recent'} immutable invoices`}
        action={<Link href="/checkout" className="rounded-[3px] bg-signal px-3.5 py-2 text-[13px] font-medium text-white">New checkout</Link>}
      />
      <Card className="mb-4 p-4">
        <form
          key={filterFormKey}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          method="get"
        >
          <label className="sm:col-span-2">
            <span className="eyebrow mb-1.5 block">Search</span>
            <Input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Invoice, customer, phone, reference or salesperson"
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">From date</span>
            <Input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">To date</span>
            <Input type="date" name="to" defaultValue={to} />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Customer type</span>
            <Select name="customerType" defaultValue={filters.customerType ?? ''}>
              <option value="">Walk-in and saved</option>
              <option value="WALK_IN">Walk-in only</option>
              <option value="REGISTERED">Saved customers only</option>
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Payment status</span>
            <Select name="paymentStatus" defaultValue={filters.paymentStatus ?? ''}>
              <option value="">Paid and unpaid</option>
              {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Payment method</span>
            <Select name="paymentMethod" defaultValue={filters.paymentMethod ?? ''}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Minimum total (৳)</span>
            <Input
              type="number"
              name="minTotal"
              min="0"
              step="0.01"
              defaultValue={minTotal}
              placeholder="0.00"
            />
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Maximum total (৳)</span>
            <Input
              type="number"
              name="maxTotal"
              min="0"
              step="0.01"
              defaultValue={maxTotal}
              placeholder="No maximum"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button
              className="h-9 rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white"
              type="submit"
            >
              Apply filters
            </button>
            <Link
              className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[12px]"
              href="/invoices"
            >
              Reset
            </Link>
          </div>
        </form>
        {invalidDateRange && (
          <p className="mt-3 text-[12px] text-out">From date must be on or before the to date.</p>
        )}
        {invalidPriceRange && (
          <p className="mt-3 text-[12px] text-out">Minimum total cannot exceed maximum total.</p>
        )}
        <p className="mt-3 text-[11px] text-graphite">
          Dates use Asia/Dhaka time. Results are newest first and limited to 500 invoices.
        </p>
      </Card>
      <Card>
        {sales.length === 0 ? (
          <EmptyState title={hasFilters ? 'No invoices match these filters.' : 'No completed invoices yet.'} />
        ) : (
          <TableViewport>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-rule text-left">
                  <th className="eyebrow px-4 py-2.5">Invoice</th>
                  <th className="eyebrow px-4 py-2.5">Date</th>
                  <th className="eyebrow px-4 py-2.5">Customer</th>
                  <th className="eyebrow px-4 py-2.5">Payment</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-rule-soft last:border-0">
                    <td className="px-4 py-3"><Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link></td>
                    <td className="tnum px-4 py-3">{new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.completedAt))}</td>
                    <td className="px-4 py-3">{sale.customerName ?? 'Walk-in'}</td>
                    <td className="px-4 py-3">{sale.paymentMethod.replaceAll('_', ' ')} · {sale.paymentStatus}</td>
                    <td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </>
  );
}
