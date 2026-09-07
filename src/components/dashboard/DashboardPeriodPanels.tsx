'use client';

import Link from 'next/link';

import { Badge, Card, EmptyState, TableViewport } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useDashboardPeriod } from '@/components/dashboard/DashboardPeriodContext';
import { formatBDT } from '@/lib/money';
import { formatDhakaDate } from '@/lib/time';
import type { DashboardActivity, DashboardInstallmentRow, DashboardPeriodKey, MoverRow } from '@/services/dashboard';

const dhaka = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
});

function periodTitle(title: string, periodLabel: string) {
  return `${title} · ${periodLabel}`;
}

function installmentTone(status: DashboardInstallmentRow['status']): 'ok' | 'out' | 'low' | 'signal' | 'neutral' {
  if (status === 'PAID') return 'ok';
  if (status === 'OVERDUE' || status === 'VOIDED') return 'out';
  if (status === 'DUE' || status === 'PARTIAL') return 'low';
  if (status === 'UPCOMING') return 'signal';
  return 'neutral';
}

export function DashboardNextInstallments({
  installments,
}: {
  installments: Record<DashboardPeriodKey, DashboardInstallmentRow[]>;
}) {
  const { t } = useI18n();
  const { period, key } = useDashboardPeriod();
  const rows = installments[key];
  const periodLabel = t(period === 'day'
    ? 'dashboard.today'
    : period === 'week'
      ? 'dashboard.thisWeek'
      : 'dashboard.thisMonth');
  const statusLabel = (status: DashboardInstallmentRow['status']) => (
    t(`emi.status.${status.toLowerCase()}` as 'emi.status.due')
  );

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-2 border-b border-rule px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.nextInstallments'), periodLabel)}</h2>
            <Badge tone={rows.length > 0 ? 'signal' : 'neutral'}>{t('dashboard.nextInstallmentsCount', { count: rows.length })}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-graphite">{t('dashboard.nextInstallmentsHelp')}</p>
        </div>
        <Link href="/emi" className="shrink-0 text-[12px] font-medium text-signal underline-offset-2 hover:underline">
          {t('dashboard.viewAllEmi')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('dashboard.noNextInstallments')} />
      ) : (
        <>
          <div className="max-h-96 divide-y divide-rule-soft overflow-y-auto md:hidden">
            {rows.map((row) => (
              <Link key={row.installmentId} href={`/emi/${row.contractId}`} className="block p-4 hover:bg-plate/50">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium">{row.customerName ?? '—'}</span>
                    {row.customerPhone && <span className="tnum mt-0.5 block text-[10px] text-graphite">{row.customerPhone}</span>}
                  </span>
                  <Badge tone={installmentTone(row.status)}>{statusLabel(row.status)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                  <span>
                    <span className="font-medium text-signal">{row.contractNumber}</span>
                    <span className="mt-0.5 block text-graphite">{t('dashboard.installmentProgress', { sequence: row.sequence, count: row.termMonths })}</span>
                    {row.invoiceNumber && <span className="tnum mt-0.5 block text-graphite">{row.invoiceNumber}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-graphite">{formatDhakaDate(row.dueDate)}</span>
                    <span className="tnum mt-0.5 block text-[13px] font-semibold">{formatBDT(row.remainingAmount)}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <TableViewport className="hidden max-h-96 md:block">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-rule">
                  <th className="eyebrow px-4 py-2.5 text-left">{t('common.customer')}</th>
                  <th className="eyebrow px-4 py-2.5 text-left">{t('emi.contract')}</th>
                  <th className="eyebrow px-4 py-2.5 text-left">{t('emi.dueDate')}</th>
                  <th className="eyebrow px-4 py-2.5 text-right">{t('emi.balance')}</th>
                  <th className="eyebrow px-4 py-2.5 text-right">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.installmentId} className="border-b border-rule-soft last:border-0 hover:bg-plate/40">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.customerName ?? '—'}</span>
                      {row.customerPhone && <span className="tnum mt-0.5 block text-[10px] text-graphite">{row.customerPhone}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/emi/${row.contractId}`} className="font-medium text-signal underline-offset-2 hover:underline">{row.contractNumber}</Link>
                      <span className="mt-0.5 block text-[10px] text-graphite">{t('dashboard.installmentProgress', { sequence: row.sequence, count: row.termMonths })}{row.invoiceNumber ? ` · ${row.invoiceNumber}` : ''}</span>
                    </td>
                    <td className="px-4 py-3">{formatDhakaDate(row.dueDate)}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold">{formatBDT(row.remainingAmount)}</td>
                    <td className="px-4 py-3 text-right"><Badge tone={installmentTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        </>
      )}
    </Card>
  );
}

export function DashboardMovers({ top, slow }: {
  top: Record<'day' | 'week' | 'month', MoverRow[]>;
  slow: Record<'day' | 'week' | 'month', MoverRow[]>;
}) {
  const { t } = useI18n();
  const { period, key } = useDashboardPeriod();
  const periodLabel = t(period === 'day' ? 'dashboard.today' : period === 'week' ? 'dashboard.thisWeek' : 'dashboard.thisMonth');
  const topRows = top[key];
  const slowRows = slow[key];
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.topMoversBase'), periodLabel)}</h2></div>
        {topRows.length === 0 ? <EmptyState title={t('dashboard.noOutboundPeriod')} /> : <div className="divide-y divide-rule-soft">{topRows.map((item) => (
          <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
            <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{item.sku}</span></span>
            <Badge tone="ok">{t('dashboard.out', { count: item.movedUnits })}</Badge>
          </Link>
        ))}</div>}
      </Card>
      <Card>
        <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.slowMoversBase'), periodLabel)}</h2></div>
        {slowRows.length === 0 ? <EmptyState title={t('dashboard.noStockedCompare')} /> : <div className="divide-y divide-rule-soft">{slowRows.map((item) => (
          <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
            <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{t('dashboard.onHandCount', { count: item.onHand })}</span></span>
            <Badge tone={item.movedUnits === 0 ? 'low' : 'neutral'}>{t('dashboard.out', { count: item.movedUnits })}</Badge>
          </Link>
        ))}</div>}
      </Card>
    </div>
  );
}

export function DashboardRecentActivity({ activity }: { activity: Record<'day' | 'week' | 'month', DashboardActivity[]> }) {
  const { t } = useI18n();
  const { period, key } = useDashboardPeriod();
  const rows = activity[key];
  return (
    <Card>
      <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{periodTitle(t('dashboard.recentActivity'), t(period === 'day' ? 'dashboard.today' : period === 'week' ? 'dashboard.thisWeek' : 'dashboard.thisMonth'))}</h2></div>
      {rows.length === 0 ? <EmptyState title={t('dashboard.noMovementPeriod')} /> : <TableViewport className="max-h-96"><div className="divide-y divide-rule-soft">{rows.map((item) => {
        const correction = item.reason === 'CORRECTION';
        return <Link key={item.id} href={`/products/${item.productId}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
          <span><span className="text-[12px] font-medium">{item.productName}</span><span className="mt-0.5 block text-[10px] text-graphite">{item.reason.replaceAll('_', ' ')} · {item.actorName} · {dhaka(item.createdAt)}</span>{item.occurredAt && item.occurredAt !== item.createdAt && <span className="block text-[10px] text-ink">{t("checkout.actualSaleTime")}: {dhaka(item.occurredAt)}</span>}</span>
          <span className={`tnum text-right text-[12px] font-medium ${correction ? 'text-low' : item.quantity > 0 ? 'text-ok' : 'text-out'}`}>{correction ? t(item.quantity > 0 ? 'dashboard.correctionRestored' : 'dashboard.correctionRemoved', { count: Math.abs(item.quantity) }) : `${item.quantity > 0 ? '+' : ''}${item.quantity}`}</span>
        </Link>;
      })}</div></TableViewport>}
    </Card>
  );
}
