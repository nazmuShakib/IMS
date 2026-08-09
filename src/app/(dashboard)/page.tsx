import Link from 'next/link';

import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Badge, Card, EmptyState, HelpTerm, PageHeader, SerialChip, StockCount, TableViewport } from '@/components/ui';
import { formatBDT } from '@/lib/money';
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

type KpiTone =
  | 'units'
  | 'low'
  | 'stock'
  | 'margin'
  | 'marginLoss'
  | 'revenue'
  | 'cogs'
  | 'profit'
  | 'profitLoss'
  | 'neutral';

const KPI_TONES: Record<KpiTone, { border: string; wash: string; value: string; note: string }> = {
  units: { border: 'border-t-metric-units', wash: 'bg-metric-units-wash', value: 'text-metric-units', note: 'text-graphite' },
  low: { border: 'border-t-metric-low', wash: 'bg-metric-low-wash', value: 'text-metric-low', note: 'text-metric-low' },
  stock: { border: 'border-t-metric-stock', wash: 'bg-metric-stock-wash', value: 'text-metric-stock', note: 'text-metric-stock' },
  margin: { border: 'border-t-metric-margin', wash: 'bg-metric-margin-wash', value: 'text-metric-margin', note: 'text-metric-margin' },
  marginLoss: { border: 'border-t-metric-margin-loss', wash: 'bg-metric-margin-loss-wash', value: 'text-metric-margin-loss', note: 'text-metric-margin-loss' },
  revenue: { border: 'border-t-metric-revenue', wash: 'bg-metric-revenue-wash', value: 'text-metric-revenue', note: 'text-metric-revenue' },
  cogs: { border: 'border-t-metric-cogs', wash: 'bg-metric-cogs-wash', value: 'text-metric-cogs', note: 'text-metric-cogs' },
  profit: { border: 'border-t-metric-profit', wash: 'bg-metric-profit-wash', value: 'text-metric-profit', note: 'text-metric-profit' },
  profitLoss: { border: 'border-t-metric-profit-loss', wash: 'bg-metric-profit-loss-wash', value: 'text-metric-profit-loss', note: 'text-metric-profit-loss' },
  neutral: { border: 'border-t-metric-neutral', wash: 'bg-metric-neutral-wash', value: 'text-metric-neutral', note: 'text-metric-neutral' },
};

