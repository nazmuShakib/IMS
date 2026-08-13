import Link from 'next/link';

import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { DashboardKpis } from '@/components/dashboard/DashboardKpis';
import { DashboardMovers, DashboardRecentActivity } from '@/components/dashboard/DashboardPeriodPanels';
import { DashboardPeriodProvider, DashboardPeriodSelector } from '@/components/dashboard/DashboardPeriodContext';
import { Badge, Card, EmptyState, PageHeader, SerialChip, StockCount, TableViewport } from '@/components/ui';
import { getAuthUserNames, getSession } from '@/lib/session';
import { getDashboard } from '@/services/dashboard';
import { createTranslator } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

const dhaka = (iso: string, _locale: Locale) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

export default async function DashboardPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const dashboard = await getDashboard(role);
  const periodActivity = Object.values(dashboard.recentActivityByPeriod).flat();
  const authActorNames = await getAuthUserNames(periodActivity.map((item) => item.actorId));
  const recentActivityByPeriod = Object.fromEntries(Object.entries(dashboard.recentActivityByPeriod).map(([key, items]) => [key, items.map((item) => ({
    ...item,
    actorName: (item.actorId && authActorNames.get(item.actorId)) || item.actorName,
  }))])) as typeof dashboard.recentActivityByPeriod;

  return (
    <>
      <DashboardPeriodProvider periodStarts={dashboard.periodStarts}>
      <PageHeader title={t('dashboard.title')} count={t('dashboard.updated', { date: dhaka(dashboard.generatedAt, locale) })} action={<DashboardPeriodSelector />} />
      <DashboardKpis dashboard={dashboard} />

      <div className="mb-4">
        <DashboardCharts
          operations={dashboard.dailyOperations}
          financials={dashboard.canSeeFinancials ? dashboard.dailyFinancials : undefined}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-[13px] font-medium">{t('dashboard.lowStockAlerts')}</h2>
            <p className="mt-0.5 text-[11px] text-graphite">{t('dashboard.reorderHelp')}</p>
          </div>
          {dashboard.lowStock.length === 0 ? (
            <EmptyState title={t('dashboard.noReorder')} />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('shell.stock')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.reorder')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.lowStock.map((item) => (
                    <tr key={item.productId} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/products/${item.productId}`} className="text-[12px] font-medium hover:text-signal">{item.name}</Link>
                        <span className="tnum block text-[10px] text-graphite">{item.sku}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right"><StockCount onHand={item.onHand} reorderPoint={item.reorderPoint} /></td>
                      <td className="tnum px-4 py-2.5 text-right text-[12px]">{Math.max(item.reorderPoint * 2 - item.onHand, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>

        <Card>
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-[13px] font-medium">{t('dashboard.deadStock')}</h2>
            <p className="mt-0.5 text-[11px] text-graphite">{t('dashboard.deadStockHelp')}</p>
          </div>
          {dashboard.deadStock.length === 0 ? (
            <EmptyState title={t('dashboard.noDeadStock')} />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.onHand')}</th>
                    <th className="eyebrow px-4 py-2 text-right">{t('dashboard.inactive')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.deadStock.map((item) => (
                    <tr key={item.productId} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/products/${item.productId}`} className="text-[12px] font-medium hover:text-signal">{item.name}</Link>
                        <span className="tnum block text-[10px] text-graphite">{item.sku}</span>
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-[12px]">{item.onHand}</td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-low">{item.inactiveDays === null ? t('dashboard.neverMoved') : t('dashboard.days', { count: item.inactiveDays })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      </div>

      <DashboardMovers top={dashboard.topMoversByPeriod} slow={dashboard.slowMoversByPeriod} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardRecentActivity activity={recentActivityByPeriod} />

        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{t('dashboard.warrantiesExpiring')}</h2></div>
          {dashboard.expiringWarranties.length === 0 ? <EmptyState title={t('dashboard.noWarrantyExpiry')} /> : (
            <TableViewport className="max-h-96">
              <div className="divide-y divide-rule-soft">
                {dashboard.expiringWarranties.map((item) => (
                  <Link key={item.unitId} href={`/products/${item.productId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
                    <span><span className="text-[12px] font-medium">{item.productName}</span><span className="mt-1 block"><SerialChip serial={item.serialNo} dim={item.status !== 'IN_STOCK'} /></span></span>
                    <span className="text-right"><Badge tone="low">{t('dashboard.days', { count: item.daysRemaining })}</Badge><span className="tnum mt-1 block text-[10px] text-graphite">{dhaka(item.warrantyExpiresAt, locale)}</span></span>
                  </Link>
                ))}
              </div>
            </TableViewport>
          )}
        </Card>
      </div>
      </DashboardPeriodProvider>
    </>
  );
}
