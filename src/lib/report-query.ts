import {
  MOVEMENT_REASONS,
  MOVEMENT_TYPES,
  type MovementReason,
  type MovementType,
} from '@/domain/types';
export const REPORT_KINDS = [
  'valuation',
  'sales',
  'profit',
  'purchases',
  'aging',
  'shrinkage',
  'movements',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportGroup = 'day' | 'month' | 'category' | 'brand';

export interface ReportFilters {
  report: ReportKind;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  type?: MovementType;
  reason?: MovementReason;
  actorId?: string;
  groupBy?: ReportGroup;
  sort?: 'revenue' | 'cogs' | 'profit' | 'margin' | 'quantity' | 'value';
  direction?: 'asc' | 'desc';
}

export type ReportCell = string | number | null;
export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'date' | 'percent' | 'enum' | 'period';
}
export interface ReportRow {
  id: string;
  cells: Record<string, ReportCell>;
}
export interface ReportResult {
  kind: ReportKind;
  title: string;
  description: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  note?: string;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  totalCount?: number;
  chartRows?: ReportRow[];
  periodBounds?: { first: string; last: string };
  chartTotalCount?: number;
  filters?: ReportFilters;
  filterContext?: Array<{ label: string; value: string }>;
}

export class ReportQueryError extends Error {
  constructor(public details: Record<string, string>) {
    super('Invalid report filters');
  }
}
export function parseReportFilters(
  raw: Record<string, string | string[] | undefined>,
): ReportFilters {
  const one = (key: string) =>
    (Array.isArray(raw[key]) ? raw[key]![0] : raw[key])?.trim() || undefined;
  const report = REPORT_KINDS.includes(one('report') as ReportKind)
    ? (one('report') as ReportKind)
    : 'valuation';
  const dated = !['valuation', 'aging'].includes(report);
  const from = dated ? one('from') : undefined,
    to = dated ? one('to') : undefined;
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries({ from, to })) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number(value.slice(0, 4)) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      details[key] = 'Enter a valid calendar date.';
  }
  if (!Object.keys(details).length && from && to && from > to)
    details.to = 'End date must be on or after start date.';
  if (Object.keys(details).length) throw new ReportQueryError(details);
  const [sort, direction] = (
    one('order') ?? `${one('sort') ?? 'profit'}-${one('direction') ?? 'desc'}`
  ).split('-');
  const group = one('groupBy');
  return {
    report,
    from,
    to,
    productId: one('productId'),
    categoryId: one('categoryId'),
    brandId: one('brandId'),
    supplierId: report === 'purchases' ? one('supplierId') : undefined,
    actorId: report === 'movements' ? one('actorId') : undefined,
    type:
      report === 'movements' && MOVEMENT_TYPES.includes(one('type') as MovementType)
        ? (one('type') as MovementType)
        : undefined,
    reason:
      report === 'movements' && MOVEMENT_REASONS.includes(one('reason') as MovementReason)
        ? (one('reason') as MovementReason)
        : undefined,
    groupBy:
      report === 'valuation'
        ? group === 'brand'
          ? 'brand'
          : 'category'
        : report === 'sales'
          ? ['day', 'month', 'category', 'brand'].includes(group ?? '')
            ? (group as ReportGroup)
            : 'day'
          : undefined,
    sort:
      report === 'profit'
        ? ['revenue', 'cogs', 'profit', 'margin', 'quantity'].includes(sort ?? '')
          ? (sort as ReportFilters['sort'])
          : 'profit'
        : undefined,
    direction: report === 'profit' ? (direction === 'asc' ? 'asc' : 'desc') : undefined,
    page: Math.max(1, Math.min(1_000_000, Math.floor(Number(one('page')) || 1))),
    pageSize: [25, 50, 100].includes(Number(one('pageSize'))) ? Number(one('pageSize')) : 25,
  };
}
export function reportParams(filters: ReportFilters, includePage = true): URLSearchParams {
  const raw = Object.fromEntries(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const normalized = parseReportFilters(raw);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalized))
    if (value !== undefined && (includePage || !['page', 'pageSize'].includes(key)))
      params.set(key, String(value));
  return params;
}
export function reportHref(filters: ReportFilters) {
  return `/reports?${reportParams(filters)}`;
}
export function reportRaw(params: URLSearchParams) {
  return Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.get(key) ?? '']));
}
