'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Badge, Button, Card, EmptyState, Input, Select, TableViewport } from '@/components/ui';
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentStatus, type Sale } from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';
import type { EmiDisplayStatus } from '@/lib/emi-summary';

export interface InvoiceEmiSummary {
  contractId: string;
  termMonths: number;
  status: EmiDisplayStatus;
  overdueAmount: number;
  paymentStatus: PaymentStatus | null;
}

export interface InvoiceFilterValues {
  q: string;
  status: string;
  from: string;
  to: string;
  customerType: string;
  sellerId: string;
  paymentStatus: string;
  paymentMethod: string;
  minTotal: string;
  maxTotal: string;
}

const EMPTY_FILTERS: InvoiceFilterValues = {
  q: '',
  status: '',
  from: '',
  to: '',
  customerType: '',
  sellerId: '',
  paymentStatus: '',
  paymentMethod: '',
  minTotal: '',
  maxTotal: '',
};

function filterUrl(values: InvoiceFilterValues, page = 1): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value.trim()) params.set(key, value.trim());
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/invoices?${query}` : '/invoices';
}

export function InvoiceRegister({
  confirmedFilters,
  sellers,
  sales,
  emiBySaleId,
  hasFilters,
  invalidDateRange,
  invalidPriceRange,
  resultVersion,
  page,
  pageCount,
  totalCount,
}: {
  confirmedFilters: InvoiceFilterValues;
  sellers: Array<{ id: string; name: string }>;
  sales: Sale[];
  emiBySaleId: Record<string, InvoiceEmiSummary>;
  hasFilters: boolean;
  invalidDateRange: boolean;
  invalidPriceRange: boolean;
  resultVersion: string;
  page: number;
  pageCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [values, setValues] = useState(confirmedFilters);
  const [filtering, setFiltering] = useState(false);
  const [refreshPending, startRefreshing] = useTransition();
  const pending = filtering || refreshPending;

  useEffect(() => {
    setValues(confirmedFilters);
    setFiltering(false);
  }, [confirmedFilters, resultVersion]);

  function update(key: keyof InvoiceFilterValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function navigate(next: InvoiceFilterValues) {
    setValues(next);
    setFiltering(true);
    window.history.pushState(null, '', filterUrl(next));
    startRefreshing(() => {
      router.refresh();
    });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(values);
  }

  function emiStatusLabel(status: EmiDisplayStatus): string {
    if (status === 'SETTLED_EARLY') return t('invoices.settledEarly');
    if (status === 'OVERDUE') return t('invoices.overdue');
    if (status === 'PAID') return t('invoices.paid');
    if (status === 'VOIDED') return t('invoices.voided');
    return t('invoices.active');
  }

  function paymentBadge(status: PaymentStatus | null) {
    if (!status) return <span className="text-graphite">—</span>;
    const tone = status === 'PAID' ? 'ok' : status === 'PARTIALLY_PAID' ? 'low' : 'out';
    return <Badge tone={tone}>{domainLabel(t, status)}</Badge>;
  }

  const dateFormatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true,
  });
  const advancedFiltersActive = Boolean(
    values.from || values.to || values.customerType || values.sellerId
    || values.paymentMethod || values.minTotal || values.maxTotal,
  );
  const anyDraftFilters = Object.values(values).some(Boolean);

  return (
    <>
      <Card className="mb-4 p-4">
        <form className="grid gap-3 md:grid-cols-6" onSubmit={applyFilters}>
          <label className="md:col-span-3">
            <span className="eyebrow mb-1.5 block">{t('common.search')}</span>
            <Input
              type="search"
              name="q"
              value={values.q}
              onChange={(event) => update('q', event.target.value)}
              disabled={pending}
              placeholder={t('invoices.searchPlaceholder')}
            />
          </label>
          <label className="md:col-span-3 lg:col-span-2">
            <span className="eyebrow mb-1.5 block">{t('invoices.invoiceStatus')}</span>
            <Select
              name="status"
              value={values.status}
              onChange={(event) => update('status', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allInvoiceStatuses')}</option>
              <option value="COMPLETED">{t('invoices.completedOnly')}</option>
              <option value="VOIDED">{t('invoices.voidedOnly')}</option>
            </Select>
          </label>
          <label className="md:col-span-3 lg:col-span-1">
            <span className="eyebrow mb-1.5 block">{t('checkout.paymentStatus')}</span>
            <Select
              name="paymentStatus"
              value={values.paymentStatus}
              onChange={(event) => update('paymentStatus', event.target.value)}
              disabled={pending}
            >
              <option value="">{t('invoices.allStatuses')}</option>
              {PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
            </Select>
          </label>
          <details className="group md:col-span-6" open={advancedFiltersActive || undefined}>
            <summary className="cursor-pointer list-none text-[12px] font-medium text-signal marker:hidden">
              <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
              {t('invoices.moreFilters')}
            </summary>
            <div className="mt-3 grid gap-3 rounded-[3px] bg-plate/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.fromDate')}</span>
                <Input type="date" name="from" value={values.from} onChange={(event) => update('from', event.target.value)} disabled={pending} />
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.toDate')}</span>
                <Input type="date" name="to" value={values.to} onChange={(event) => update('to', event.target.value)} disabled={pending} />
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.customerType')}</span>
                <Select name="customerType" value={values.customerType} onChange={(event) => update('customerType', event.target.value)} disabled={pending}>
                  <option value="">{t('invoices.allCustomers')}</option>
                  <option value="WALK_IN">{t('invoices.walkInOnly')}</option>
                  <option value="REGISTERED">{t('invoices.savedOnly')}</option>
                </Select>
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.seller')}</span>
                <Select name="sellerId" value={values.sellerId} onChange={(event) => update('sellerId', event.target.value)} disabled={pending}>
                  <option value="">{t('invoices.allSellers')}</option>
                  {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
                </Select>
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('checkout.paymentMethod')}</span>
                <Select name="paymentMethod" value={values.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)} disabled={pending}>
                  <option value="">{t('invoices.allMethods')}</option>
                  {PAYMENT_METHODS.map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
                </Select>
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.minTotal')}</span>
                <Input type="number" name="minTotal" min="0" step="0.01" value={values.minTotal} onChange={(event) => update('minTotal', event.target.value)} disabled={pending} placeholder="0.00" />
              </label>
              <label>
                <span className="eyebrow mb-1.5 block">{t('invoices.maxTotal')}</span>
                <Input type="number" name="maxTotal" min="0" step="0.01" value={values.maxTotal} onChange={(event) => update('maxTotal', event.target.value)} disabled={pending} placeholder={t('invoices.setMaximumPrice')} />
              </label>
            </div>
          </details>
          <div className="flex items-center gap-2 md:col-span-6">
            <Button type="submit" disabled={pending}>{pending ? t('invoices.filtering') : t('common.applyFilters')}</Button>
            {anyDraftFilters && (
              <Button variant="ghost" type="button" disabled={pending} onClick={() => navigate(EMPTY_FILTERS)}>{t('common.reset')}</Button>
            )}
          </div>
        </form>
        {!pending && invalidDateRange && (
          <p className="mt-3 text-[12px] text-out">{t('invoices.invalidDates')}</p>
        )}
        {!pending && invalidPriceRange && (
          <p className="mt-3 text-[12px] text-out">{t('invoices.invalidPrices')}</p>
        )}
        <p className="mt-3 text-[11px] text-graphite">
          {t('invoices.limitHelp')}
        </p>
      </Card>

      {pending ? (
        <Card>
          <LoadingScreen compact label={t('loading.filterInvoices')} />
        </Card>
      ) : (
        <Card>
          {sales.length === 0 ? (
            <EmptyState title={hasFilters ? t('invoices.noMatch') : t('invoices.empty')} />
          ) : (
            <>
              <div className="divide-y divide-rule-soft md:hidden">
                {sales.map((sale) => {
                  const emi = emiBySaleId[sale.id];
                  const effectivePayment = sale.status === 'VOIDED' ? null : (emi?.paymentStatus ?? sale.paymentStatus);
                  return (
                    <article key={sale.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link>
                          <p className="tnum mt-1 text-[11px] text-graphite">{dateFormatter.format(new Date(sale.completedAt))}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {sale.status === 'VOIDED' && <Badge tone="out">{t('invoices.voided')}</Badge>}
                          {paymentBadge(effectivePayment)}
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 text-[12px]">
                          <p className="truncate font-medium">{sale.customerName ?? t('invoices.walkIn')}</p>
                          <p className="mt-0.5 text-[11px] text-graphite">
                            {emi
                              ? `${t('invoices.shopManagedEmi')}${emi.status === 'PAID' ? '' : ` · ${emiStatusLabel(emi.status)}`}`
                              : domainLabel(t, sale.paymentMethod)}
                          </p>
                          {emi?.status === 'OVERDUE' && <p className="tnum mt-0.5 text-[11px] text-out">{formatBDT(emi.overdueAmount)} {t('invoices.overdueAmount')}</p>}
                        </div>
                        <span className="tnum shrink-0 text-[14px] font-semibold">{formatBDT(sale.total)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <TableViewport className="hidden md:block">
              <table className="min-w-[900px] w-full border-collapse text-[12px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-rule text-left">
                    <th className="eyebrow px-4 py-2.5">{t('invoices.invoice')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('common.date')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('common.customer')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.seller')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.saleType')}</th>
                    <th className="eyebrow px-4 py-2.5">{t('invoices.paymentStatusColumn')}</th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => {
                    const emi = emiBySaleId[sale.id];
                    const effectivePayment = sale.status === 'VOIDED' ? null : (emi?.paymentStatus ?? sale.paymentStatus);
                    return (
                    <tr key={sale.id} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-3">
                        <Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link>
                        {sale.status === 'VOIDED' && <span className="ml-2"><Badge tone="out">{t('invoices.voided')}</Badge></span>}
                      </td>
                      <td className="tnum px-4 py-3">{dateFormatter.format(new Date(sale.completedAt))}</td>
                      <td className="px-4 py-3">{sale.customerName ?? t('invoices.walkIn')}</td>
                      <td className="px-4 py-3">{sale.actorName}</td>
                      <td className="px-4 py-3">
                        {emi
                          ? <><Link href={`/emi/${emi.contractId}`} className="font-medium text-signal underline-offset-2 hover:underline">{t('invoices.shopManagedEmi')}</Link><span className="block text-[11px] text-graphite">{t('invoices.monthlyInstallments', { count: emi.termMonths })}</span></>
                          : t('invoices.regularSale')}
                      </td>
                      <td className="px-4 py-3">
                        {paymentBadge(effectivePayment)}
                        {emi && sale.status !== 'VOIDED' && emi.status !== 'PAID' && <span className="ml-2 text-[11px] text-graphite">{emiStatusLabel(emi.status)}</span>}
                        {!emi && sale.status !== 'VOIDED' && sale.paymentStatus !== 'UNPAID' && <span className="ml-2 text-[11px] text-graphite">{domainLabel(t, sale.paymentMethod)}</span>}
                        {emi?.status === 'OVERDUE' && <span className="tnum ml-2 text-[11px] text-out">{formatBDT(emi.overdueAmount)} {t('invoices.overdueAmount')}</span>}
                      </td>
                      <td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </TableViewport>
              <nav className="flex flex-col gap-2 border-t border-rule px-4 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between" aria-label={t('invoices.pagination')}>
                <p className="tnum text-graphite">{t('invoices.showing', {
                  from: (page - 1) * 50 + 1,
                  to: Math.min(page * 50, totalCount),
                  total: totalCount,
                })}</p>
                {pageCount > 1 && (
                  <div className="flex gap-2">
                    {page > 1 && <Link className="rounded-[3px] border border-rule px-3 py-1.5 hover:bg-plate" href={filterUrl(confirmedFilters, page - 1)}>{t('invoices.previous')}</Link>}
                    {page < pageCount && <Link className="rounded-[3px] border border-rule px-3 py-1.5 hover:bg-plate" href={filterUrl(confirmedFilters, page + 1)}>{t('invoices.next')}</Link>}
                  </div>
                )}
              </nav>
            </>
          )}
        </Card>
      )}
    </>
  );
}
