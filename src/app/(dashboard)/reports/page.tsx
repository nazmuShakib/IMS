import { ReportWorkspace } from '@/components/reports/ReportWorkspace';
import { PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';
import { getReport, parseReportFilters, ReportQueryError } from '@/services/reports';
import { calculateReport } from '@/lib/report-calculations';
import { reportDate } from '@/lib/report-presentation';
export const dynamic = 'force-dynamic';
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageCapability('VIEW_REPORTS');
  const { locale } = await getSession(),
    t = createTranslator(locale),
    raw = await searchParams;
  let filters,
    invalid = false;
  try {
    filters = parseReportFilters(raw);
  } catch (error) {
    if (!(error instanceof ReportQueryError)) throw error;
    invalid = true;
    filters = parseReportFilters({ ...raw, from: undefined, to: undefined });
  }
  const [report, categories, brands, suppliers, actors, product] = await Promise.all([
    invalid
      ? calculateReport(
          {
            products: [],
            units: [],
            movements: [],
            productById: new Map(),
            categoryNames: new Map(),
            brandNames: new Map(),
            supplierNames: new Map(),
            actorNames: new Map(),
          },
          filters,
          new Date(),
        )
      : getReport(filters),
    db.categories.findAll(),
    db.brands.findAll(),
    filters.report === 'purchases' ? db.suppliers.findAll() : [],
    filters.report === 'movements' ? db.reports.actors() : [],
    filters.productId ? db.products.findById(filters.productId) : null,
  ]);
  return (
    <>
      <PageHeader
        title={t('reports.title')}
        count={t('reports.generated', { date: reportDate(report.generatedAt, locale) })}
      />
      <ReportWorkspace
        filters={{ ...filters, page: report.page ?? 1 }}
        report={report}
        invalid={invalid}
        initialDates={
          invalid
            ? {
                from: Array.isArray(raw.from) ? raw.from[0] : raw.from,
                to: Array.isArray(raw.to) ? raw.to[0] : raw.to,
              }
            : undefined
        }
        options={{
          categories: categories.map(({ id, name }) => ({ id, name })),
          brands: brands.map(({ id, name }) => ({ id, name })),
          suppliers: suppliers.map(({ id, name }) => ({ id, name })),
          actors,
        }}
        selectedProduct={product ? { id: product.id, name: product.name, sku: product.sku } : null}
      />
    </>
  );
}
