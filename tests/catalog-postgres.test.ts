import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Prisma } from '@prisma/client';
import { productsPageSql, unitsPageSql } from '@/repositories/prisma/catalog-pages';
import { productQuery, unitQuery, productPageFromRows, unitPageFromRows } from '@/lib/catalog-query';
import { products, units, movements, acquisitions, expenses, now, categoryId, brandId } from './catalog-fixtures';

const socket = process.env.CATALOG_TEST_SOCKET;
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
    sql(insert('categories', [{ id: categoryId, name: 'Phones', slug: 'phones', isActive: true, createdAt: now, updatedAt: now }])
      + insert('brands', [{ id: brandId, name: 'Brand', slug: 'brand', isActive: true, createdAt: now, updatedAt: now }])
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
});