function Kpi({ label, value, note, tone }: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: string;
  tone: KpiTone;
}) {
  const colors = KPI_TONES[tone];
  return (
    <Card className={`relative overflow-visible border-t-[3px] p-0 ${colors.border}`}>
      <div className="p-4">
        <p className="eyebrow">{label}</p>
        <div className={`-mx-1 mt-2 rounded-[2px] px-2 py-2 ${colors.wash}`}>
          <div className={`tnum text-[20px] font-semibold ${colors.value}`}>{value}</div>
          {note && <p className={`mt-1 text-[11px] ${colors.note}`}>{note}</p>}
        </div>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const dashboard = await getDashboard(role);
  const authActorNames = await getAuthUserNames(dashboard.recentActivity.map((item) => item.actorId));
  const recentActivity = dashboard.recentActivity.map((item) => ({
    ...item,
    actorName: (item.actorId && authActorNames.get(item.actorId)) || item.actorName,
  }));

  return (
    <>
      <PageHeader title={t('dashboard.title')} count={t('dashboard.updated', { date: dhaka(dashboard.generatedAt, locale) })} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="units" label={t('dashboard.unitsInStock')} value={dashboard.totalUnits.toLocaleString('en-BD')} note={t('dashboard.stockedCodes', { count: dashboard.distinctSkus })} />
        <Kpi tone="low" label={t('dashboard.lowStock')} value={dashboard.lowStockCount} note={t('dashboard.outOfStockCount', { count: dashboard.outOfStockCount })} />
        {dashboard.canSeeFinancials ? (
          <>
            <Kpi tone="stock" label={t('dashboard.stockValueCost')} value={formatBDT(dashboard.stockValueAtCost)} note={t('dashboard.retail', { value: formatBDT(dashboard.stockValueAtRetail) })} />
            <Kpi
              tone={dashboard.potentialMargin < 0 ? 'marginLoss' : 'margin'}
              label={t('dashboard.potentialMargin')}
              value={formatBDT(dashboard.potentialMargin)}
              note={dashboard.potentialMargin < 0 ? 'Negative margin · retail value is below current cost' : 'Retail value minus current cost'}
            />
            <Kpi tone="revenue" label={t('dashboard.revenueMonth')} value={formatBDT(dashboard.monthRevenue)} />
            <Kpi
              tone="cogs"
              label={<HelpTerm description={t('term.cogsHelp')}>{t('dashboard.cogsMonth')}</HelpTerm>}
              value={formatBDT(dashboard.monthCogs)}
            />
            <Kpi
              tone={dashboard.monthGrossProfit < 0 ? 'profitLoss' : dashboard.monthGrossProfit === 0 ? 'neutral' : 'profit'}
              label={<HelpTerm description={t('term.salesProfitHelp')}>{t('dashboard.salesProfitMonth')}</HelpTerm>}
              value={formatBDT(dashboard.monthGrossProfit)}
              note={dashboard.monthGrossProfit < 0 ? t('dashboard.lossMonth') : dashboard.monthGrossProfit === 0 ? t('dashboard.breakEven') : undefined}
            />
          </>
        ) : (
          <Kpi tone="units" label={t('dashboard.access')} value={t('dashboard.operational')} note={t('dashboard.financialRestricted')} />
        )}
      </div>

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

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{t('dashboard.topMovers')}</h2></div>
          {dashboard.topMovers.length === 0 ? <EmptyState title={t('dashboard.noOutbound')} /> : (
            <div className="divide-y divide-rule-soft">
              {dashboard.topMovers.map((item) => (
                <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
                  <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{item.sku}</span></span>
                  <Badge tone="ok">{t('dashboard.out', { count: item.movedLast30Days })}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{t('dashboard.slowMovers')}</h2></div>
          {dashboard.slowMovers.length === 0 ? <EmptyState title={t('dashboard.noStockedCompare')} /> : (
            <div className="divide-y divide-rule-soft">
              {dashboard.slowMovers.map((item) => (
                <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
                  <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{t('dashboard.onHandCount', { count: item.onHand })}</span></span>
                  <Badge tone={item.movedLast30Days === 0 ? 'low' : 'neutral'}>{t('dashboard.out', { count: item.movedLast30Days })}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">{t('dashboard.recentActivity')}</h2></div>
          {recentActivity.length === 0 ? <EmptyState title={t('dashboard.noMovement')} /> : (
            <TableViewport className="max-h-96">
              <div className="divide-y divide-rule-soft">
                {recentActivity.map((activity) => {
                  const correction = activity.reason === 'CORRECTION';
                  return (
                    <Link key={activity.id} href={`/products/${activity.productId}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
                      <span><span className="text-[12px] font-medium">{activity.productName}</span><span className="mt-0.5 block text-[10px] text-graphite">{activity.reason.replaceAll('_', ' ')} · {activity.actorName} · {dhaka(activity.createdAt, locale)}</span></span>
                      <span className={`tnum text-right text-[12px] font-medium ${correction ? 'text-low' : activity.quantity > 0 ? 'text-ok' : 'text-out'}`}>
                        {correction
                          ? t(activity.quantity > 0 ? 'dashboard.correctionRestored' : 'dashboard.correctionRemoved', { count: Math.abs(activity.quantity) })
                          : `${activity.quantity > 0 ? '+' : ''}${activity.quantity}`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </TableViewport>
          )}
        </Card>

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
    </>
  );
}
