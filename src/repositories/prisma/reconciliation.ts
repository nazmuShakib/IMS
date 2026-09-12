import type { Prisma, PrismaClient } from '@prisma/client';
import { consistencyReport, type StockDifference } from '@/lib/reconciliation';
import { valuationFromRows } from '@/lib/valuation-consistency';
import { readSnapshot } from './read-snapshot';

export function checkStockConsistency(client: PrismaClient | Prisma.TransactionClient) {
  return readSnapshot(client, async tx => {
    // Separate aggregates prevent a product's units multiplying its movements.
    // One statement includes inactive products, zero-stock products and corrections.
    const [report] = await tx.$queryRaw<Array<{ checkedAt: Date; productsChecked: bigint; rows: StockDifference[] }>>`
      WITH ledger AS (
        SELECT "productId", SUM(quantity) AS quantity FROM stock_movements GROUP BY "productId"
      ), units AS (
        SELECT "productId", COUNT(*) AS quantity FROM product_units WHERE status = 'IN_STOCK' GROUP BY "productId"
      ), compared AS (
        SELECT p.id AS "productId", p.name, p.sku, p."trackingType",
          CASE WHEN p."trackingType" = 'SERIAL' THEN COALESCE(u.quantity, 0) ELSE p."quantityOnHand" END AS "onHand",
          COALESCE(l.quantity, 0) AS "ledgerSum"
        FROM products p LEFT JOIN ledger l ON l."productId" = p.id LEFT JOIN units u ON u."productId" = p.id
      )
      SELECT statement_timestamp() AS "checkedAt", COUNT(*) AS "productsChecked",
        COALESCE(jsonb_agg(to_jsonb(c)) FILTER (WHERE c."onHand" <> c."ledgerSum"), '[]'::jsonb) AS rows
      FROM compared c
    `;
    if (!report) throw Error('Stock consistency report missing');
    const [products, units, movements, expenses, acquisitions] = await Promise.all([
      tx.product.findMany({ select: { id: true, name: true, sku: true, trackingType: true, quantityOnHand: true, avgCostPrice: true } }),
      tx.productUnit.findMany({ select: { id: true, productId: true, serialNo: true, status: true, costPrice: true } }),
      tx.stockMovement.findMany({ select: { id: true, productId: true, unitId: true, reason: true, quantity: true, unitCost: true, reversesId: true, createdAt: true, idempotencyKey: true } }),
      tx.refurbishmentExpense.findMany({ select: { id: true, unitId: true, amount: true, createdAt: true } }),
      tx.usedDeviceAcquisition.findMany({ select: { unitId: true, idempotencyKey: true, acquisitionValue: true } }),
    ]);
    return { ...consistencyReport(report.checkedAt.toISOString(), Number(report.productsChecked), report.rows), valuation: valuationFromRows({
      products, units, acquisitions,
      movements: movements.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
      expenses: expenses.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
    }) };
  });
}
