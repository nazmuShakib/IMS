import { createTranslator, type MessageKey } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';
import type {
  ReportKind,
  ReportColumn,
  ReportFilters,
  ReportCell,
  ReportResult,
} from './report-query';
import { parseReportFilters } from './report-query';
import { formatBDT } from './money';
import { reportText, reportEnum } from './report-copy';
export const REPORT_LABEL_KEYS: Record<ReportKind, MessageKey> = {
  valuation: 'reports.valuation',
  sales: 'reports.sales',
  profit: 'reports.profit',
  purchases: 'reports.purchases',
  aging: 'reports.aging',
  shrinkage: 'reports.shrinkage',
  movements: 'reports.movements',
};

type Translator = ReturnType<typeof createTranslator>;

export const REPORT_TITLE_KEYS: Record<ReportKind, MessageKey> = {
  valuation: 'reports.titleValuation',
  sales: 'reports.titleSales',
  profit: 'reports.titleProfit',
  purchases: 'reports.titlePurchases',
  aging: 'reports.titleAging',
  shrinkage: 'reports.titleShrinkage',
  movements: 'reports.titleMovements',
};

export function reportDescription(
  t: Translator,
  filters: ReturnType<typeof parseReportFilters>,
): string {
  if (filters.report === 'valuation') {
    return t('reports.descriptionValuation', {
      group: t(filters.groupBy === 'brand' ? 'common.brand' : 'common.category'),
    });
  }
  if (filters.report === 'sales') {
    const group = filters.groupBy ?? 'day';
    const key: MessageKey =
      group === 'brand'
        ? 'common.brand'
        : group === 'category'
          ? 'common.category'
          : group === 'month'
            ? 'reports.month'
            : 'reports.day';
    return t('reports.descriptionSales', { group: t(key) });
  }
  const keys: Record<Exclude<ReportKind, 'valuation' | 'sales'>, MessageKey> = {
    profit: 'reports.descriptionProfit',
    purchases: 'reports.descriptionPurchases',
    aging: 'reports.descriptionAging',
    shrinkage: 'reports.descriptionShrinkage',
    movements: 'reports.descriptionMovements',
  };
  return t(keys[filters.report]);
}

export function columnLabel(t: Translator, report: ReportKind, column: ReportColumn): string {
  const generic: Record<string, MessageKey> = {
    product: 'common.product',
    sku: 'term.productCode',
    revenue: 'dashboard.revenue',
    cogs: 'reports.cogs',
    profit: 'reports.salesProfit',
    margin: 'reports.marginPercent',
    supplier: 'common.supplier',
    spend: 'reports.spend',
    bucket: 'reports.age',
    damage: 'reports.damage',
    loss: 'reports.loss',
    date: 'invoice.recordedOn',
    occurredAt: 'checkout.actualSaleTime',
    type: 'reports.type',
    reason: 'stock.reason',
    unitCost: 'reports.unitCost',
    unitPrice: 'reports.unitPrice',
    actor: 'reports.actor',
    reference: 'common.reference',
  };
  if (column.key === 'group') {
    return report === 'valuation'
      ? t(column.label === 'Brand' ? 'common.brand' : 'common.category')
      : t('reports.periodGroup');
  }
  if (column.key === 'quantity') {
    return t(report === 'sales' || report === 'profit' ? 'reports.unitsSold' : 'reports.units');
  }
  if (column.key === 'value') {
    return t(report === 'shrinkage' ? 'common.total' : 'reports.valueAtCost');
  }
  const key = generic[column.key];
  return key ? t(key) : column.label;
}

export function reportDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}
export function reportPeriod(value: string, locale: Locale) {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: value.length === 10 ? 'numeric' : undefined,
  }).format(new Date(`${value}${value.length === 7 ? '-01' : ''}T00:00:00+06:00`));
}
export function presentCell(value: ReportCell, column: ReportColumn, locale: Locale): string {
  if (value === null || value === '') return '—';
  if (column.type === 'money') return formatBDT(Number(value));
  if (column.type === 'period') return reportPeriod(String(value), locale);
  if (column.type === 'date') return reportDate(String(value), locale);
  if (column.type === 'percent')
    return `${Number(value).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD', { maximumFractionDigits: 2 })}%`;
  if (column.type === 'number')
    return Number(value).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD');
  if (column.type === 'enum') return reportEnum(locale, String(value));
  if (column.key === 'bucket')
    return `${String(value)
      .replace(' days', '')
      .replace(/\d/g, (d) =>
        locale === 'bn' ? '০১২৩৪৫৬৭৮৯'[Number(d)]! : d,
      )} ${reportText(locale, 'days')}`;
  if (String(value).startsWith('__report_')) return reportEnum(locale, String(value));
  return String(value);
}
export function summaryColumn(key: string, result: ReportResult, locale: Locale): ReportColumn {
  const existing = result.columns.find((c) => c.key === key);
  if (!result.filters && existing) return existing;
  let label = existing ? columnLabel(createTranslator(locale), result.kind, existing) : key;
  if (key === 'value')
    label = reportText(locale, result.kind === 'shrinkage' ? 'shrinkageValue' : 'stockValue');
  if (key === 'quantity' && ['valuation', 'aging'].includes(result.kind))
    label = reportText(locale, 'onHand');
  if (key === 'quantity' && result.kind === 'purchases') label = reportText(locale, 'received');
  if (key === 'margin') label = reportText(locale, 'overallMargin');
  if (key === 'quantity' && result.kind === 'movements') label = reportText(locale, 'net');
  if (key === 'added') label = reportText(locale, 'added');
  if (key === 'removed') label = reportText(locale, 'removed');
  if (key === 'agedValue') label = reportText(locale, 'agedValue');
  return { key, label, type: existing?.type ?? (key === 'agedValue' ? 'money' : 'number') };
}
export function summaryValue(result: ReportResult, key: string) {
  return key === 'margin'
    ? result.totals.revenue
      ? ((result.totals.profit ?? 0) / result.totals.revenue) * 100
      : null
    : (result.totals[key] ?? 0);
}
export function localizeReport(report: ReportResult, locale: Locale): ReportResult {
  // These utilities also serve expense and supplier exports with their own metadata.
  if (!report.filters) return report;
  const t = createTranslator(locale);
  return {
    ...report,
    title: t(REPORT_TITLE_KEYS[report.kind]),
    description: reportDescription(t, report.filters ?? { report: report.kind }),
    note: report.note ? t('reports.agingNote') : undefined,
    columns: report.columns.map((c) => ({ ...c, label: columnLabel(t, report.kind, c) })),
  };
}
