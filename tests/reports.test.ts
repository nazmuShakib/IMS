import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import Papa from 'papaparse';
import { PrismaClient } from '@prisma/client';
import { parseReportFilters, reportParams, reportRaw, REPORT_KINDS } from '@/lib/report-query';
import { calculateReport } from '@/lib/report-calculations';
import { finishReport } from '@/lib/report-results';
import { summaryValue, presentCell } from '@/lib/report-presentation';
import { reportToCsv } from '@/lib/report-export';
import { reportFixture, reportNow, reportStore } from './report-fixtures';
import { prismaReports, reportSql } from '@/repositories/prisma/reports';
const fixture = vi.hoisted(() => ({
  store: {} as Record<string, unknown[]>,
  reads: [] as string[],
}));
vi.mock('@/repositories/json/store', () => ({
  readAll: async (key: string) => {
    fixture.reads.push(key);
    return fixture.store[key] ?? [];
  },
}));
import { jsonReports } from '@/repositories/json/reports';
const ctx = reportFixture();
fixture.store = reportStore(ctx);
describe('Report query and calculations', () => {
  it.each(['2025-02-29', '2026-02-30', '2026-04-31', '0000-01-01', '2026-13-01', 'today'])(
    'rejects impossible date %s',
    (from) => expect(() => parseReportFilters({ report: 'sales', from })).toThrow(),
  );
  it('handles leap dates, open ranges, no dates, whitespace and first repeated values', () => {
    expect(parseReportFilters({ report: 'sales', from: ' 2024-02-29 ', to: ' ' })).toMatchObject({
      from: '2024-02-29',
      to: undefined,
      page: 1,
      pageSize: 25,
    });
    const raw = reportRaw(
      new URLSearchParams('report=sales&from=2024-02-29&from=invalid&page=99&pageSize=100'),
    );
    expect(parseReportFilters(raw)).toEqual(
      parseReportFilters({ ...raw, from: ['2024-02-29', 'invalid'] }),
    );
    expect(parseReportFilters({ report: 'sales' }).from).toBeUndefined();
    expect(() =>
      parseReportFilters({ report: 'sales', from: '2026-09-02', to: '2026-09-01' }),
    ).toThrow();
  });
  it('strips unsupported filters and excludes pages from export URLs', () => {
    const q = parseReportFilters({
      report: 'aging',
      from: 'invalid',
      supplierId: 'x',
      type: 'OUT',
      order: 'profit-desc',
      groupBy: 'month',
      pageSize: '100',
    });
    expect(q).toMatchObject({
      from: undefined,
      supplierId: undefined,
      type: undefined,
      sort: undefined,
      groupBy: undefined,
    });
    expect(reportParams(q, false).toString()).toBe('report=aging');
  });
  it('reconciles mixed receipt costs and partially consumed stock with serialized costs', () => {
    const aging = finishReport(calculateReport(ctx, { report: 'aging' }, reportNow), {
      report: 'aging',
    });
    const valuation = calculateReport(ctx, { report: 'valuation' }, reportNow);
    expect(aging.totals.value).toBe(valuation.totals.value);
    expect(aging.totals.value).toBe(120 * 15000 + 90000);
    expect(aging.totals.agedValue).toBe(90000);
    expect(aging.rows.map((r) => r.id)).toEqual(['0–30', '31–60', '61–90', '91+']);
  });
  it.each([30, 31, 60, 61, 90, 91])('uses non-overlapping age boundary %s', (days) => {
    const test = {
      ...ctx,
      products: [ctx.products[120]!],
      units: [
        {
          ...ctx.units[0]!,
          receivedAt: new Date(reportNow.getTime() - days * 86400000).toISOString(),
        },
      ],
    };
    const r = calculateReport(test, { report: 'aging' }, reportNow);
    expect(r.rows.find((r) => Number(r.cells.quantity) > 0)?.id).toBe(
      days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '91+',
    );
  });
  it('preserves correction economics when the original is outside the period', () => {
    const r = calculateReport(
      ctx,
      { report: 'sales', from: '2026-09-04', to: '2026-09-04' },
      reportNow,
    );
    expect(r.totals).toMatchObject({ quantity: -2, revenue: -20000, cogs: -30000, profit: 10000 });
  });
  it('uses actual dates for sales and recorded dates for movement audit', () => {
    expect(
      calculateReport(ctx, { report: 'sales', to: '2026-08-31' }, reportNow).totals.revenue,
    ).toBeGreaterThan(0);
    expect(
      calculateReport(ctx, { report: 'movements', from: '2026-08-01', to: '2026-08-31' }, reportNow)
        .rows,
    ).toHaveLength(0);
  });
  it('sorts time rows chronologically and fills missing periods across Dhaka month boundaries', () => {
    const q = parseReportFilters({ report: 'sales', from: '2026-07-31', to: '2026-09-05' });
    const r = finishReport(calculateReport(ctx, q, reportNow), q);
    expect(r.chartRows?.[0]?.id).toBe('2026-07-31');
    expect(r.chartRows?.at(-1)?.id).toBe('2026-09-05');
    expect(r.chartRows?.find((r) => r.id === '2026-08-31')?.cells.revenue).toBe(0);
    expect(r.rows.map((r) => r.id)).toEqual(r.rows.map((r) => r.id).sort());
  });
  it('zero-fills corrected boundary periods without changing table rows', () => {
    const sale = {
      ...ctx.movements.find((m) => m.reason === 'SALE')!,
      id: 'edge-sale',
      createdAt: '2026-07-01T06:00:00.000Z',
      occurredAt: '2026-07-01T06:00:00.000Z',
    };
    const correction = {
      ...sale,
      id: 'edge-correction',
      reason: 'CORRECTION' as const,
      quantity: -sale.quantity,
      reversesId: sale.id,
    };
    const sample = { ...ctx, movements: [sale, correction, ...ctx.movements] };
    const q = parseReportFilters({ report: 'sales' });
    const result = finishReport(calculateReport(sample, q, reportNow), q);
    expect(result.chartRows?.[0]).toMatchObject({
      id: '2026-07-01',
      cells: { revenue: 0, cogs: 0 },
    });
    expect(result.rows.some((r) => r.id === '2026-07-01')).toBe(false);
  });
  it('retains full totals, counts and top-ten charts across bounded pages', async () => {
    const first = await jsonReports.findPage(
        { report: 'profit', page: 1, pageSize: 25 },
        reportNow,
      ),
      last = await jsonReports.findPage({ report: 'profit', page: 999, pageSize: 25 }, reportNow);
    expect(first.totalCount).toBe(119);
    expect(first.rows).toHaveLength(25);
    expect(last.page).toBe(5);
    expect(last.rows).toHaveLength(19);
    expect(last.totals).toEqual(first.totals);
    expect(last.chartRows).toEqual(first.chartRows);
    expect(first.chartRows).toHaveLength(10);
    expect(first.chartTotalCount).toBe(119);
    expect((await jsonReports.export({ report: 'profit', page: 5 }, reportNow)).rows).toHaveLength(
      119,
    );
  });
  it('uses a weighted overall margin and a dash at zero revenue', () => {
    const r = calculateReport(ctx, { report: 'profit' }, reportNow);
    expect(summaryValue(r, 'margin')).toBe((r.totals.profit! / r.totals.revenue!) * 100);
    expect(summaryValue({ ...r, totals: { ...r.totals, revenue: 0 } }, 'margin')).toBeNull();
  });
  it('does not load serials for sales or ledger for valuation', async () => {
    fixture.reads = [];
    await jsonReports.findPage({ report: 'sales' }, reportNow);
    expect(fixture.reads).not.toContain('product-units');
    expect(fixture.reads).not.toContain('users');
    fixture.reads = [];
    await jsonReports.findPage({ report: 'valuation' }, reportNow);
    expect(fixture.reads).not.toContain('stock-movements');
    expect(reportSql({ report: 'valuation' }, reportNow).text).not.toContain('stock_movements');
    expect(reportSql({ report: 'sales' }, reportNow).text).not.toContain('product_units');
  });
  it('protects text formulas while retaining negative numeric money and Bengali names', () => {
    const result = calculateReport(ctx, { report: 'profit' }, reportNow);
    result.rows = [
      {
        id: 'x',
        cells: {
          product: '=1+1',
          sku: '@SUM(A1)',
          quantity: -2,
          revenue: -10000,
          cogs: 20000,
          profit: -30000,
          margin: -300,
        },
      },
      {
        id: 'y',
        cells: {
          product: 'বাংলা',
          sku: 'USB',
          quantity: 1,
          revenue: 100,
          cogs: 0,
          profit: 100,
          margin: 100,
        },
      },
    ];
    const rows = Papa.parse<string[]>(reportToCsv(result)).data;
    expect(rows[1]).toEqual(["'=1+1", "'@SUM(A1)", '-2', '-100', '200', '-300', '-300']);
    expect(rows[2]?.[0]).toBe('বাংলা');
    expect(presentCell('Unknown', { key: 'product', label: 'Product', type: 'text' }, 'bn')).toBe(
      'Unknown',
    );
  });
});

