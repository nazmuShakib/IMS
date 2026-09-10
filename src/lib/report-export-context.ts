import { db } from '@/repositories';
import { createTranslator, type MessageKey } from './i18n/messages';
import type { Locale } from './i18n/config';
import { reportEnum } from './report-copy';
import { reportPeriod } from './report-presentation';
import type { ReportFilters } from './report-query';
export async function reportExportContext(filters: ReportFilters, locale: Locale) {
  const t = createTranslator(locale);
  const references = [
    ['productId', 'common.product', db.products],
    ['categoryId', 'common.category', db.categories],
    ['brandId', 'common.brand', db.brands],
    ['supplierId', 'common.supplier', db.suppliers],
    ['actorId', 'reports.actor', db.users],
  ] as const;
  const items = await Promise.all(
    references.map(async ([key, label, repository]) => {
      const id = filters[key];
      if (!id) return null;
      const record = await repository.findById(id);
      return { label: t(label), value: record?.name ?? id };
    }),
  );
  const result = items.filter((x): x is { label: string; value: string } => Boolean(x));
  if (filters.from)
    result.unshift({ label: t('reports.from'), value: reportPeriod(filters.from, locale) });
  if (filters.to) result.push({ label: t('reports.to'), value: reportPeriod(filters.to, locale) });
  if (filters.groupBy) {
    const labels: Record<string, MessageKey> = {
      day: 'reports.day',
      month: 'reports.month',
      category: 'common.category',
      brand: 'common.brand',
    };
    result.push({ label: t('reports.groupBy'), value: t(labels[filters.groupBy]!) });
  }
  if (filters.type)
    result.push({ label: t('reports.type'), value: reportEnum(locale, filters.type) });
  if (filters.reason)
    result.push({ label: t('stock.reason'), value: reportEnum(locale, filters.reason) });
  if (filters.sort) {
    const labels: Record<string, MessageKey> = {
      profit: 'reports.salesProfit',
      revenue: 'dashboard.revenue',
      cogs: 'reports.cogs',
      margin: 'reports.marginPercent',
      quantity: 'reports.units',
    };
    result.push({
      label: t('reports.orderBy'),
      value: `${t(labels[filters.sort]!)} · ${t(filters.direction === 'asc' ? 'reports.lowest' : 'reports.highest')}`,
    });
  }
  return result;
}
