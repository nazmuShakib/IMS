import { Prisma } from '@prisma/client';
import type { Product, ProductUnit } from '@/domain/types';
import type { ProductQuery, ProductPageResult, UnitQuery, UnitPageResult } from '@/lib/catalog-query';
import { unitRangeErrors } from '@/lib/catalog-query';
import { parseBDT } from '@/lib/money';

type Client = Prisma.TransactionClient;
const and = (conditions: Prisma.Sql[]) => Prisma.join(conditions, ' AND ');
const contains = (column: Prisma.Sql, value: string) => Prisma.sql`position(lower(${value}) in lower(coalesce(${column}, ''))) > 0`;
// Natural numeric ordering without an extension or a database collation migration.
const naturalName = Prisma.sql`ARRAY(SELECT CASE WHEN parts[1] ~ '^[0-9]+$'
  THEN chr(1) || lpad(length(ltrim(parts[1], '0'))::text, 10, '0') || ltrim(parts[1], '0')
  ELSE lower(parts[1]) END FROM regexp_matches(name, '([0-9]+|[^0-9]+)', 'g') WITH ORDINALITY AS tokens(parts, n) ORDER BY n)`;
const productOrders: Record<string, Prisma.Sql> = {
  'name-asc': Prisma.sql`${naturalName} ASC`, 'name-desc': Prisma.sql`${naturalName} DESC`,
  newest: Prisma.sql`"createdAt" DESC`, oldest: Prisma.sql`"createdAt" ASC`,
  'stock-asc': Prisma.sql`"onHand" ASC`, 'stock-desc': Prisma.sql`"onHand" DESC`,
  'cost-asc': Prisma.sql`"defaultCostPrice" ASC`, 'cost-desc': Prisma.sql`"defaultCostPrice" DESC`,
  'price-asc': Prisma.sql`"defaultSalePrice" ASC`, 'price-desc': Prisma.sql`"defaultSalePrice" DESC`,
};
const unitOrders: Record<string, Prisma.Sql> = {
  'in-stock-first': Prisma.sql`(status = 'IN_STOCK') DESC, "receivedAt" DESC`,
  newest: Prisma.sql`"receivedAt" DESC`, oldest: Prisma.sql`"receivedAt" ASC`,
  'cost-asc': Prisma.sql`"costPrice" ASC NULLS LAST`, 'cost-desc': Prisma.sql`"costPrice" DESC NULLS LAST`,
  'profit-asc': Prisma.sql`("salePrice" - "costPrice") ASC NULLS LAST`, 'profit-desc': Prisma.sql`("salePrice" - "costPrice") DESC NULLS LAST`,
  'serial-asc': Prisma.sql`lower("serialNo") ASC, "serialNo" ASC`,
};
/** One statement gives page rows and all aggregates the same PostgreSQL snapshot. */
export function productsPageSql(q: ProductQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q.status !== 'all') conditions.push(Prisma.sql`"isActive" = ${q.status === 'active'}`);
  if (q.tracking) conditions.push(Prisma.sql`"trackingType"::text = ${q.tracking}`);
  if (q.category) conditions.push(Prisma.sql`"categoryId" = ${q.category}`);
  if (q.brand) conditions.push(Prisma.sql`"brandId" = ${q.brand}`);
  if (q.q) conditions.push(Prisma.sql`(${contains(Prisma.sql`name`, q.q)} OR ${contains(Prisma.sql`sku`, q.q)} OR ${contains(Prisma.sql`model`, q.q)} OR ${contains(Prisma.sql`barcode`, q.q)})`);
  if (q.stock === 'on-hand') conditions.push(Prisma.sql`"onHand" > 0`);
  if (q.stock === 'low') conditions.push(Prisma.sql`"onHand" > 0 AND "onHand" <= "reorderPoint"`);
  if (q.stock === 'out') conditions.push(Prisma.sql`"onHand" = 0`);
  if (q.stock === 'dead') conditions.push(Prisma.sql`"onHand" > 0 AND "inactiveSince" <= (${q.now}::timestamptz AT TIME ZONE 'UTC') - interval '60 days'`);
  const activity = q.stock === 'dead' ? Prisma.sql`SELECT m."productId",
    min(m."createdAt") FILTER (WHERE m.quantity > 0) AS "firstIn",
    max(m."createdAt") FILTER (WHERE m.quantity < 0) AS "lastOut"
    FROM stock_movements m WHERE m.reason <> 'CORRECTION' AND NOT EXISTS
      (SELECT 1 FROM stock_movements reversal WHERE reversal.reason = 'CORRECTION' AND reversal."reversesId" = m.id)
    GROUP BY m."productId"` : Prisma.sql`SELECT NULL::text AS "productId", NULL::timestamp AS "firstIn", NULL::timestamp AS "lastOut" WHERE FALSE`;
  return Prisma.sql`WITH inventory AS (
      SELECT "productId", count(*)::integer AS n FROM product_units WHERE status = 'IN_STOCK' GROUP BY "productId"
    ), activity AS (${activity}), base AS (
      SELECT p.*, CASE WHEN p."trackingType" = 'SERIAL' THEN coalesce(i.n, 0) ELSE p."quantityOnHand" END AS "onHand",
        coalesce(a."lastOut", a."firstIn", p."createdAt") AS "inactiveSince"
      FROM products p LEFT JOIN inventory i ON i."productId" = p.id LEFT JOIN activity a ON a."productId" = p.id
    ), filtered AS (SELECT * FROM base WHERE ${and(conditions)}), totals AS (
      SELECT count(*)::integer AS n, count(*) FILTER (WHERE "onHand" > 0 AND "onHand" <= "reorderPoint")::integer AS low,
        count(*) FILTER (WHERE "onHand" = 0)::integer AS out FROM filtered
    ), settings AS (SELECT *, greatest(1, ceil(n::numeric / ${q.pageSize})::integer) AS pages,
      least(${q.page}::bigint, greatest(1, ceil(n::numeric / ${q.pageSize})::integer))::integer AS page FROM totals),
    selected AS (SELECT * FROM filtered ORDER BY ${productOrders[q.order] ?? productOrders['name-asc']!}, sku ASC, id ASC
      LIMIT ${q.pageSize} OFFSET (SELECT (page::bigint - 1) * ${q.pageSize} FROM settings))
    SELECT jsonb_build_object('page', page, 'pageSize', ${q.pageSize}::integer, 'pageCount', pages, 'totalCount', n,
      'lowCount', low, 'outCount', out, 'catalogCount', (SELECT count(*)::integer FROM products),
      'categoryIds', (SELECT coalesce(jsonb_agg(DISTINCT "categoryId"), '[]') FROM products),
      'brandIds', (SELECT coalesce(jsonb_agg(DISTINCT "brandId") FILTER (WHERE "brandId" IS NOT NULL), '[]') FROM products),
      'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object('product', to_jsonb(s) - 'onHand' - 'inactiveSince', 'onHand', s."onHand")), '[]') FROM selected s)) AS result
    FROM settings`;
}
export function unitsPageSql(q: UnitQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Object.keys(unitRangeErrors(q)).length ? Prisma.sql`FALSE` : Prisma.sql`TRUE`];
  if (q.query) conditions.push(contains(Prisma.sql`"serialNo"`, q.query));
  if (q.location) conditions.push(contains(Prisma.sql`location`, q.location));
  if (q.status !== 'all') conditions.push(Prisma.sql`status::text = ${q.status}`);
  if (q.grade !== 'all') conditions.push(q.grade === 'NEW' ? Prisma.sql`"usedGrade" IS NULL` : Prisma.sql`"usedGrade"::text = ${q.grade}`);
  if (q.acquisitionType !== 'all') conditions.push(Prisma.sql`"acquisitionType" = ${q.acquisitionType}`);
  if (!Object.keys(unitRangeErrors(q)).length) {
    if (q.receivedFrom) conditions.push(Prisma.sql`("receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka')::date >= ${q.receivedFrom}::date`);
    if (q.receivedTo) conditions.push(Prisma.sql`("receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dhaka')::date <= ${q.receivedTo}::date`);
    if (q.minCost) conditions.push(Prisma.sql`"costPrice" >= ${parseBDT(q.minCost)}`);
    if (q.maxCost) conditions.push(Prisma.sql`"costPrice" <= ${parseBDT(q.maxCost)}`);
  }
  return Prisma.sql`WITH base AS (
      SELECT u.*, a.type::text AS "acquisitionType" FROM product_units u
      LEFT JOIN LATERAL (SELECT type FROM used_device_acquisitions WHERE "unitId" = u.id ORDER BY "acquiredAt" DESC, id DESC LIMIT 1) a ON TRUE
      WHERE u."productId" = ${q.productId}
    ), filtered AS (SELECT * FROM base WHERE ${and(conditions)}), ranked AS (
      SELECT *, row_number() OVER (ORDER BY ${unitOrders[q.order] ?? unitOrders['in-stock-first']!}, "serialNo" ASC, id ASC) AS position FROM filtered
    ), totals AS (SELECT count(*)::integer AS n FROM filtered), settings AS (
      SELECT n, greatest(1, ceil(n::numeric / ${q.pageSize})::integer) AS pages,
        coalesce((SELECT ((position - 1) / ${q.pageSize} + 1)::integer FROM ranked WHERE id = ${q.unit}),
          least(${q.page}::bigint, greatest(1, ceil(n::numeric / ${q.pageSize})::integer))::integer) AS page FROM totals
    ), selected AS (SELECT * FROM ranked ORDER BY position LIMIT ${q.pageSize} OFFSET (SELECT (page::bigint - 1) * ${q.pageSize} FROM settings)),
    details AS (SELECT jsonb_build_object('unitId', s.id, 'acquisitionType', a.type, 'sellerName', a."sellerName", 'sellerPhone', a."sellerPhone",
      'identificationType', a."identificationType", 'identificationNumber', a."identificationNumber", 'acquisitionValue', a."acquisitionValue",
      'reference', a.reference, 'note', a.note, 'acquiredAt', a."acquiredAt", 'refurbishmentTotal',
      (SELECT coalesce(sum(amount), 0) FROM refurbishment_expenses WHERE "unitId" = s.id)) AS detail
      FROM selected s LEFT JOIN LATERAL (SELECT * FROM used_device_acquisitions WHERE "unitId" = s.id ORDER BY "acquiredAt" DESC, id DESC LIMIT 1) a ON TRUE
      WHERE s."usedGrade" IS NOT NULL)
    SELECT jsonb_build_object('page', page, 'pageSize', ${q.pageSize}::integer, 'pageCount', pages, 'totalCount', n,
      'unitCount', (SELECT count(*)::integer FROM base), 'inStock', (SELECT count(*)::integer FROM base WHERE status = 'IN_STOCK'),
      'stockValue', (SELECT coalesce(sum("costPrice"), 0) FROM base WHERE status = 'IN_STOCK'),
      'targetStatus', CASE WHEN ${q.unit} = '' THEN NULL WHEN EXISTS(SELECT 1 FROM filtered WHERE id = ${q.unit}) THEN 'found'
        WHEN EXISTS(SELECT 1 FROM base WHERE id = ${q.unit}) THEN 'filtered' ELSE 'missing' END,
      'usedDetails', (SELECT coalesce(jsonb_agg(detail), '[]') FROM details),
      'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'position' - 'acquisitionType' ORDER BY position), '[]') FROM selected s)) AS result FROM settings`;
}
function dates<T extends object>(row: T): T {
  const result = { ...row } as Record<string, unknown>;
  for (const [key, value] of Object.entries(result)) {
    if ((key.endsWith('At') || key === 'warrantyExpiresAt') && typeof value === 'string') result[key] = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toISOString();
  }
  return result as T;
}
export async function findProductsPage(client: Client, query: ProductQuery): Promise<ProductPageResult> {
  const [row] = await client.$queryRaw<Array<{ result: ProductPageResult }>>(productsPageSql(query));
  if (!row) throw new Error('Could not load products.');
  return { ...row.result, rows: row.result.rows.map(r => ({ ...r, product: dates<Product>(r.product) })) };
}
export async function findUnitsPage(client: Client, query: UnitQuery): Promise<UnitPageResult> {
  const [row] = await client.$queryRaw<Array<{ result: UnitPageResult }>>(unitsPageSql(query));
  if (!row) throw new Error('Could not load units.');
  return { ...row.result, rows: row.result.rows.map(r => dates<ProductUnit>(r)), usedDetails: row.result.usedDetails.map(dates) };
}
