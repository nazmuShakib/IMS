import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), latest: vi.fn(), invoices: vi.fn(), memory: new Map<string, unknown[]>() }));
vi.mock('@/lib/prisma', () => ({ prisma: { stockMovement: { count: mocks.count, findMany: mocks.findMany }, $queryRaw: mocks.latest, sale: { findMany: mocks.invoices } } }));
vi.mock('@/repositories/json/store', async original => ({ ...await original<typeof import('@/repositories/json/store')>(), readAll: async (key: string) => mocks.memory.get(key) ?? [] }));
import { prismaRepositories } from '@/repositories/prisma';
import { jsonRepositories } from '@/repositories/json';
import { parseMovementQuery } from '@/lib/movement-query';
import { movementWhere } from '@/repositories/prisma/movements';
import { ledgerData, ledgerMovement } from './movement-fixtures';
const relationRow = () => ({ ...ledgerMovement(1), createdAt: new Date('2026-09-02T12:00:00.000Z'), occurredAt: new Date('2026-09-02T12:00:00.000Z'), product: { name: 'Phone', sku: 'PHONE' }, actor: { name: 'Better Auth Name' }, unit: null, reverses: null, reversedBy: null, supplierReturn: null, saleItem: null });
beforeEach(() => {
  vi.clearAllMocks(); mocks.count.mockResolvedValue(205); mocks.findMany.mockResolvedValue([relationRow()]); mocks.latest.mockResolvedValue([{ productId: 'p', id: 'm0001' }]); mocks.invoices.mockResolvedValue([]);
  const data = ledgerData(); mocks.memory.clear();
  for (const [key, rows] of Object.entries({ 'stock-movements': data.movements, products: data.products, users: data.users })) mocks.memory.set(key, rows);
});
describe('movement repositories', () => {
  it('pages JSON results beyond 200 and keeps an exact full count', async () => {
    const page = await jsonRepositories.movements.findPage(parseMovementQuery({ page: '999', pageSize: '100' }));
    expect(page).toMatchObject({ totalCount: 205, pageCount: 3, page: 3 }); expect(page.rows).toHaveLength(5);
  });
  it('applies count, bounded rows and deterministic ordering at the Postgres source', async () => {
    const query = parseMovementQuery({ page: '999', pageSize: '100', reason: 'PURCHASE', actor: 'u' });
    const page = await prismaRepositories.movements.findPage(query);
    expect(page).toMatchObject({ page: 3, totalCount: 205, pageCount: 3 });
    expect(mocks.findMany).toHaveBeenCalledTimes(1); expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: movementWhere(query), skip: 200, take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
    expect(page.rows[0]?.actorName).toBe('Better Auth Name'); expect(page.rows[0]?.action.kind).toBe('reverse');
    expect(mocks.latest).not.toHaveBeenCalled(); expect(mocks.invoices).not.toHaveBeenCalled();
  });
  it('resolves a legacy sale invoice by a single batched reference query', async () => {
    mocks.findMany.mockResolvedValue([{ ...relationRow(), reason: 'SALE', reference: 'INV-42', quantity: -1 }]);
    mocks.invoices.mockResolvedValue([{ id: 'invoice-id', invoiceNumber: 'INV-42' }]);
    const page = await prismaRepositories.movements.findPage(parseMovementQuery({ reason: 'SALE' }));
    expect(mocks.invoices).toHaveBeenCalledWith({ where: { invoiceNumber: { in: ['INV-42'] } }, select: { id: true, invoiceNumber: true } });
    expect(page.rows[0]?.action).toMatchObject({ kind: 'invoice', href: '/invoices/invoice-id' });
  });
  it('resolves invoice-owned trade-ins and related corrections without per-row lookups', async () => {
    const correction = { ...ledgerMovement(2, { reason: 'CORRECTION', reversesId: 'm0001', quantity: -1 }), createdAt: new Date('2026-09-10'), occurredAt: new Date('2026-09-10') };
    mocks.findMany.mockResolvedValue([{ ...relationRow(), reason: 'TRADE_IN', unitId: 'unit', unit: { serialNo: 'IMEI', status: 'VOID', usedAcquisitions: [{ tradeInSale: { id: 'invoice', invoiceNumber: 'INV-1' } }] }, reversedBy: correction }]);
    const page = await prismaRepositories.movements.findPage(parseMovementQuery({ reason: 'TRADE_IN' }));
    expect(page.rows[0]?.action).toMatchObject({ kind: 'invoice', href: '/invoices/invoice' }); expect(page.rows[0]?.correction?.id).toBe('m0002');
    expect(mocks.latest).not.toHaveBeenCalled(); expect(mocks.invoices).not.toHaveBeenCalled();
  });
  it('escapes literal search metacharacters without changing date or enum filters', () => {
    const query = parseMovementQuery({ q: '50%_test', from: '2026-09-02', to: '2026-09-02', type: 'IN' });
    expect(movementWhere(query)).toMatchObject({ createdAt: { gte: new Date('2026-09-01T18:00:00Z'), lte: new Date('2026-09-02T17:59:59.999Z') }, type: 'IN', OR: expect.arrayContaining([{ note: { contains: '50\\%\\_test', mode: 'insensitive' } }]) });
  });
});
