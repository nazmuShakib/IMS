import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { createRepositories } from '@/repositories/prisma';
import { correctMovement, reconcile } from '@/services/stock';
import { movementPageFromRows, parseMovementQuery, type MovementData } from '@/lib/movement-query';
import { ledgerMovement } from './movement-fixtures';

const url = process.env.TEST_MOVEMENT_DATABASE_URL;
describe.skipIf(!url)('movement ledger on disposable local PostgreSQL', () => {
  const connection = new URL(url ?? 'postgresql://unused');
  const schema = `movement_fixture_${randomUUID().replaceAll('-', '')}`;
  connection.searchParams.set('schema', schema);
  const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  const repositories = createRepositories(client, (fn, options) => client.$transaction(tx => fn(createRepositories(tx)), { ...options, timeout: 15000 }));
  let fixtures: MovementData;
  let created = false;
  beforeAll(async () => {
    const safe = new URL(url!);
    if (safe.hostname !== '127.0.0.1' || safe.port !== '55447' || safe.pathname !== '/ledger_test') throw Error('Use only the disposable local ledger_test database on port 55447.');
    const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', maxBuffer: 5_000_000 });
    execFileSync('psql', ['-X', url!, '-v', 'ON_ERROR_STOP=1'], { input: `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; ${sql}`, encoding: 'utf8' });
    created = true;
    await client.category.create({ data: { id: 'category', name: 'Phones', slug: 'phones' } });
    await client.user.create({ data: { id: 'u', name: 'Auth actor', email: 'ledger@example.invalid' } });
    await client.product.createMany({ data: [
      { id: 'p', categoryId: 'category', name: 'Phone 50%_model', sku: 'PHONE', trackingType: 'QUANTITY', quantityOnHand: 205, avgCostPrice: 12345 },
      { id: 'serial', categoryId: 'category', name: 'Serial phone', sku: 'SERIAL', trackingType: 'SERIAL' },
    ] });
    await client.productUnit.createMany({ data: [
      { id: 's1', productId: 'serial', serialNo: 'SERIAL_100%', status: 'IN_STOCK', costPrice: 12345 },
      { id: 's2', productId: 'serial', serialNo: 'SERIALX100zzz', status: 'IN_STOCK', costPrice: 12345 },
    ] });
    const rows = Array.from({ length: 205 }, (_, i) => ledgerMovement(i));
    rows.push(ledgerMovement(206, { productId: 'serial', unitId: 's1', createdAt: '2026-09-01T18:00:00.000Z' }), ledgerMovement(207, { productId: 'serial', unitId: 's2', createdAt: '2026-09-02T17:59:59.999Z' }));
    await client.stockMovement.createMany({ data: rows.map(row => ({ ...row, occurredAt: row.createdAt })) });
    fixtures = { movements: rows, products: await client.product.findMany(), units: await client.productUnit.findMany(), users: await client.user.findMany(), sales: [], acquisitions: [], returns: [] };
  }, 30000);
  afterAll(async () => {
    try { if (created) await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.$disconnect(); }
  });
  it.each([
    {}, { page: '9' }, { page: '999', pageSize: '100' }, { order: 'oldest', page: '2' }, { reason: 'PURCHASE', actor: 'u', product: 'p' },
    { q: '50%_model' }, { q: 'serial_100%' }, { q: 'SERIAL' }, { q: 'missing' }, { from: '2026-09-02', to: '2026-09-02' }, { type: 'OUT' },
  ])('matches JSON filtering, ordering, counts and relationships: %j', async raw => {
    const query = parseMovementQuery(raw), expected = movementPageFromRows(fixtures, query), actual = await repositories.movements.findPage(query);
    expect(actual).toEqual(expected);
  });
  async function bulkFixture() {
    const productId = randomUUID(), firstId = randomUUID(), secondId = randomUUID();
    await client.product.create({ data: { id: productId, name: 'Correction test', sku: productId, categoryId: 'category', trackingType: 'QUANTITY', quantityOnHand: 20, avgCostPrice: 15000 } });
    await client.stockMovement.createMany({ data: [
      { id: firstId, productId, type: 'IN', reason: 'PURCHASE', quantity: 10, unitCost: 10000, actorId: 'u', createdAt: new Date('2026-09-01'), occurredAt: new Date('2026-09-01') },
      { id: secondId, productId, type: 'IN', reason: 'PURCHASE', quantity: 10, unitCost: 20000, actorId: 'u', createdAt: new Date('2026-09-02'), occurredAt: new Date('2026-09-02') },
    ] });
    return { productId, input: { movementId: secondId, actorId: 'u', note: 'Wrong receipt', idempotencyKey: randomUUID() } };
  }
  it('commits one correction and audit for simultaneous identical requests and reconciles', async () => {
    const { input, productId } = await bulkFixture();
    const [first, second] = await Promise.all([correctMovement(input, repositories), correctMovement(input, repositories)]);
    expect(first.id).toBe(second.id);
    expect(await client.product.findUnique({ where: { id: productId } })).toMatchObject({ quantityOnHand: 10, avgCostPrice: 10000 });
    expect(await client.stockMovement.count({ where: { reversesId: input.movementId } })).toBe(1);
    expect(await client.auditLog.count({ where: { entityId: first.id } })).toBe(1);
    expect(await reconcile(repositories)).toEqual([]);
  });
  it('rejects concurrent different-key reversals without a second stock change', async () => {
    const { input, productId } = await bulkFixture();
    const results = await Promise.allSettled([correctMovement(input, repositories), correctMovement({ ...input, idempotencyKey: randomUUID() }, repositories)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await client.product.findUnique({ where: { id: productId } })).toMatchObject({ quantityOnHand: 10, avgCostPrice: 10000 });
  });
  it('reverses an earlier purchase while retaining the later receipt and its cost basis', async () => {
    const { input, productId } = await bulkFixture();
    const first = await client.stockMovement.findFirstOrThrow({ where: { productId }, orderBy: { createdAt: 'asc' } });
    await correctMovement({ ...input, movementId: first.id }, repositories);
    expect(await client.product.findUnique({ where: { id: productId } })).toMatchObject({ quantityOnHand: 10, avgCostPrice: 20000 });
    expect(await client.stockMovement.count({ where: { reversesId: input.movementId } })).toBe(0);
    expect(await reconcile(repositories)).toEqual([]);
  });
  it('rolls back the actual stock and movement transaction when audit insertion fails', async () => {
    const { input, productId } = await bulkFixture();
    const broken = { ...repositories, transaction: ((fn, options) => repositories.transaction(tx => fn({ ...tx, auditLogs: { ...tx.auditLogs, create: async () => { throw Error('Injected audit failure'); } } }), options)) as typeof repositories.transaction };
    await expect(correctMovement(input, broken)).rejects.toThrow('Injected audit failure');
    expect(await client.product.findUnique({ where: { id: productId } })).toMatchObject({ quantityOnHand: 20, avgCostPrice: 15000 });
    expect(await client.stockMovement.count({ where: { reversesId: input.movementId } })).toBe(0);
    expect(await reconcile(repositories)).toEqual([]);
  });
  it('keeps an out-of-filter correction linked to its original entry', async () => {
    const { input, productId } = await bulkFixture(); const correction = await correctMovement(input, repositories);
    const page = await repositories.movements.findPage(parseMovementQuery({ product: productId, to: '2026-09-02' }));
    expect(page.rows.find(row => row.id === input.movementId)?.correction?.id).toBe(correction.id);
    expect(page.rows.some(row => row.id === correction.id)).toBe(false);
  });
});
