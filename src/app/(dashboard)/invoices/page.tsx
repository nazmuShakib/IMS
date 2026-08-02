import Link from 'next/link';

import {
  InvoiceRegister,
  type InvoiceFilterValues,
} from '@/components/invoices/InvoiceRegister';
import { PageHeader } from '@/components/ui';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '@/domain/types';
import { getSession, requireCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
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
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const raw = await searchParams;
  const query = one(raw, 'q');
  const from = one(raw, 'from');
  const to = one(raw, 'to');
  const customerType = one(raw, 'customerType');
  const paymentStatus = one(raw, 'paymentStatus');
  const paymentMethod = one(raw, 'paymentMethod');
  const minTotal = one(raw, 'minTotal');
  const maxTotal = one(raw, 'maxTotal');
  const confirmedFilters: InvoiceFilterValues = {
    q: query,
    from,
    to,
    customerType,
    paymentStatus,
    paymentMethod,
    minTotal,
    maxTotal,
  };
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
        title={t('invoices.title')}
        count={t('invoices.summary', {
          count: `${sales.length}${sales.length === 500 ? '+' : ''}`,
          kind: t(hasFilters ? 'invoices.matching' : 'invoices.recent'),
        })}
        action={<Link href="/checkout" className="rounded-[3px] bg-signal px-3.5 py-2 text-[13px] font-medium text-white">{t('invoices.newCheckout')}</Link>}
      />
      <InvoiceRegister
        confirmedFilters={confirmedFilters}
        sales={sales}
        hasFilters={hasFilters}
        invalidDateRange={Boolean(invalidDateRange)}
        invalidPriceRange={invalidPriceRange}
        resultVersion={crypto.randomUUID()}
      />
    </>
  );
}