const url = process.env.TEST_REPORT_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL / JSON report parity (isolated fixture database)', () => {
  const schema = `report_fixture_${randomUUID().replaceAll('-', '')}`;
  const connection = new URL(url ?? 'postgresql://unused');
  connection.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused' } } });
  const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await client.$executeRawUnsafe(
      'CREATE TABLE products (id text PRIMARY KEY,name text,sku text,"trackingType" text,"categoryId" text,"brandId" text,"quantityOnHand" integer,"avgCostPrice" integer,"createdAt" timestamp,"updatedAt" timestamp,"isActive" boolean)',
    );
    for (const table of ['categories', 'brands', 'suppliers', 'users'])
      await client.$executeRawUnsafe(`CREATE TABLE ${table} (id text PRIMARY KEY,name text)`);
    await client.$executeRawUnsafe(
      'CREATE TABLE product_units (id text PRIMARY KEY,"productId" text,status text,"costPrice" integer,"receivedAt" timestamp)',
    );
    await client.$executeRawUnsafe(
      'CREATE TABLE stock_movements (id text PRIMARY KEY,"productId" text,type text,reason text,quantity integer,"unitCost" integer,"unitPrice" integer,"createdAt" timestamp,"occurredAt" timestamp,"supplierId" text,"actorId" text,"reversesId" text,reference text)',
    );
    for (const [key, rows] of Object.entries(reportStore(ctx)))
      for (const row of rows as Record<string, unknown>[]) {
        const table = key.replaceAll('-', '_');
        const keys = Object.keys(row);
        await client.$executeRawUnsafe(
          `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map((k, i) => (k.endsWith('At') ? `($${i + 1}::timestamptz AT TIME ZONE 'UTC')` : `$${i + 1}`)).join(',')})`,
          ...keys.map((k) => (k.endsWith('At') ? new Date(String(row[k])) : row[k])),
        );
      }
  }, 30000);
  afterAll(async () => {
    await client.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  });
  it.each(REPORT_KINDS)('matches rows, totals, charts and pagination for %s', async (report) => {
    for (const groupBy of report === 'sales'
      ? (['day', 'month', 'brand', 'category'] as const)
      : [undefined]) {
      const q = parseReportFilters({ report, groupBy, page: '2', pageSize: '25' });
      const expected = await jsonReports.findPage(q, reportNow),
        actual = await prismaReports(client).findPage(q, reportNow);
      expect(actual).toEqual(expected);
    }
  });
  it('matches filtered corrections and exports', async () => {
    for (const report of ['sales', 'profit', 'purchases', 'movements'] as const) {
      const q = parseReportFilters({ report, from: '2026-09-04', to: '2026-09-04' });
      expect(await prismaReports(client).export(q, reportNow)).toEqual(
        await jsonReports.export(q, reportNow),
      );
    }
  });
  it('keeps zero-revenue margins last in both sort directions', async () => {
    for (const order of ['margin-asc', 'margin-desc']) {
      const q = parseReportFilters({ report: 'profit', order });
      const expected = await jsonReports.export(q, reportNow),
        actual = await prismaReports(client).export(q, reportNow);
      expect(actual).toEqual(expected);
      expect(actual.rows.at(-1)?.cells.margin).toBeNull();
    }
  });
  it('prepares all report queries without driver-supplied parameter types', async () => {
    for (const report of REPORT_KINDS) {
      const query = reportSql(
        parseReportFilters({ report, from: '2026-01-01', to: '2026-09-10', productId: 'p001' }),
        reportNow,
      );
      await client.$executeRawUnsafe(`PREPARE report_untyped_${report} AS ${query.text}`);
    }
  });
  it('bounds product lookup and returns only safe fields', async () => {
    const products = await prismaReports(client).products('');
    expect(products).toHaveLength(20);
    expect(Object.keys(products[0]!)).toEqual(['id', 'name', 'sku']);
    expect(await prismaReports(client).actors()).toEqual([{ id: 'u1', name: 'ব্যবস্থাপক' }]);
  });
});
