'use client';
import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Card, EmptyState, Input, Select, TableViewport } from '@/components/ui';
import { CatalogPagination } from '@/components/catalog/CatalogPagination';
import { useI18n } from '@/components/i18n/I18nProvider';
import { MOVEMENT_REASONS, MOVEMENT_TYPES } from '@/domain/types';
import {
  parseReportFilters,
  reportHref,
  reportRaw,
  reportParams,
  REPORT_KINDS,
  type ReportFilters,
  type ReportResult,
  type ReportKind,
} from '@/lib/report-query';
import {
  columnLabel,
  presentCell,
  reportDescription,
  REPORT_LABEL_KEYS,
  REPORT_TITLE_KEYS,
  summaryColumn,
  summaryValue,
} from '@/lib/report-presentation';
import { reportEnum, reportText } from '@/lib/report-copy';
import { summaryKeys } from '@/lib/report-results';
import { ReportProductLookup, type ReportProduct } from './ReportProductLookup';
type Option = { id: string; name: string };
function summaryTone(key: string, kind: ReportResult['kind'], value: number | null) {
  if (
    ['damage', 'loss', 'removed'].includes(key) ||
    (key === 'value' && kind === 'shrinkage') ||
    (['profit', 'margin'].includes(key) && value !== null && value < 0)
  )
    return 'border-rose-200! border-t-rose-500! bg-rose-50! text-rose-950';
  if (['cogs', 'spend', 'agedValue'].includes(key))
    return 'border-amber-200! border-t-amber-500! bg-amber-50! text-amber-950';
  if (['profit', 'added'].includes(key))
    return 'border-emerald-200! border-t-emerald-500! bg-emerald-50! text-emerald-950';
  if (key === 'margin')
    return 'border-violet-200! border-t-violet-500! bg-violet-50! text-violet-950';
  if (['revenue', 'value'].includes(key))
    return 'border-blue-200! border-t-blue-500! bg-blue-50! text-blue-950';
  return 'border-slate-200! border-t-slate-400! bg-slate-50! text-slate-900';
}
const button =
  'inline-flex h-9 items-center justify-center rounded-[3px] border border-rule bg-card px-3 text-[12px] disabled:opacity-50';
