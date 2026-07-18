import Link from 'next/link';

import { Card, EmptyState, Input, Money, PageHeader, Select, TableViewport } from '@/components/ui';
import { MOVEMENT_REASONS, MOVEMENT_TYPES } from '@/domain/types';
import { formatBDT } from '@/lib/money';
import { getAuthUserNames, requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import {
  getReport,
  getReportActorIds,
  parseReportFilters,
  type ReportCell,
  type ReportColumn,
  type ReportKind,
} from '@/services/reports';

export const dynamic = 'force-dynamic';

const REPORTS: Array<{ id: ReportKind; label: string }> = [
  { id: 'valuation', label: 'Valuation' },
  { id: 'sales', label: 'Revenue & margin' },
  { id: 'profit', label: 'Profit by product' },
  { id: 'purchases', label: 'Purchase spend' },
  { id: 'aging', label: 'Stock aging' },
  { id: 'shrinkage', label: 'Shrinkage' },
  { id: 'movements', label: 'Movement audit' },
];

const dateTime = (value: string) => new Date(value).toLocaleString('en-GB', {
  timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function displayCell(value: ReportCell, column: ReportColumn) {
  if (column.type === 'money') return <Money value={value === null ? null : Number(value)} />;
  if (column.type === 'date' && value) return <span className="tnum whitespace-nowrap text-[11px] text-graphite">{dateTime(String(value))}</span>;
  if (value === null || value === '') return <span className="text-graphite">—</span>;
  return <span className={column.type === 'number' ? 'tnum' : ''}>{String(value)}</span>;
}

function queryWith(raw: Record<string, string | string[] | undefined>, patch: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const item = Array.isArray(value) ? value[0] : value;
    if (item && key !== 'format') params.set(key, item);
  }
  for (const [key, value] of Object.entries(patch)) value ? params.set(key, value) : params.delete(key);
  return params.toString();
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCapability('VIEW_REPORTS');
  const raw = await searchParams;
  const filters = parseReportFilters(raw);
  const [products, categories, brands, suppliers, actorIds] = await Promise.all([
    db.products.findAll(), db.categories.findAll(), db.brands.findAll(), db.suppliers.findAll(), getReportActorIds(),
  ]);
  const actorNames = await getAuthUserNames(actorIds);
  const report = await getReport(filters, { actorNames });
  const exportQuery = queryWith(raw, { report: filters.report });
  const totals = report.columns.filter((column) => typeof report.totals[column.key] === 'number').slice(0, 4);
  const uniqueActors = [...actorNames].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <>
      <PageHeader title="Financial reports" count={`Generated ${dateTime(report.generatedAt)} · Asia/Dhaka`} action={
        <div className="flex gap-1.5">
          <a className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[12px] font-medium hover:bg-plate" href={`/api/reports/export?${exportQuery}&format=csv`}>Export CSV</a>
          <a className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[12px] font-medium hover:bg-plate" href={`/api/reports/export?${exportQuery}&format=pdf`}>Export PDF</a>
        </div>
      } />

      <nav className="mb-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Report selection">
        {REPORTS.map((item) => (
          <Link key={item.id} href={`/reports?${queryWith(raw, { report: item.id })}`} className={`shrink-0 rounded-[3px] border px-2.5 py-1.5 text-[12px] ${filters.report === item.id ? 'border-ink bg-ink text-white' : 'border-rule bg-card text-graphite hover:text-ink'}`}>{item.label}</Link>
        ))}
      </nav>

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
          <input type="hidden" name="report" value={filters.report} />
          {!['valuation', 'aging'].includes(filters.report) && <><label><span className="eyebrow mb-1.5 block">From</span><Input type="date" name="from" defaultValue={filters.from} /></label><label><span className="eyebrow mb-1.5 block">To</span><Input type="date" name="to" defaultValue={filters.to} /></label></>}
          <label><span className="eyebrow mb-1.5 block">Product</span><Select name="productId" defaultValue={filters.productId ?? ''}><option value="">All products</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</Select></label>
          <label><span className="eyebrow mb-1.5 block">Category</span><Select name="categoryId" defaultValue={filters.categoryId ?? ''}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          <label><span className="eyebrow mb-1.5 block">Brand</span><Select name="brandId" defaultValue={filters.brandId ?? ''}><option value="">All brands</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
          {filters.report === 'purchases' && <label><span className="eyebrow mb-1.5 block">Supplier</span><Select name="supplierId" defaultValue={filters.supplierId ?? ''}><option value="">All suppliers</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>}
          {['valuation', 'sales'].includes(filters.report) && <label><span className="eyebrow mb-1.5 block">Group by</span><Select name="groupBy" defaultValue={filters.report === 'valuation' ? (filters.groupBy === 'brand' ? 'brand' : 'category') : (filters.groupBy ?? 'day')}>{filters.report === 'sales' && <><option value="day">Day</option><option value="month">Month</option></>}<option value="category">Category</option><option value="brand">Brand</option></Select></label>}
          {filters.report === 'profit' && <><label><span className="eyebrow mb-1.5 block">Sort by</span><Select name="sort" defaultValue={filters.sort ?? 'profit'}><option value="profit">Profit</option><option value="revenue">Revenue</option><option value="cogs">COGS</option><option value="margin">Margin %</option><option value="quantity">Units</option></Select></label><label><span className="eyebrow mb-1.5 block">Direction</span><Select name="direction" defaultValue={filters.direction ?? 'desc'}><option value="desc">Highest first</option><option value="asc">Lowest first</option></Select></label></>}
          {filters.report === 'movements' && <><label><span className="eyebrow mb-1.5 block">Type</span><Select name="type" defaultValue={filters.type ?? ''}><option value="">All types</option>{MOVEMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label><label><span className="eyebrow mb-1.5 block">Reason</span><Select name="reason" defaultValue={filters.reason ?? ''}><option value="">All reasons</option>{MOVEMENT_REASONS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</Select></label><label><span className="eyebrow mb-1.5 block">Actor</span><Select name="actorId" defaultValue={filters.actorId ?? ''}><option value="">All actors</option>{uniqueActors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label></>}
          <div className="flex items-end gap-1.5"><button className="h-9 rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white" type="submit">Apply filters</button><Link className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[12px]" href={`/reports?report=${filters.report}`}>Reset</Link></div>
        </form>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.map((column) => {
          const value = report.totals[column.key] ?? 0;
          return <Card className="p-4" key={column.key}><p className="eyebrow">Total {column.label}</p><div className="mt-2 text-[18px] font-semibold">{column.type === 'money' ? formatBDT(value) : value.toLocaleString('en-BD')}</div></Card>;
        })}
      </div>

      <Card>
        <div className="border-b border-rule px-4 py-3"><h2 className="text-[14px] font-medium">{report.title}</h2><p className="mt-0.5 text-[11px] text-graphite">{report.description}</p></div>
        {report.rows.length === 0 ? <EmptyState title="No records match these filters." /> : <TableViewport><table className="w-full min-w-max"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">{report.columns.map((column) => <th key={column.key} className={`eyebrow px-4 py-2.5 ${['money', 'number'].includes(column.type) ? 'text-right' : 'text-left'}`}>{column.label}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-b border-rule-soft last:border-0">{report.columns.map((column) => <td key={column.key} className={`px-4 py-2.5 text-[12px] ${['money', 'number'].includes(column.type) ? 'text-right' : 'text-left'}`}>{displayCell(row.cells[column.key] ?? null, column)}</td>)}</tr>)}</tbody></table></TableViewport>}
        {report.note && <p className="border-t border-rule bg-plate/30 px-4 py-2 text-[11px] text-graphite">Method: {report.note}</p>}
      </Card>
    </>
  );
}
