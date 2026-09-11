import { Prisma } from '@prisma/client';
import type { StockMovement } from '@/domain/types';
import { movementBounds, movementRow, type MovementPage, type MovementQuery } from '@/lib/movement-query';

export function movementWhere(query: MovementQuery): Prisma.StockMovementWhereInput {
  const { from, to } = movementBounds(query), search = query.q.replace(/[\\%_]/g, '\\$&');
  return {
    createdAt: from || to ? { gte: from, lte: to } : undefined,
    reason: query.reason ? query.reason as StockMovement['reason'] : undefined,
    type: query.type ? query.type as StockMovement['type'] : undefined,
    productId: query.product || undefined, actorId: query.actor || undefined,
    ...(search ? { OR: [
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
      { reference: { contains: search, mode: 'insensitive' } }, { note: { contains: search, mode: 'insensitive' } },
      { unit: { serialNo: { equals: search, mode: 'insensitive' } } },
    ] } : {}),
  };
}

export async function readMovementPage(client: Prisma.TransactionClient, query: MovementQuery, map: (row: Prisma.StockMovementGetPayload<object>) => StockMovement): Promise<MovementPage> {
  const where = movementWhere(query), direction = query.order === 'oldest' ? 'asc' : 'desc';
  const [totalCount, ledgerCount] = await Promise.all([client.stockMovement.count({ where }), client.stockMovement.count()]);
  const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize)), page = Math.min(query.page, pageCount);
  const rows = await client.stockMovement.findMany({
    where, orderBy: [{ createdAt: direction }, { id: direction }], take: query.pageSize, skip: (page - 1) * query.pageSize,
    include: {
      product: { select: { name: true, sku: true } }, actor: { select: { name: true } },
      unit: { select: { serialNo: true, status: true, usedAcquisitions: { where: { tradeInSaleId: { not: null } }, take: 1, orderBy: { id: 'asc' }, select: { tradeInSale: { select: { id: true, invoiceNumber: true } } } } } },
      reverses: true, reversedBy: true,
      supplierReturn: { select: { id: true, returnNumber: true } },
      saleItem: { select: { sale: { select: { id: true, invoiceNumber: true } } } },
    },
  });
  const bulkIds = [...new Set(rows.filter(row => !row.unitId && row.quantity < 0 && row.reason !== 'CORRECTION' && !row.reversedBy).map(row => row.productId))];
  const references = [...new Set(rows.filter(row => row.reason === 'SALE' && !row.saleItem && row.reference).map(row => row.reference!))];
  const [latest, invoices] = await Promise.all([
    bulkIds.length ? client.$queryRaw<Array<{ productId: string; id: string }>>(Prisma.sql`
      SELECT DISTINCT ON (m."productId") m."productId", m.id FROM stock_movements m
      WHERE m."productId" IN (${Prisma.join(bulkIds)}) AND m.reason <> 'CORRECTION'
        AND NOT EXISTS (SELECT 1 FROM stock_movements c WHERE c."reversesId" = m.id)
      ORDER BY m."productId", m."createdAt" DESC, m.id DESC
    `) : [],
    references.length ? client.sale.findMany({ where: { invoiceNumber: { in: references } }, select: { id: true, invoiceNumber: true } }) : [],
  ]);
  const latestByProduct = new Map(latest.map(row => [row.productId, row.id]));
  const invoiceByNumber = new Map(invoices.map(row => [row.invoiceNumber, row]));
  return { page, pageSize: query.pageSize, pageCount, totalCount, ledgerCount, rows: rows.map(row => movementRow(map(row), {
    product: row.product, unit: row.unit, actor: row.actor,
    invoice: row.reason === 'TRADE_IN' ? row.unit?.usedAcquisitions[0]?.tradeInSale ?? null : row.saleItem?.sale ?? invoiceByNumber.get(row.reference ?? '') ?? null,
    supplierReturn: row.supplierReturn, original: row.reverses ? map(row.reverses) : null, correction: row.reversedBy ? map(row.reversedBy) : null,
    latestId: latestByProduct.get(row.productId) ?? null,
  })) };
}