export function ReportWorkspace({
  filters,
  report,
  options,
  selectedProduct,
  invalid = false,
  initialDates,
}: {
  filters: ReportFilters;
  report: ReportResult;
  options: { categories: Option[]; brands: Option[]; suppliers: Option[]; actors: Option[] };
  selectedProduct: ReportProduct | null;
  invalid?: boolean;
  initialDates?: { from?: string; to?: string };
}) {
  const router = useRouter(),
    { locale, t } = useI18n();
  const appliedKey = reportParams(filters, false).toString();
  const [draft, setDraft] = useState<Record<string, string>>(
    () =>
      ({ ...Object.fromEntries(reportParams(filters)), ...initialDates }) as Record<string, string>,
  );
  const [error, setError] = useState(invalid),
    [pending, startTransition] = useTransition();
  useEffect(() => {
    setDraft({
      ...Object.fromEntries(new URLSearchParams(appliedKey)),
      ...(invalid ? initialDates : {}),
    } as Record<string, string>);
    setError(invalid);
  }, [appliedKey, invalid]);
  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  function navigate(next: ReportFilters) {
    const href = reportHref(next);
    try {
      const current = parseReportFilters(reportRaw(new URLSearchParams(window.location.search)));
      if (window.location.pathname === '/reports' && href === reportHref(current)) return;
    } catch {
      /* An invalid URL must remain replaceable by corrected filters. */
    }
    startTransition(() => router.push(href, { scroll: false }));
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    try {
      const next = parseReportFilters({
        ...draft,
        report: filters.report,
        page: '1',
        pageSize: String(filters.pageSize ?? 25),
      });
      setError(false);
      navigate(next);
    } catch {
      setError(true);
    }
  }
  function switchReport(report: ReportKind) {
    navigate(
      parseReportFilters({ ...Object.fromEntries(reportParams(filters)), report, page: '1' }),
    );
  }
  function reset() {
    const next = parseReportFilters({
      report: filters.report,
      pageSize: String(filters.pageSize ?? 25),
    });
    setDraft(Object.fromEntries(reportParams(next)));
    setError(false);
    navigate(next);
  }
  const select = (key: string, label: string, items: Option[], all: string) => (
    <label>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <Select value={draft[key] ?? ''} onChange={(e) => set(key, e.target.value)}>
        <option value="">{all}</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </Select>
    </label>
  );
  const exportQuery = reportParams(filters, false).toString();
  return (
    <section aria-busy={pending}>
      <fieldset disabled={pending} inert={pending || undefined} className="min-w-0">
        <div className="mb-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
          <label className="min-w-0 flex-1 md:hidden">
            <span className="eyebrow mb-1 block">{reportText(locale, 'select')}</span>
            <Select
              value={filters.report}
              onChange={(e) => switchReport(e.target.value as ReportKind)}
            >
              {REPORT_KINDS.map((id) => (
                <option key={id} value={id}>
                  {t(REPORT_LABEL_KEYS[id])}
                </option>
              ))}
            </Select>
          </label>
          <nav
            aria-label={reportText(locale, 'select')}
            className="hidden flex-wrap gap-1.5 md:flex"
          >
            {REPORT_KINDS.map((id) => (
              <a
                key={id}
                href={reportHref(
                  parseReportFilters({
                    ...Object.fromEntries(reportParams(filters)),
                    report: id,
                    page: '1',
                  }),
                )}
                aria-current={filters.report === id ? 'page' : undefined}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                    e.preventDefault();
                    if (!pending) switchReport(id);
                  }
                }}
                className={`rounded-[3px] border px-2.5 py-1.5 text-[12px] ${filters.report === id ? 'border-ink bg-ink text-white' : 'border-rule bg-card text-graphite'}`}
              >
                {t(REPORT_LABEL_KEYS[id])}
              </a>
            ))}
          </nav>
          <div
            className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0"
            inert={pending || invalid || undefined}
          >
            <a
              className={`${button} border-emerald-700! bg-emerald-700! text-white hover:bg-emerald-800!`}
              href={`/api/reports/export?${exportQuery}&format=csv`}
              aria-disabled={pending || invalid || undefined}
            >
              {t('reports.exportCsv')}
            </a>
            <a
              className={`${button} border-rose-700! bg-rose-700! text-white hover:bg-rose-800!`}
              href={`/api/reports/export?${exportQuery}&format=pdf`}
              aria-disabled={pending || invalid || undefined}
            >
              {t('reports.exportPdf')}
            </a>
          </div>
        </div>
        <Card className="mb-4 p-3 sm:p-4">
          <form onSubmit={apply}>
            <div className="flex flex-wrap items-end gap-3">
              {!['valuation', 'aging'].includes(filters.report) &&
                ['from', 'to'].map((key) => (
                  <label key={key} className="min-w-0 flex-1 basis-36 sm:max-w-52">
                    <span className="eyebrow mb-1.5 block">
                      {t(key === 'from' ? 'reports.from' : 'reports.to')}
                    </span>
                    <Input
                      type="date"
                      value={draft[key] ?? ''}
                      onChange={(e) => set(key, e.target.value)}
                      aria-invalid={error || undefined}
                      aria-describedby={error ? 'report-filter-error' : undefined}
                    />
                  </label>
                ))}
              {['valuation', 'sales'].includes(filters.report) && (
                <label className="min-w-40">
                  <span className="eyebrow mb-1.5 block">{t('reports.groupBy')}</span>
                  <Select
                    value={draft.groupBy ?? (filters.report === 'valuation' ? 'category' : 'day')}
                    onChange={(e) => set('groupBy', e.target.value)}
                  >
                    {filters.report === 'sales' && (
                      <>
                        <option value="day">{t('reports.day')}</option>
                        <option value="month">{t('reports.month')}</option>
                      </>
                    )}
                    <option value="category">{t('common.category')}</option>
                    <option value="brand">{t('common.brand')}</option>
                  </Select>
                </label>
              )}
              {filters.report === 'profit' && (
                <label>
                  <span className="eyebrow mb-1.5 block">{t('reports.orderBy')}</span>
                  <Select
                    value={draft.order ?? `${draft.sort ?? 'profit'}-${draft.direction ?? 'desc'}`}
                    onChange={(e) => set('order', e.target.value)}
                  >
                    {(['profit', 'revenue', 'cogs', 'margin', 'quantity'] as const).flatMap((key) =>
                      ['desc', 'asc'].map((direction) => (
                        <option key={`${key}-${direction}`} value={`${key}-${direction}`}>
                          {columnLabel(t, report.kind, { key, label: key, type: 'number' })} ·{' '}
                          {t(direction === 'desc' ? 'reports.highest' : 'reports.lowest')}
                        </option>
                      )),
                    )}
                  </Select>
                </label>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ReportProductLookup
                value={draft.productId ?? ''}
                selected={selectedProduct}
                onChange={(id) => set('productId', id)}
              />
              {select(
                'categoryId',
                t('common.category'),
                options.categories,
                t('reports.allCategories'),
              )}
              {select('brandId', t('common.brand'), options.brands, t('reports.allBrands'))}
              {filters.report === 'purchases' &&
                select(
                  'supplierId',
                  t('common.supplier'),
                  options.suppliers,
                  t('reports.allSuppliers'),
                )}
              {filters.report === 'movements' && (
                <>
                  {select(
                    'type',
                    t('reports.type'),
                    MOVEMENT_TYPES.map((id) => ({ id, name: reportEnum(locale, id) })),
                    t('reports.allTypes'),
                  )}
                  {select(
                    'reason',
                    t('stock.reason'),
                    MOVEMENT_REASONS.map((id) => ({ id, name: reportEnum(locale, id) })),
                    t('reports.allReasons'),
                  )}
                  {select('actorId', t('reports.actor'), options.actors, t('reports.allActors'))}
                </>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" className={`${button} border-signal! bg-signal! text-white`}>
                {t('common.applyFilters')}
              </button>
              <button type="button" className={button} onClick={reset}>
                {t('common.reset')}
              </button>
            </div>
            {error && (
              <p role="alert" id="report-filter-error" className="mt-3 text-[12px] text-out">
                {reportText(locale, 'invalid')}
              </p>
            )}
            <p className="mt-3 text-[11px] text-graphite">
              {reportText(
                locale,
                filters.report === 'valuation'
                  ? 'valuationBasis'
                  : filters.report === 'aging'
                    ? 'current'
                    : ['sales', 'profit'].includes(filters.report)
                      ? 'actual'
                      : 'recorded',
              )}
              {!['valuation', 'aging'].includes(filters.report) && !filters.from && !filters.to
                ? ` · ${reportText(locale, 'allData')}`
                : ''}
            </p>
          </form>
        </Card>
      </fieldset>
      <div className="relative">
        <div inert={pending || undefined} className="space-y-4">
          {!invalid && (
            <>
              <div className="flex flex-wrap gap-3">
                {summaryKeys(report.kind).map((key) => {
                  const column = summaryColumn(key, report, locale);
                  const value = summaryValue(report, key);
                  return (
                    <Card
                      key={key}
                      className={`min-w-36 flex-1 rounded-md! border-t-2 px-4 py-3 sm:max-w-80 ${summaryTone(key, report.kind, value)}`}
                    >
                      <p className="eyebrow text-current! opacity-80">{column.label}</p>
                      <p className="mt-1 text-[18px] font-semibold tnum">
                        {presentCell(value, column, locale)}
                      </p>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <div className="border-b border-rule px-4 py-3">
                  <h2 className="text-[14px] font-medium">{t(REPORT_TITLE_KEYS[report.kind])}</h2>
                  <p className="mt-1 text-[11px] text-graphite">
                    {report.kind === 'purchases'
                      ? reportText(locale, 'receipts')
                      : reportDescription(t, filters)}
                  </p>
                </div>
                {!report.rows.length ? (
                  <EmptyState title={t('reports.noMatch')} />
                ) : (
                  <TableViewport>
                    <table className="w-full min-w-max">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr>
                          {report.columns.map((c) => (
                            <th
                              key={c.key}
                              className={`eyebrow border-b border-rule px-4 py-2.5 ${['number', 'money', 'percent'].includes(c.type) ? 'text-right' : 'text-left'}`}
                            >
                              {columnLabel(t, report.kind, c)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map((r) => (
                          <tr key={r.id} className="border-b border-rule-soft last:border-0">
                            {report.columns.map((c) => (
                              <td
                                key={c.key}
                                className={`px-4 py-2.5 text-[12px] ${['number', 'money', 'percent'].includes(c.type) ? 'text-right tnum' : 'text-left'}`}
                              >
                                {presentCell(r.cells[c.key] ?? null, c, locale)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableViewport>
                )}
                <CatalogPagination
                  pending={pending}
                  meta={{
                    page: report.page ?? 1,
                    pageSize: report.pageSize ?? 25,
                    pageCount: report.pageCount ?? 1,
                    totalCount: report.totalCount ?? report.rows.length,
                  }}
                  onChange={(page) => navigate({ ...filters, ...page })}
                />
              </Card>
            </>
          )}
        </div>
        {pending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80">
            <LoadingScreen compact />
          </div>
        )}
      </div>
    </section>
  );
}
