import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { createRepositories } from '@/repositories/prisma';
import { valuationFromRows } from '@/lib/valuation-consistency';
import { consistencyFromRows } from '@/lib/reconciliation';

const url = process.env.TEST_MOVEMENT_DATABASE_URL;
describe.skipIf(!url)('stock consistency on disposable PostgreSQL', () => {
  const connection = new URL(url ?? 'postgresql://unused'), schema = `consistency_fixture_${randomUUID().replaceAll('-', '')}`;
  connection.searchParams.set('schema', schema);
  const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  const repositories = createRepositories(client);
  let created = false;
  beforeAll(async () => {
    const safe = new URL(url!);
    if (safe.hostname !== '127.0.0.1' || safe.port !== '55447' || safe.pathname !== '/ledger_test') throw Error('Use the disposable local ledger_test database on port 55447.');
    const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', maxBuffer: 5_000_000 });
    execFileSync('psql', ['-X', url!, '-v', 'ON_ERROR_STOP=1'], { input: `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; ${sql}`, encoding: 'utf8' }); created = true;
  }, 30000);
  afterAll(async () => { try { if (created) await client.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); } finally { await client.$disconnect(); } });

  it('returns a timestamp and an empty report before products exist', async () => {
    const report = await repositories.reconciliation.check();
    expect(report).toMatchObject({ productsChecked: 0, productsMatching: 0, productsWithDifferences: 0, rows: [] });
    expect(Number.isFinite(Date.parse(report.checkedAt))).toBe(true);
  });
  it('matches JSON aggregation with corrections, inactive products, serial statuses and signed differences', async () => {
    await client.category.create({ data: { id: 'category', name: 'Accessories', slug: 'accessories' } });
    await client.product.createMany({ data: [
      { id: 'glass', name: 'Glass', sku: 'GLASS', categoryId: 'category', trackingType: 'QUANTITY', quantityOnHand: 9 },
      { id: 'empty', name: 'Archived empty', sku: 'EMPTY', categoryId: 'category', trackingType: 'QUANTITY', isActive: false },
      { id: 'serial', name: 'Phone', sku: 'PHONE', categoryId: 'category', trackingType: 'SERIAL', quantityOnHand: 999 },
      { id: 'plus', name: 'Extra', sku: 'PLUS', categoryId: 'category', trackingType: 'QUANTITY', quantityOnHand: 4 },
      { id: 'minus', name: 'Missing', sku: 'MINUS', categoryId: 'category', trackingType: 'QUANTITY', quantityOnHand: 1, isActive: false },
    ] });
    await client.productUnit.createMany({ data: (['IN_STOCK', 'SOLD', 'VOID', 'DAMAGED'] as const).map((status, index) => ({ id: `u${index}`, productId: 'serial', serialNo: `CONSISTENCY-${index}`, status, costPrice: 12345 })) });
    await client.stockMovement.createMany({ data: [
      { id: 'receipt', productId: 'glass', type: 'IN', reason: 'PURCHASE', quantity: 40, unitCost: 3000 },
      { id: 'later', productId: 'glass', type: 'IN', reason: 'PURCHASE', quantity: 9, unitCost: 3000 },
      { id: 'phone-in', productId: 'serial', type: 'IN', reason: 'PURCHASE', quantity: 4, unitCost: 12345 },
      { id: 'phone-out', productId: 'serial', type: 'OUT', reason: 'SALE', quantity: -3, unitCost: 12345 },
      { id: 'plus-in', productId: 'plus', type: 'IN', reason: 'PURCHASE', quantity: 3, unitCost: 100 },
      { id: 'minus-in', productId: 'minus', type: 'IN', reason: 'PURCHASE', quantity: 3, unitCost: 100 },
    ] });
    await client.stockMovement.create({ data: { id: 'correction', productId: 'glass', type: 'ADJUST', reason: 'CORRECTION', quantity: -40, reversesId: 'receipt', unitCost: 3000 } });
    const report = await repositories.reconciliation.check();
    const expected = consistencyFromRows(await client.product.findMany(), await client.productUnit.findMany(), await client.stockMovement.findMany(), report.checkedAt);
    const { valuation, ...quantityReport } = report;
    expect(quantityReport).toEqual(expected);
    expect(valuation).toEqual(valuationFromRows({ products: await client.product.findMany(), units: await client.productUnit.findMany(), movements: (await client.stockMovement.findMany()).map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), expenses: [], acquisitions: [] })); expect(report).toMatchObject({ productsChecked: 5, productsMatching: 3, productsWithDifferences: 2 });
    expect(report.rows.map(row => row.drift)).toEqual([-2, 1]); expect(JSON.stringify(report)).not.toContain('unitCost');
  });
  it('does not report partial stock changes while a writer is in progress', async () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; });
    const write = client.$transaction(async tx => {
      await tx.product.update({ where: { id: 'glass' }, data: { quantityOnHand: { increment: 1 } } });
      entered(); await proceed;
      await tx.stockMovement.create({ data: { id: 'concurrent', productId: 'glass', type: 'IN', reason: 'PURCHASE', quantity: 1, unitCost: 3000 } });
    }, { timeout: 15000 });
    await ready;
    try { expect((await repositories.reconciliation.check()).rows.some(row => row.productId === 'glass')).toBe(false); }
    finally { release(); await write; }
    expect((await repositories.reconciliation.check()).rows.some(row => row.productId === 'glass')).toBe(false);
  });
  it('performs no writes while checking mismatches', async () => {
    const before = [await client.product.findMany({ orderBy: { id: 'asc' } }), await client.stockMovement.count(), await client.auditLog.count()];
    await repositories.reconciliation.check();
    expect([await client.product.findMany({ orderBy: { id: 'asc' } }), await client.stockMovement.count(), await client.auditLog.count()]).toEqual(before);
  });
  it('detects wrong bulk average costs and serial refurbishment costs despite matching quantities', async () => {
    await client.user.create({ data: { id: 'valuation-actor', name: 'Valuation test', email: 'valuation@example.invalid' } });
    await client.product.createMany({ data: [
      { id: 'value-bulk', name: 'Value bulk', sku: 'VALUE-BULK', categoryId: 'category', trackingType: 'QUANTITY', quantityOnHand: 20, avgCostPrice: 17000 },
      { id: 'value-serial', name: 'Value serial', sku: 'VALUE-SERIAL', categoryId: 'category', trackingType: 'SERIAL' },
    ] });
    await client.productUnit.create({ data: { id: 'value-unit', productId: 'value-serial', serialNo: 'VALUE-SERIAL', status: 'IN_STOCK', costPrice: 10600 } });
    await client.stockMovement.createMany({ data: [
      { id: 'value-first', productId: 'value-bulk', type: 'IN', reason: 'PURCHASE', quantity: 10, unitCost: 10000, createdAt: new Date('2026-09-01') },
      { id: 'value-second', productId: 'value-bulk', type: 'IN', reason: 'PURCHASE', quantity: 10, unitCost: 20000, createdAt: new Date('2026-09-02') },
      { id: 'value-phone', productId: 'value-serial', unitId: 'value-unit', type: 'IN', reason: 'PURCHASE', quantity: 1, unitCost: 10000, createdAt: new Date('2026-09-01') },
    ] });
    await client.refurbishmentExpense.create({ data: { id: 'value-expense', unitId: 'value-unit', amount: 500, description: 'Repair', actorId: 'valuation-actor', createdAt: new Date('2026-09-02') } });
    const report = await repositories.reconciliation.check();
    expect(report.rows.some(row => row.productId.startsWith('value-'))).toBe(false);
    expect(report.valuation?.rows.find(row => row.productId === 'value-bulk')).toMatchObject({ recordedValue: 340000, expectedValue: 300000, difference: 40000 });
    expect(report.valuation?.rows.find(row => row.productId === 'value-serial')).toMatchObject({ recordedValue: 10600, expectedValue: 10500, difference: 100, units: [expect.objectContaining({ serial: 'VALUE-SERIAL', difference: 100 })] });
  });
});
