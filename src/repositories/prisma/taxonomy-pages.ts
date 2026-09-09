import { Prisma } from '@prisma/client';
import type { TaxonomyQuery, TaxonomyPageResult } from '@/lib/catalog-taxonomy';

/** One statement gives rows and counts from the same PostgreSQL snapshot. */
export function taxonomyPageSql(kind: 'category' | 'brand', query: TaxonomyQuery) {
  const category = kind === 'category';
  const table = category ? Prisma.sql`categories` : Prisma.sql`brands`;
  const foreignKey = category ? Prisma.sql`"categoryId"` : Prisma.sql`"brandId"`;
  const sort = {
    newest: Prisma.sql`"createdAt" DESC, lower(name) COLLATE "C" ASC, id ASC`, oldest: Prisma.sql`"createdAt" ASC, lower(name) COLLATE "C" ASC, id ASC`,
    'name-asc': Prisma.sql`lower(name) COLLATE "C" ASC, id ASC`, 'name-desc': Prisma.sql`lower(name) COLLATE "C" DESC, id ASC`,
    'products-desc': Prisma.sql`"productCount" DESC, lower(name) COLLATE "C" ASC, id ASC`, 'products-asc': Prisma.sql`"productCount" ASC, lower(name) COLLATE "C" ASC, id ASC`,
  }[query.order];
  return Prisma.sql`
    WITH usage AS (
      SELECT ${foreignKey} AS id, count(*)::integer AS total, count(*) FILTER (WHERE "isActive")::integer AS active FROM products GROUP BY ${foreignKey}
    ), base AS (
      SELECT t.id, t.name, t.slug, t."isActive", t."createdAt", coalesce(u.total, 0) AS "productCount", coalesce(u.active, 0) AS "activeProductCount",
        ${category ? Prisma.sql`t."parentId", parent.name AS "parentName", coalesce(children.total, 0)::integer AS "activeChildCount"` : Prisma.sql`NULL::text AS "parentId", NULL::text AS "parentName", 0 AS "activeChildCount"`}
      FROM ${table} t LEFT JOIN usage u ON u.id = t.id
      ${category ? Prisma.sql`LEFT JOIN categories parent ON parent.id = t."parentId" LEFT JOIN (SELECT "parentId", count(*) AS total FROM categories WHERE "isActive" GROUP BY "parentId") children ON children."parentId" = t.id` : Prisma.empty}
    ), filtered AS (
      SELECT * FROM base WHERE
        (${query.query} = '' OR strpos(lower(name || ' ' || slug), lower(${query.query})) > 0)
        AND (${query.status} = 'all' OR "isActive" = ${query.status === 'active'})
        AND (${query.usage} = 'all' OR (${query.usage} = 'used' AND "productCount" > 0) OR (${query.usage} = 'unused' AND "productCount" = 0))
        AND (${query.parent} = '' OR "parentId" = ${query.parent})
    ), counts AS (
      SELECT count(*)::integer AS total, greatest(1, ceil(count(*)::numeric / ${query.pageSize})::integer) AS pages FROM filtered
    ), settings AS (
      SELECT *, least(${query.page}, pages)::integer AS page FROM counts
    ), selected AS (
      SELECT * FROM filtered ORDER BY ${sort} LIMIT ${query.pageSize} OFFSET (SELECT (page - 1)::bigint * ${query.pageSize} FROM settings)
    )
    SELECT jsonb_build_object('rows', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY ${sort}) FROM selected s), '[]'::jsonb),
      'totalCount', total, 'pageCount', pages, 'page', page, 'pageSize', ${query.pageSize}::integer, 'catalogCount', (SELECT count(*)::integer FROM base)) AS result FROM settings`;
}
export async function findTaxonomyPage(client: Pick<Prisma.TransactionClient, '$queryRaw'>, kind: 'category' | 'brand', query: TaxonomyQuery): Promise<TaxonomyPageResult> {
  const [row] = await client.$queryRaw<Array<{ result: TaxonomyPageResult }>>(taxonomyPageSql(kind, query));
  if (!row) throw new Error('Missing taxonomy page result');
  return { ...row.result, rows: row.result.rows.map(item => ({ ...item, createdAt: new Date(item.createdAt.endsWith('Z') ? item.createdAt : `${item.createdAt}Z`).toISOString() })) };
}
