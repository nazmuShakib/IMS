import type { ReportFilters, ReportResult, ReportRow } from './report-query';

export const summaryKeys = (kind: ReportResult['kind']): string[] =>
  ({
    valuation: ['value', 'quantity'],
    sales: ['revenue', 'cogs', 'profit', 'margin'],
    profit: ['revenue', 'cogs', 'profit', 'margin'],
    purchases: ['spend', 'quantity'],
    aging: ['value', 'quantity', 'agedValue'],
    shrinkage: ['value', 'damage', 'loss', 'quantity'],
    movements: ['added', 'removed', 'quantity'],
  })[kind];
export function chartMeasure(kind: ReportResult['kind']) {
  return kind === 'profit'
    ? 'profit'
    : kind === 'sales'
      ? 'revenue'
      : kind === 'purchases'
        ? 'spend'
        : 'value';
}
export function timeChartRows(
  rows: ReportRow[],
  filters: ReportFilters,
  bounds?: ReportResult['periodBounds'],
): ReportRow[] {
  if (filters.report !== 'sales' || !['day', 'month'].includes(filters.groupBy ?? 'day'))
    return rows;
  const month = filters.groupBy === 'month';
  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const first = filters.from?.slice(0, month ? 7 : 10) ?? bounds?.first ?? ordered[0]?.id;
  const last = filters.to?.slice(0, month ? 7 : 10) ?? bounds?.last ?? ordered.at(-1)?.id;
  if (!first || !last) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cursor = new Date(`${first}${month ? '-01' : ''}T00:00:00Z`),
    end = new Date(`${last}${month ? '-01' : ''}T00:00:00Z`);
  const filled: ReportRow[] = [];
  while (cursor <= end) {
    const id = cursor.toISOString().slice(0, month ? 7 : 10);
    filled.push(
      byId.get(id) ?? {
        id,
        cells: { group: id, quantity: 0, revenue: 0, cogs: 0, profit: 0, margin: null },
      },
    );
    if (month) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return filled;
}
export function finishReport(
  result: ReportResult,
  filters: ReportFilters,
  exporting = false,
): ReportResult {
  const all = result.rows;
  const totals = { ...result.totals };
  if (result.kind === 'movements') {
    totals.added = all.reduce((n, r) => n + Math.max(0, Number(r.cells.quantity)), 0);
    totals.removed = all.reduce((n, r) => n + Math.max(0, -Number(r.cells.quantity)), 0);
  }
  if (result.kind === 'aging')
    totals.agedValue = Number(all.find((r) => r.id === '91+')?.cells.value ?? 0);
  let chartRows = all,
    chartTotalCount = all.length;
  if (result.kind === 'movements') {
    const groups = new Map<string, ReportRow>();
    for (const row of all) {
      const id = String(row.cells.reason);
      const group = groups.get(id) ?? { id, cells: { reason: id, added: 0, removed: 0 } };
      const qty = Number(row.cells.quantity);
      group.cells.added = Number(group.cells.added) + Math.max(0, qty);
      group.cells.removed = Number(group.cells.removed) + Math.min(0, qty);
      groups.set(id, group);
    }
    chartRows = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
    chartTotalCount = chartRows.length;
  } else if (result.kind === 'sales' && ['day', 'month'].includes(filters.groupBy ?? 'day'))
    chartRows = timeChartRows(all, filters, result.periodBounds);
  else if (result.kind !== 'aging')
    chartRows = [...all]
      .sort(
        (a, b) =>
          Math.abs(Number(b.cells[chartMeasure(result.kind)])) -
            Math.abs(Number(a.cells[chartMeasure(result.kind)])) || a.id.localeCompare(b.id),
      )
      .slice(0, 10);
  const pageSize = filters.pageSize ?? 25,
    pageCount = Math.max(1, Math.ceil(all.length / pageSize)),
    page = Math.min(filters.page ?? 1, pageCount);
  return {
    ...result,
    filters,
    totals,
    chartRows,
    chartTotalCount,
    page,
    pageSize,
    pageCount,
    totalCount: all.length,
    rows: exporting ? all : all.slice((page - 1) * pageSize, page * pageSize),
  };
}
