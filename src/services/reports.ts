import { db, type Repositories } from '@/repositories';
import { calculateReport } from '@/lib/report-calculations';
import { finishReport } from '@/lib/report-results';
import { parseReportFilters, type ReportFilters, type ReportResult } from '@/lib/report-query';
export * from '@/lib/report-query';

export async function getReport(
  filters: ReportFilters,
  options: {
    now?: Date;
    repositories?: Repositories;
    actorNames?: ReadonlyMap<string, string>;
    export?: boolean;
  } = {},
): Promise<ReportResult> {
  filters = parseReportFilters(
    Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  const repositories = options.repositories ?? db,
    now = options.now ?? new Date();
  if (repositories.reports)
    return options.export
      ? repositories.reports.export(filters, now)
      : repositories.reports.findPage(filters, now);
  // Compatibility for callers that inject the original repository seam.
  const [products, movements, categories, brands, suppliers, users] = await Promise.all([
    repositories.products.findAll(),
    repositories.movements.findByDateRange(new Date(0), now),
    repositories.categories.findAll(),
    repositories.brands.findAll(),
    repositories.suppliers.findAll(),
    repositories.users.findAll(),
  ]);
  const units = ['valuation', 'aging'].includes(filters.report)
    ? repositories.units.findAllInStock
      ? await repositories.units.findAllInStock()
      : (
          await Promise.all(
            products
              .filter((p) => p.trackingType === 'SERIAL')
              .map((p) => repositories.units.findByProduct(p.id)),
          )
        ).flat()
    : [];
  const result = calculateReport(
    {
      products,
      movements,
      units,
      productById: new Map(products.map((p) => [p.id, p])),
      categoryNames: new Map(categories.map((p) => [p.id, p.name])),
      brandNames: new Map(brands.map((p) => [p.id, p.name])),
      supplierNames: new Map(suppliers.map((p) => [p.id, p.name])),
      actorNames: new Map([
        ...users.map((p) => [p.id, p.name] as const),
        ...(options.actorNames ?? []),
      ]),
    },
    filters,
    now,
  );
  return finishReport(result, filters, options.export);
}
export async function getReportActorIds(
  now = new Date(),
  repositories: Repositories = db,
): Promise<Array<string | null>> {
  if (repositories.reports) return (await repositories.reports.actors()).map((x) => x.id);
  return (await repositories.movements.findByDateRange(new Date(0), now)).map((m) => m.actorId);
}
