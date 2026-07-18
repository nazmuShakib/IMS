import Link from 'next/link';

import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { Badge, Card, EmptyState, PageHeader, SerialChip, StockCount, TableViewport } from '@/components/ui';
import { formatBDT } from '@/lib/money';
import { getAuthUserNames, getSession } from '@/lib/session';
import { getDashboard } from '@/services/dashboard';

export const dynamic = 'force-dynamic';

const dhaka = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function Kpi({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <Card className="p-4">
      <p className="eyebrow">{label}</p>
      <div className="tnum mt-2 text-[20px] font-semibold">{value}</div>
      {note && <p className="mt-1 text-[11px] text-graphite">{note}</p>}
    </Card>
  );
}

export default async function DashboardPage() {
  const { role } = await getSession();
  const dashboard = await getDashboard(role);
  const authActorNames = await getAuthUserNames(dashboard.recentActivity.map((item) => item.actorId));
  const recentActivity = dashboard.recentActivity.map((item) => ({
    ...item,
    actorName: (item.actorId && authActorNames.get(item.actorId)) || item.actorName,
  }));

  return (
    <>
      <PageHeader title="Dashboard" count={`Updated ${dhaka(dashboard.generatedAt)}`} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Units in stock" value={dashboard.totalUnits.toLocaleString('en-BD')} note={`${dashboard.distinctSkus} stocked SKUs`} />
        <Kpi label="Low stock" value={dashboard.lowStockCount} note={`${dashboard.outOfStockCount} out of stock`} />
        {dashboard.canSeeFinancials ? (
          <>
            <Kpi label="Stock value · cost" value={formatBDT(dashboard.stockValueAtCost)} note={`Retail ${formatBDT(dashboard.stockValueAtRetail)}`} />
            <Kpi label="Potential margin" value={formatBDT(dashboard.potentialMargin)} note="Retail value minus current cost" />
            <Kpi label="Revenue · this month" value={formatBDT(dashboard.monthRevenue)} />
            <Kpi label="COGS · this month" value={formatBDT(dashboard.monthCogs)} />
            <Kpi label="Gross profit · this month" value={formatBDT(dashboard.monthGrossProfit)} />
          </>
        ) : (
          <Kpi label="Access" value="Operational" note="Financial KPIs are restricted by role" />
        )}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-[13px] font-medium">Low-stock alerts</h2>
            <p className="mt-0.5 text-[11px] text-graphite">Reorder at or below the configured threshold</p>
          </div>
          {dashboard.lowStock.length === 0 ? (
            <EmptyState title="No products need reordering." />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">Product</th>
                    <th className="eyebrow px-4 py-2 text-right">Stock</th>
                    <th className="eyebrow px-4 py-2 text-right">Reorder</th>
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
            <h2 className="text-[13px] font-medium">Dead stock</h2>
            <p className="mt-0.5 text-[11px] text-graphite">Stock with no outbound movement for at least 60 days</p>
          </div>
          {dashboard.deadStock.length === 0 ? (
            <EmptyState title="No dead stock detected." />
          ) : (
            <TableViewport className="max-h-72">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2 text-left">Product</th>
                    <th className="eyebrow px-4 py-2 text-right">On hand</th>
                    <th className="eyebrow px-4 py-2 text-right">Inactive</th>
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
                      <td className="px-4 py-2.5 text-right text-[11px] text-low">{item.inactiveDays === null ? 'Never moved' : `${item.inactiveDays} days`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      </div>

      <div className="mb-4">
        <DashboardCharts
          operations={dashboard.dailyOperations}
          financials={dashboard.canSeeFinancials ? dashboard.dailyFinancials : undefined}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">Top movers · 30 days</h2></div>
          {dashboard.topMovers.length === 0 ? <EmptyState title="No outbound movement in the last 30 days." /> : (
            <div className="divide-y divide-rule-soft">
              {dashboard.topMovers.map((item) => (
                <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
                  <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{item.sku}</span></span>
                  <Badge tone="ok">{item.movedLast30Days} out</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">Slow movers · 30 days</h2></div>
          {dashboard.slowMovers.length === 0 ? <EmptyState title="No stocked products to compare." /> : (
            <div className="divide-y divide-rule-soft">
              {dashboard.slowMovers.map((item) => (
                <Link key={item.productId} href={`/products/${item.productId}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-plate/50">
                  <span><span className="text-[12px] font-medium">{item.name}</span><span className="tnum block text-[10px] text-graphite">{item.onHand} on hand</span></span>
                  <Badge tone={item.movedLast30Days === 0 ? 'low' : 'neutral'}>{item.movedLast30Days} out</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">Recent activity</h2></div>
          {recentActivity.length === 0 ? <EmptyState title="No stock movement yet." /> : (
            <TableViewport className="max-h-96">
              <div className="divide-y divide-rule-soft">
                {recentActivity.map((activity) => (
                  <Link key={activity.id} href={`/products/${activity.productId}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
                    <span><span className="text-[12px] font-medium">{activity.productName}</span><span className="mt-0.5 block text-[10px] text-graphite">{activity.reason.replaceAll('_', ' ')} · {activity.actorName} · {dhaka(activity.createdAt)}</span></span>
                    <span className={`tnum text-[12px] font-medium ${activity.quantity > 0 ? 'text-ok' : 'text-out'}`}>{activity.quantity > 0 ? '+' : ''}{activity.quantity}</span>
                  </Link>
                ))}
              </div>
            </TableViewport>
          )}
        </Card>

        <Card>
          <div className="border-b border-rule px-4 py-3"><h2 className="text-[13px] font-medium">Warranties expiring · 30 days</h2></div>
          {dashboard.expiringWarranties.length === 0 ? <EmptyState title="No warranties expire in the next 30 days." /> : (
            <TableViewport className="max-h-96">
              <div className="divide-y divide-rule-soft">
                {dashboard.expiringWarranties.map((item) => (
                  <Link key={item.unitId} href={`/products/${item.productId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-plate/50">
                    <span><span className="text-[12px] font-medium">{item.productName}</span><span className="mt-1 block"><SerialChip serial={item.serialNo} dim={item.status !== 'IN_STOCK'} /></span></span>
                    <span className="text-right"><Badge tone="low">{item.daysRemaining} days</Badge><span className="tnum mt-1 block text-[10px] text-graphite">{dhaka(item.warrantyExpiresAt)}</span></span>
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
