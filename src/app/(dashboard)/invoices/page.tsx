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
  type SaleStatus,
} from '@/domain/types';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';
import type { SaleFilters } from '@/repositories/types';
import { emiDisplayStatus, emiOverdueAmount } from '@/lib/emi-summary';
import { effectiveInvoicePaymentStatus } from '@/lib/invoice-payment-status';

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
  await requirePageCapability('VIEW_INVOICES');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const raw = await searchParams;
  const query = one(raw, 'q');
  const status = one(raw, 'status');
  const from = one(raw, 'from');
  const to = one(raw, 'to');
  const customerType = one(raw, 'customerType');
  const sellerId = one(raw, 'sellerId');
  const paymentStatus = one(raw, 'paymentStatus');
  const paymentMethod = one(raw, 'paymentMethod');
  const minTotal = one(raw, 'minTotal');
  const maxTotal = one(raw, 'maxTotal');
  const requestedPage = Math.max(1, Number.parseInt(one(raw, 'page'), 10) || 1);
  const confirmedFilters: InvoiceFilterValues = {
    q: query,
    status,
    from,
    to,
    customerType,
    sellerId,
    paymentStatus,
    paymentMethod,
    minTotal,
    maxTotal,
  };
  const filters: SaleFilters = {
    query: query || undefined,
    status: status === 'COMPLETED' || status === 'VOIDED'
      ? status as SaleStatus
      : undefined,
    from: dateBoundary(from),
    to: dateBoundary(to, true),
    customerType: customerType === 'WALK_IN' || customerType === 'REGISTERED'
      ? customerType
      : undefined,
    actorId: sellerId || undefined,
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
  const pageSize = 50;
  const usersPromise = db.users.findAll();
  const totalCount = invalidPriceRange || invalidDateRange
    ? 0
    : await db.sales.count(filters);
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const sales = invalidPriceRange || invalidDateRange
    ? []
    : await db.sales.search(filters, pageSize, (page - 1) * pageSize);
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const emiContracts = await db.emi.findContractsBySales(sales.map((sale) => sale.id));
  const contractIds = emiContracts.map((contract) => contract.id);
  const [allInstallments, earlySettlements] = await Promise.all([
    db.emi.findInstallmentsByContracts(contractIds),
    db.emi.findEarlySettlementsByContracts(contractIds),
  ]);
  const installmentsByContract = new Map<string, typeof allInstallments>();
  for (const row of allInstallments) {
    const rows = installmentsByContract.get(row.contractId);
    if (rows) rows.push(row);
    else installmentsByContract.set(row.contractId, [row]);
  }
  const earlySettlementByContract = new Map(earlySettlements.map((row) => [row.contractId, row]));
  const emiSummaries = emiContracts.map((contract) => {
    const installments = installmentsByContract.get(contract.id) ?? [];
    const earlySettlement = earlySettlementByContract.get(contract.id) ?? null;
    const displayStatus = emiDisplayStatus(contract, installments, earlySettlement);
    const sale = saleById.get(contract.saleId);
    if (!sale) return null;

    return [contract.saleId, {
      contractId: contract.id,
      termMonths: contract.termMonths,
      status: displayStatus,
      overdueAmount: emiOverdueAmount(installments),
      paymentStatus: effectiveInvoicePaymentStatus(
        sale,
        {
          status: displayStatus,
          downPayment: contract.downPayment,
          tradeInCredit: contract.tradeInCredit,
          installmentAmountPaid: installments.reduce((sum, row) => sum + row.amountPaid, 0),
        },
      ),
    }] as const;
  });
  const emiBySaleId = Object.fromEntries(emiSummaries.filter((summary) => summary !== null));
  const users = await usersPromise;

  return (
    <>
      <PageHeader
        title={t('invoices.title')}
        count={t('invoices.summary', {
          count: totalCount,
          kind: t(hasFilters ? 'invoices.matching' : 'invoices.recent'),
        })}
        action={<Link href="/checkout" className="rounded-[3px] bg-signal px-3.5 py-2 text-[13px] font-medium text-white">{t('invoices.newCheckout')}</Link>}
      />
      <InvoiceRegister
        confirmedFilters={confirmedFilters}
        sellers={users.map(({ id, name }) => ({ id, name }))}
        sales={sales}
        emiBySaleId={emiBySaleId}
        hasFilters={hasFilters}
        invalidDateRange={Boolean(invalidDateRange)}
        invalidPriceRange={invalidPriceRange}
        resultVersion={crypto.randomUUID()}
        page={page}
        pageCount={pageCount}
        totalCount={totalCount}
      />
    </>
  );
}
