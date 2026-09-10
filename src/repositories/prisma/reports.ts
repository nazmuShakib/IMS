import { Prisma } from '@prisma/client';
import { calculateReport } from '@/lib/report-calculations';
import { chartMeasure, timeChartRows } from '@/lib/report-results';
import type { ReportFilters, ReportResult, ReportRow } from '@/lib/report-query';
import type { ReportRepository } from '../types';

const emptyContext = {
  products: [],
  movements: [],
  units: [],
  productById: new Map(),
  categoryNames: new Map(),
  brandNames: new Map(),
  supplierNames: new Map(),
  actorNames: new Map(),
};
const sum = (key: string) => Prisma.sql`coalesce(sum((cells->>${key})::numeric),0)`;
/** Parameterized, one-snapshot query: source aggregation, full totals, chart aggregates, bounded page. */
export function reportSql(q: ReportFilters, now: Date, exporting = false): Prisma.Sql {
  const productConditions = [Prisma.sql`TRUE`];
  if (q.productId) productConditions.push(Prisma.sql`p.id = ${q.productId}`);
  if (q.categoryId) productConditions.push(Prisma.sql`p."categoryId" = ${q.categoryId}`);
  if (q.brandId) productConditions.push(Prisma.sql`p."brandId" = ${q.brandId}`);
  const products = Prisma.sql`SELECT p.* FROM products p WHERE ${Prisma.join(productConditions, ' AND ')}`;
  const isTime = q.report === 'sales' && ['day', 'month'].includes(q.groupBy ?? 'day');
  const timestamp = ['sales', 'profit'].includes(q.report)
    ? Prisma.sql`coalesce(m."occurredAt",m."createdAt")`
    : Prisma.sql`m."createdAt"`;
  const conditions = [Prisma.sql`TRUE`];
  if (q.from)
    conditions.push(
      Prisma.sql`${timestamp} >= (${q.from + 'T00:00:00+06:00'}::timestamptz AT TIME ZONE 'UTC')`,
    );
  if (q.to)
    conditions.push(
      Prisma.sql`${timestamp} <= (${q.to + 'T23:59:59.999+06:00'}::timestamptz AT TIME ZONE 'UTC')`,
    );
  if (q.supplierId) conditions.push(Prisma.sql`m."supplierId" = ${q.supplierId}`);
  if (q.type) conditions.push(Prisma.sql`m.type::text = ${q.type}`);
  if (q.reason) conditions.push(Prisma.sql`m.reason::text = ${q.reason}`);
  if (q.actorId) conditions.push(Prisma.sql`m."actorId" = ${q.actorId}`);
  const economic = Prisma.sql`CASE WHEN m.reason = 'CORRECTION' THEN coalesce(original.reason,m.reason) ELSE m.reason END`;
  if (['sales', 'profit'].includes(q.report)) conditions.push(Prisma.sql`${economic} = 'SALE'`);
  if (q.report === 'purchases') conditions.push(Prisma.sql`${economic} = 'PURCHASE'`);
  if (q.report === 'shrinkage') conditions.push(Prisma.sql`${economic} IN ('DAMAGE','LOSS')`);
  const ledger = Prisma.sql`SELECT m.*,p.name AS product,p.sku,p."categoryId",p."brandId",${economic} AS economic FROM stock_movements m JOIN selected_products p ON p.id=m."productId" LEFT JOIN stock_movements original ON original.id=m."reversesId" WHERE ${Prisma.join(conditions, ' AND ')}`;
  let base: Prisma.Sql;
  if (q.report === 'valuation') {
    const group =
      q.groupBy === 'brand'
        ? Prisma.sql`coalesce(p."brandId",'unbranded')`
        : Prisma.sql`p."categoryId"`;
    const label =
      q.groupBy === 'brand'
        ? Prisma.sql`coalesce(b.name,'__report_unbranded')`
        : Prisma.sql`coalesce(c.name,'__report_unknown')`;
    base = Prisma.sql`SELECT ${group} AS id,jsonb_build_object('group',${label},'quantity',sum(CASE WHEN p."trackingType"='SERIAL' THEN coalesce(u.quantity,0) ELSE p."quantityOnHand" END),'value',sum(CASE WHEN p."trackingType"='SERIAL' THEN coalesce(u.value,0) ELSE p."quantityOnHand"::bigint*p."avgCostPrice" END)) AS cells FROM selected_products p LEFT JOIN categories c ON c.id=p."categoryId" LEFT JOIN brands b ON b.id=p."brandId" LEFT JOIN (SELECT "productId",count(*) AS quantity,sum("costPrice"::bigint) AS value FROM product_units WHERE status='IN_STOCK' AND "productId" IN (SELECT id FROM selected_products) GROUP BY "productId") u ON u."productId"=p.id GROUP BY ${group},${label}`;
  } else if (q.report === 'aging') {
    base = Prisma.sql`WITH receipts AS (
      SELECT m.*,p."quantityOnHand",p."avgCostPrice",coalesce(sum(m.quantity) OVER (PARTITION BY m."productId" ORDER BY m."createdAt" DESC,m.id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS consumed
      FROM stock_movements m JOIN selected_products p ON p.id=m."productId" WHERE p."trackingType"='QUANTITY' AND m.quantity>0 AND m.reason IN ('PURCHASE','TRADE_IN','INITIAL_STOCK','CUSTOMER_RETURN') AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r."reversesId"=m.id)
    ), allocated AS (SELECT "productId","createdAt" AS received,greatest(0,least(quantity,"quantityOnHand"-consumed)) AS quantity,"avgCostPrice" AS cost FROM receipts), lots AS (
      SELECT received,quantity,cost FROM allocated WHERE quantity>0 UNION ALL
      SELECT p."createdAt",greatest(0,p."quantityOnHand"-coalesce(a.quantity,0)),p."avgCostPrice" FROM selected_products p LEFT JOIN (SELECT "productId",sum(quantity) AS quantity FROM allocated GROUP BY "productId") a ON a."productId"=p.id WHERE p."trackingType"='QUANTITY' UNION ALL
      SELECT u."receivedAt",1,u."costPrice" FROM product_units u JOIN selected_products p ON p.id=u."productId" WHERE u.status='IN_STOCK' AND p."trackingType"='SERIAL'
    ), aged AS (SELECT CASE WHEN extract(epoch FROM ((${now}::timestamptz AT TIME ZONE 'UTC')-received))/86400 <31 THEN '0–30' WHEN extract(epoch FROM ((${now}::timestamptz AT TIME ZONE 'UTC')-received))/86400 <61 THEN '31–60' WHEN extract(epoch FROM ((${now}::timestamptz AT TIME ZONE 'UTC')-received))/86400 <91 THEN '61–90' ELSE '91+' END AS bucket,quantity,quantity*cost AS value FROM lots)
    SELECT buckets.id,jsonb_build_object('bucket',buckets.id||' days','quantity',coalesce(sum(a.quantity),0),'value',coalesce(sum(a.value),0)) AS cells FROM (VALUES ('0–30'),('31–60'),('61–90'),('91+')) buckets(id) LEFT JOIN aged a ON a.bucket=buckets.id GROUP BY buckets.id`;
  } else if (['sales', 'profit'].includes(q.report)) {
    let group: Prisma.Sql, label: Prisma.Sql;
    if (q.report === 'profit') {
      group = Prisma.sql`m."productId"`;
      label = Prisma.sql`m.product`;
    } else if (q.groupBy === 'category') {
      group = Prisma.sql`m."categoryId"`;
      label = Prisma.sql`coalesce(c.name,'__report_unknown')`;
    } else if (q.groupBy === 'brand') {
      group = Prisma.sql`coalesce(m."brandId",'unbranded')`;
      label = Prisma.sql`coalesce(b.name,'__report_unbranded')`;
    } else {
      group = Prisma.sql`to_char(coalesce(m."occurredAt",m."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka',${q.groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'})`;
      label = group;
    }
    const productFields =
      q.report === 'profit' ? Prisma.sql`'product',label,'sku',sku,` : Prisma.sql`'group',label,`;
    base = Prisma.sql`WITH grouped AS (SELECT ${group} AS id,${label} AS label,${q.report === 'profit' ? Prisma.sql`m.sku` : Prisma.sql`NULL::text`} AS sku,sum(-m.quantity::bigint) AS quantity,sum(-m.quantity::bigint*coalesce(m."unitPrice",0)) AS revenue,sum(-m.quantity::bigint*m."unitCost") AS cogs FROM ledger m LEFT JOIN categories c ON c.id=m."categoryId" LEFT JOIN brands b ON b.id=m."brandId" GROUP BY 1,2,3) SELECT id,jsonb_build_object(${productFields}'quantity',quantity,'revenue',revenue,'cogs',cogs,'profit',revenue-cogs,'margin',round((revenue-cogs)*100.0/nullif(revenue,0),2)) AS cells FROM grouped WHERE quantity<>0 OR revenue<>0 OR cogs<>0`;
  } else if (q.report === 'purchases') {
    base = Prisma.sql`SELECT coalesce(m."supplierId",'unknown') AS id,jsonb_build_object('supplier',CASE WHEN m."supplierId" IS NULL THEN '__report_noSupplier' ELSE coalesce(s.name,'__report_unknownSupplier') END,'quantity',sum(m.quantity::bigint),'spend',sum(m.quantity::bigint*m."unitCost")) AS cells FROM ledger m LEFT JOIN suppliers s ON s.id=m."supplierId" GROUP BY m."supplierId",s.name HAVING sum(m.quantity::bigint)<>0 OR sum(m.quantity::bigint*m."unitCost")<>0`;
  } else if (q.report === 'shrinkage') {
    base = Prisma.sql`SELECT m."productId" AS id,jsonb_build_object('product',m.product,'sku',m.sku,'quantity',sum(-m.quantity::bigint),'damage',coalesce(sum(-m.quantity::bigint*m."unitCost") FILTER (WHERE m.economic='DAMAGE'),0),'loss',coalesce(sum(-m.quantity::bigint*m."unitCost") FILTER (WHERE m.economic='LOSS'),0),'value',sum(-m.quantity::bigint*m."unitCost")) AS cells FROM ledger m GROUP BY m."productId",m.product,m.sku HAVING sum(m.quantity::bigint)<>0 OR coalesce(sum(m.quantity::bigint*m."unitCost") FILTER (WHERE m.economic='DAMAGE'),0)<>0 OR coalesce(sum(m.quantity::bigint*m."unitCost") FILTER (WHERE m.economic='LOSS'),0)<>0`;
  } else {
    base = Prisma.sql`SELECT m.id,jsonb_build_object('date',to_char(m."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'occurredAt',to_char(coalesce(m."occurredAt",m."createdAt"),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'product',m.product,'sku',m.sku,'type',m.type,'reason',m.reason,'quantity',m.quantity,'unitCost',m."unitCost",'unitPrice',m."unitPrice",'actor',CASE WHEN m."actorId" IS NULL THEN '__report_system' ELSE coalesce(u.name,'__report_unknownUser') END,'reference',m.reference) AS cells FROM ledger m LEFT JOIN users u ON u.id=m."actorId"`;
  }
  const metric = chartMeasure(q.report);
  const order =
    q.report === 'movements'
      ? Prisma.sql`cells->>'date' DESC,id ASC`
      : isTime || q.report === 'aging'
        ? Prisma.sql`id ASC`
        : Prisma.sql`(cells->>${q.report === 'profit' ? (q.sort ?? 'profit') : metric})::numeric ${q.direction === 'asc' ? Prisma.sql`ASC NULLS LAST` : Prisma.sql`DESC NULLS LAST`},id ASC`;
  const keys = ['quantity', 'value', 'revenue', 'cogs', 'profit', 'spend', 'damage', 'loss'];
  const totals = Prisma.join(keys.map((key) => Prisma.sql`${key}::text,${sum(key)}`));
  const chart =
    q.report === 'movements'
      ? Prisma.sql`SELECT cells->>'reason' AS id,jsonb_build_object('reason',cells->>'reason','added',sum(greatest(0,(cells->>'quantity')::numeric)),'removed',sum(least(0,(cells->>'quantity')::numeric))) AS cells FROM base GROUP BY cells->>'reason' ORDER BY id`
      : Prisma.sql`SELECT * FROM base ORDER BY ${isTime || q.report === 'aging' ? Prisma.sql`id ASC` : Prisma.sql`abs((cells->>${metric})::numeric) DESC,id ASC`} ${isTime || q.report === 'aging' ? Prisma.empty : Prisma.sql`LIMIT 10`}`;
  const bounds = isTime
    ? Prisma.sql`(SELECT jsonb_build_object('first',to_char(min(coalesce("occurredAt","createdAt")) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka',${q.groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}::text),'last',to_char(max(coalesce("occurredAt","createdAt")) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka',${q.groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}::text)) FROM ledger)`
    : Prisma.sql`NULL::jsonb`;
  const size = q.pageSize ?? 25;
  return Prisma.sql`WITH selected_products AS (${products}), ${['valuation', 'aging'].includes(q.report) ? Prisma.empty : Prisma.sql`ledger AS (${ledger}),`} base AS (${base}), metadata AS (
    SELECT count(*)::integer AS count,jsonb_build_object(${totals},'added',coalesce(sum(greatest(0,(cells->>'quantity')::numeric)),0),'removed',coalesce(sum(greatest(0,-(cells->>'quantity')::numeric)),0),'agedValue',coalesce(sum((cells->>'value')::numeric) FILTER (WHERE id='91+'),0)) AS totals FROM base
  ), chart AS (${chart}), page AS (SELECT * FROM base ORDER BY ${order} ${exporting ? Prisma.empty : Prisma.sql`LIMIT ${size} OFFSET (SELECT (least(${q.page ?? 1},greatest(1,ceil(count::numeric/${size})))::integer-1)*${size} FROM metadata)`})
  SELECT ${bounds} AS bounds,metadata.count,metadata.totals,coalesce((SELECT jsonb_agg(page) FROM page),'[]'::jsonb) AS rows,coalesce((SELECT jsonb_agg(chart) FROM chart),'[]'::jsonb) AS chart FROM metadata`;
}
export function prismaReports(client: Prisma.TransactionClient): ReportRepository {
  async function query(
    filters: ReportFilters,
    now: Date,
    exporting = false,
  ): Promise<ReportResult> {
    const [data] = await client.$queryRaw<
      Array<{
        count: number;
        bounds: { first: string | null; last: string | null } | null;
        totals: Record<string, number>;
        rows: ReportRow[];
        chart: ReportRow[];
      }>
    >(reportSql(filters, now, exporting));
    if (!data) throw new Error('Report query returned no metadata');
    const metadata = calculateReport(emptyContext, filters, now),
      pageSize = filters.pageSize ?? 25,
      pageCount = Math.max(1, Math.ceil(data.count / pageSize));
    const totalKeys = [
      ...Object.keys(metadata.totals),
      ...(filters.report === 'movements'
        ? ['added', 'removed']
        : filters.report === 'aging'
          ? ['agedValue']
          : []),
    ];
    const totals = Object.fromEntries(totalKeys.map((key) => [key, data.totals[key] ?? 0]));
    const periodBounds =
      data.bounds?.first && data.bounds.last
        ? { first: data.bounds.first, last: data.bounds.last }
        : undefined;
    return {
      ...metadata,
      ...(filters.report === 'sales' || filters.report === 'profit' ? { periodBounds } : {}),
      filters,
      rows: data.rows,
      totals,
      totalCount: data.count,
      pageSize,
      pageCount,
      page: Math.min(filters.page ?? 1, pageCount),
      chartRows: timeChartRows(data.chart, filters, periodBounds),
      chartTotalCount: filters.report === 'movements' ? data.chart.length : data.count,
    };
  }
  return {
    findPage: (q, now) => query(q, now),
    export: (q, now) => query(q, now, true),
    actors: () =>
      client.user.findMany({
        where: { movements: { some: {} } },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    products: (q) =>
      client.product.findMany({
        where: q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { sku: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        select: { id: true, name: true, sku: true },
        take: 20,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
  };
}
