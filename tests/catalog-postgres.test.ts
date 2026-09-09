import { PrismaClient } from '@prisma/client';
import { userInfo } from 'node:os';
import { taxonomyPageSql } from '@/repositories/prisma/taxonomy-pages';
import { taxonomyQuery, taxonomyPageFromRows } from '@/lib/catalog-taxonomy';
import { withCatalogLock, guardTaxonomyWrite, guardProductTaxonomy } from '@/repositories/prisma/taxonomy-guards';
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Prisma } from '@prisma/client';
import { productsPageSql, unitsPageSql } from '@/repositories/prisma/catalog-pages';
import { productQuery, unitQuery, productPageFromRows, unitPageFromRows } from '@/lib/catalog-query';
import { products, units, movements, acquisitions, expenses, now, categoryId, brandId } from './catalog-fixtures';

const socket = process.env.CATALOG_TEST_SOCKET;
const categoryRows = [{ id: categoryId, name: 'Phones', slug: 'phones', parentId: null, isActive: true, createdAt: now.toISOString(), updatedAt: now.toISOString() }, ...Array.from({ length: 61 }, (_, i) => ({ id: `tc-${i}`, name: ['alpha', 'Beta', 'চার্জার'][i] ?? `Category ${String(i).padStart(2, '0')}`, slug: `tc-${i}`, parentId: i < 5 ? categoryId : null, isActive: i % 3 !== 0, createdAt: now.toISOString(), updatedAt: now.toISOString() }))];
const brandRows = [{ id: brandId, name: 'Brand', slug: 'brand', isActive: true, createdAt: now.toISOString(), updatedAt: now.toISOString() }, ...Array.from({ length: 61 }, (_, i) => ({ id: `tb-${i}`, name: ['alpha', 'Beta', 'চার্জার'][i] ?? `Brand ${String(i).padStart(2, '0')}`, slug: `tb-${i}`, isActive: i % 3 !== 0, createdAt: now.toISOString(), updatedAt: now.toISOString() }))];

