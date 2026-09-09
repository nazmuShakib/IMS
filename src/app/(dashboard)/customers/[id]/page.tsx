import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Phone, UserRound } from 'lucide-react';
import { Badge, Card, EmptyState, TableViewport } from '@/components/ui';
import { RoutePagination } from '@/components/ui/RoutePagination';
import { formatBDT } from '@/lib/money';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { domainLabel } from '@/lib/i18n/domain';
import { one, pageRequest, type RawParams } from '@/lib/catalog-query';
import { customerReturnTo } from '@/lib/customer-query';
import { saleOccurredAt } from '@/lib/sale-timing';
import { emiDisplayStatus } from '@/lib/emi-summary';
import { effectiveInvoicePaymentStatus } from '@/lib/invoice-payment-status';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';
export default async function CustomerPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<RawParams>;
}) {
  await requirePageCapability('MANAGE_CUSTOMERS');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const { id } = await params;
  const raw = await searchParams;
  const returnTo = customerReturnTo(one(raw, 'returnTo'));
  const customer = await db.customers.findById(id);
  if (!customer) notFound();
  const history = await db.sales.findCustomerHistoryPage(id, pageRequest(raw));
  const contracts = await db.emi.findContractsBySales(history.rows.map(sale => sale.id));
  const ids = contracts.map(contract => contract.id);
  const [installments, settlements] = await Promise.all([
    db.emi.findInstallmentsByContracts(ids), db.emi.findEarlySettlementsByContracts(ids),
  ]);
  const emiBySale = new Map(contracts.map(contract => {
    const rows = installments.filter(row => row.contractId === contract.id);
    return [contract.saleId, { contract, status: emiDisplayStatus(contract, rows, settlements.find(row => row.contractId === contract.id) ?? null),
      installmentAmountPaid: rows.reduce((sum, row) => sum + row.amountPaid, 0) }];
  }));
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short', hour12: true,
  });
  const payment = (sale: typeof history.rows[number]) => {
    const emi = emiBySale.get(sale.id);
    const status = effectiveInvoicePaymentStatus(sale, emi ? {
      status: emi.status, downPayment: emi.contract.downPayment, tradeInCredit: emi.contract.tradeInCredit,
      installmentAmountPaid: emi.installmentAmountPaid,
    } : undefined);
    return <div className="space-y-1">
      {status ? <Badge tone={status === 'PAID' ? 'ok' : status === 'PARTIALLY_PAID' ? 'low' : 'out'}>{domainLabel(t, status)}</Badge> : <span>—</span>}
      {emi ? <div><Link className="text-signal hover:underline" href={`/emi/${emi.contract.id}`}>{t('invoices.shopManagedEmi')}</Link>
        {sale.status !== 'VOIDED' && emi.status === 'SETTLED_EARLY' && <span className="ml-2 text-graphite">{t('invoices.settledEarly')}</span>}
        {sale.status !== 'VOIDED' && emi.status === 'OVERDUE' && <span className="ml-2 text-out">{t('invoices.overdue')}</span>}
      </div> : sale.status !== 'VOIDED' && status !== 'UNPAID' && <p className="text-graphite">{domainLabel(t, sale.paymentMethod)}</p>}
    </div>;
  };
  const invoice = (sale: typeof history.rows[number]) => <><Link className="tnum font-medium text-signal hover:underline" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link>
    {sale.status === 'VOIDED' && <span className="ml-2"><Badge tone="out">{t('invoices.voided')}</Badge></span>}</>;
  return <div className="mx-auto w-full max-w-5xl [&_h1]:break-words">
    <Link href={returnTo} className="mb-3 inline-flex min-h-9 items-center text-[13px] text-signal hover:underline">← {t('customers.back')}</Link>
    <Card className="mb-4 w-fit max-w-full px-4 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-rule-soft bg-plate/60 text-graphite"><UserRound size={20} /></span>
        <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-[20px] font-semibold tracking-tight text-ink">{customer.name}</h1>
            {!customer.isActive && <Badge>{t('customers.inactive')}</Badge>}
          </div>
          <div className="min-w-0 max-w-full">
            <p className="sr-only">{t('common.phone')}</p>
            {customer.phone ? <a className="inline-flex max-w-full items-center gap-2 rounded-md border border-rule-soft bg-plate/30 px-3 py-2 text-[13px] font-medium text-charcoal transition-colors hover:border-signal hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal" href={`tel:${customer.phoneNormalized ?? customer.phone.replace(/[^+\d]/g, '')}`}>
              <Phone size={14} aria-hidden="true" className="shrink-0" /><span className="tnum break-all">{customer.phone}</span>
            </a> : <span className="text-[13px] text-graphite">{t('customers.noPhone')}</span>}
          </div>
        </div>
      </div>
    </Card>
    <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-[3px] border border-rule bg-card p-4"><dt className="text-[12px] text-graphite">{t('customers.completedPurchases')}</dt><dd className="tnum mt-1 text-[22px] font-semibold">{history.completedPurchases}</dd></div>
      <div className="rounded-[3px] border border-rule bg-card p-4"><dt className="text-[12px] text-graphite">{t('customers.lifetimeSales')}</dt><dd className="tnum mt-1 text-[22px] font-semibold">{formatBDT(history.lifetimeSales)}</dd></div>
    </dl>
    <Card>
      <h2 className="border-b border-rule px-4 py-3 text-[15px] font-semibold">{t('customers.purchaseHistory')}</h2>
      {!history.rows.length ? <EmptyState title={t('customers.noHistory')} /> : <>
        <div className="divide-y divide-rule-soft md:hidden">{history.rows.map(sale => <article key={sale.id} className="space-y-3 p-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">{invoice(sale)}</div>
          <p className="tnum text-graphite">{formatter.format(new Date(saleOccurredAt(sale)))}</p>
          <div className="flex items-start justify-between gap-3">{payment(sale)}<span className="tnum shrink-0 font-semibold">{formatBDT(sale.total)}</span></div>
        </article>)}</div>
        <TableViewport className="hidden md:block"><table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left">
            {[t('invoices.invoice'), t('common.date'), t('invoices.payment'), t('common.total')].map((label, index) => <th scope="col" key={label} className={`eyebrow px-4 py-3 ${index === 3 ? 'text-right' : ''}`}>{label}</th>)}
          </tr></thead>
          <tbody>{history.rows.map(sale => <tr key={sale.id} className="border-b border-rule-soft last:border-0">
            <td className="px-4 py-3">{invoice(sale)}</td><td className="tnum px-4 py-3">{formatter.format(new Date(saleOccurredAt(sale)))}</td>
            <td className="px-4 py-3">{payment(sale)}</td><td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
          </tr>)}</tbody>
        </table></TableViewport>
      </>}
      <RoutePagination pathname={`/customers/${id}`} filters={{ returnTo }} meta={{ page: history.page, pageSize: history.pageSize, pageCount: history.pageCount, totalCount: history.totalCount }} label={t('customers.historyPagination')} />
    </Card>
  </div>;
}