function sql(statement: string) {
  if (!socket?.startsWith('/tmp/ims-catalog-')) throw new Error('Catalog integration tests require a disposable /tmp/ims-catalog-* PostgreSQL socket.');
  return execFileSync('psql', ['-X', '-h', socket, '-p', '55439', '-d', 'postgres', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', maxBuffer: 5_000_000 }).trim();
}
const literal = (value: unknown): string => value === null || value === undefined ? 'NULL' : typeof value === 'number' || typeof value === 'boolean' ? String(value) : `'${String(value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
function insert(table: string, rows: object[]) {
  return rows.map(row => { const entries = Object.entries(row); return `INSERT INTO ${table} (${entries.map(([key]) => `"${key}"`).join(',')}) VALUES (${entries.map(([,value]) => literal(value)).join(',')});`; }).join('\n');
}
function query<T>(statement: Prisma.Sql): T {
  // PREPARE exercises real PostgreSQL parameter type inference as Prisma does.
  const prepared = `PREPARE catalog_query AS ${statement.text}; EXECUTE catalog_query(${statement.values.map(literal).join(',')});`;
  const result = sql(prepared).split('\n').find(line => line.startsWith('{'));
  if (!result) throw new Error('Missing query result');
  return JSON.parse(result);
}

describe.skipIf(!socket)('catalog PostgreSQL source pagination (disposable database only)', () => {
  beforeAll(() => {
    const schema = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
      encoding: 'utf8', maxBuffer: 5_000_000, env: { ...process.env, DATABASE_URL: 'postgresql://unused:unused@localhost/unused' },
    });
    sql(`SET client_min_messages TO warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public; ${schema}`);
    sql(insert('categories', categoryRows)
      + insert('brands', brandRows)
      + insert('users', [{ id: 'actor', name: 'Test', email: 'catalog-test@example.invalid', emailVerified: false, updatedAt: now }])
      + insert('products', products) + insert('product_units', units) + insert('stock_movements', movements)
      + insert('used_device_acquisitions', acquisitions) + insert('refurbishment_expenses', expenses));
  }, 30000);
  it.each(['name-asc', 'name-desc', 'newest', 'oldest', 'stock-asc', 'stock-desc', 'cost-asc', 'cost-desc', 'price-asc', 'price-desc'])('matches JSON product ordering for %s across pages', order => {
    const q = productQuery({ order, page: '2', status: 'all' }, true, now);
    const expected = productPageFromRows(products, units, movements, q);
    const actual = query<typeof expected>(productsPageSql(q));
    expect(actual.rows.map(r => r.product.id)).toEqual(expected.rows.map(r => r.product.id));
    expect(actual).toMatchObject({ page: expected.page, totalCount: expected.totalCount, lowCount: expected.lowCount, outCount: expected.outCount });
  });
  it.each([{ stock: 'dead' }, { stock: 'low' }, { stock: 'out' }, { tracking: 'SERIAL' }, { q: "Phone%_' OR true --" }, { q: 'Phone 2', status: 'all' }, { status: 'archived', page: '999' }])('filters before slicing and handles empty/clamped product results: %j', raw => {
    const q = productQuery(raw, true, now); const expected = productPageFromRows(products, units, movements, q);
    const actual = query<typeof expected>(productsPageSql(q));
    expect(actual.rows.map(r => r.product.id)).toEqual(expected.rows.map(r => r.product.id));
    expect(actual).toMatchObject({ page: expected.page, pageCount: expected.pageCount, totalCount: expected.totalCount });
  });
  it.each(['in-stock-first', 'newest', 'oldest', 'profit-desc', 'profit-asc', 'cost-desc', 'cost-asc', 'serial-asc'])('matches JSON unit ordering and whole-product aggregates for %s', order => {
    const q = unitQuery({ order, page: '2' }, 'p-1', true); const expected = unitPageFromRows(units, acquisitions, expenses, q);
    const actual = query<typeof expected>(unitsPageSql(q));
    expect(actual.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id));
    expect(actual).toMatchObject({ page: expected.page, totalCount: expected.totalCount, unitCount: 61, inStock: 40, stockValue: expected.stockValue });
    expect(actual.usedDetails.map(d => d.unitId).sort()).toEqual(expected.usedDetails.map(d => d.unitId).sort());
  });
  it.each([{ receivedFrom: '2026-09-02', receivedTo: '2026-09-02' }, { receivedFrom: 'invalid' }, { minCost: '120', maxCost: '145', order: 'profit-asc' }, { grade: 'GRADE_A', acquisitionType: 'TRADE_IN' }, { unit: 'u-60', order: 'serial-asc' }, { unit: 'u-60', status: 'IN_STOCK' }, { unit: 'foreign' }, { query: 'not found' }, { location: 'shelf', page: '999' }])('matches JSON unit filters and target resolution: %j', raw => {
    const q = unitQuery(raw, 'p-1', true); const expected = unitPageFromRows(units, acquisitions, expenses, q);
    const actual = query<typeof expected>(unitsPageSql(q));
    expect(actual.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id));
    expect(actual).toMatchObject({ page: expected.page, pageCount: expected.pageCount, totalCount: expected.totalCount, targetStatus: expected.targetStatus });
  });
  for (const kind of ['category', 'brand'] as const) {
    it.each(['newest', 'oldest', 'name-asc', 'name-desc', 'products-asc', 'products-desc'])(`${kind} source pagination matches JSON for %s`, order => {
      const q = taxonomyQuery({ status: 'all', page: '2', order });
      const expected = taxonomyPageFromRows(kind === 'category' ? categoryRows : brandRows, products, q, kind);
      const actual = query<typeof expected>(taxonomyPageSql(kind, q));
      expect(actual.rows.map(row => row.id)).toEqual(expected.rows.map(row => row.id));
      expect(actual).toMatchObject({ totalCount: expected.totalCount, page: expected.page, pageCount: expected.pageCount, catalogCount: expected.catalogCount });
      expect(actual.rows.length).toBeLessThanOrEqual(q.pageSize);
    });
    it.each([{ usage: 'used' }, { usage: 'unused', status: 'removed' }, { parent: categoryId }, { query: "%' OR true --" }, { query: '02', page: '999' }])(`${kind} filters before pagination: %j`, raw => {
      const q = taxonomyQuery(raw); const expected = taxonomyPageFromRows(kind === 'category' ? categoryRows : brandRows, products, q, kind);
      const actual = query<typeof expected>(taxonomyPageSql(kind, q));
      expect(actual.rows.map(row => row.id)).toEqual(expected.rows.map(row => row.id));
      expect(actual).toMatchObject({ totalCount: expected.totalCount, page: expected.page });
      for (const row of actual.rows) expect(row).toMatchObject({ activeProductCount: expected.rows.find(item => item.id === row.id)!.activeProductCount, activeChildCount: expected.rows.find(item => item.id === row.id)!.activeChildCount });
    });
  }
  it.each([true, false])('serializes PostgreSQL removal and assignment (assignment first=%s)', async assignmentFirst => {
    const client = new PrismaClient({ datasources: { db: { url: `postgresql://${encodeURIComponent(userInfo().username)}@localhost:55439/postgres?host=${encodeURIComponent(socket!)}` } } });
    try {
      const id = `lock-${assignmentFirst}`;
      await client.category.create({ data: { id, name: id, slug: id } });
      const data = { ...products[0]!, id: `lock-product-${assignmentFirst}`, sku: `lock-sku-${assignmentFirst}`, barcode: null, categoryId: id, isActive: true };
      let acquired!: () => void; let release!: () => void;
      const ready = new Promise<void>(resolve => { acquired = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
      const assign = async (tx: Parameters<Parameters<typeof withCatalogLock>[1]>[0]) => { await guardProductTaxonomy(tx, data); return tx.product.create({ data }); };
      const remove = async (tx: Parameters<Parameters<typeof withCatalogLock>[1]>[0]) => { await guardTaxonomyWrite(tx, 'category', { isActive: false }, id); return tx.category.update({ where: { id }, data: { isActive: false } }); };
      const first = withCatalogLock(client, async tx => { acquired(); await gate; return assignmentFirst ? assign(tx) : remove(tx); });
      await ready;
      const second = withCatalogLock(client, tx => assignmentFirst ? remove(tx) : assign(tx));
      release();
      const results = await Promise.allSettled([first, second]);
      expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    } finally { await client.$disconnect(); }
  }, 20000);

});
