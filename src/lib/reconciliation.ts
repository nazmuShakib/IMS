import type { Product, ProductUnit, StockMovement } from '@/domain/types';

export interface StockDifference {
  productId: string; sku: string; name: string; trackingType: Product['trackingType'];
  onHand: number; ledgerSum: number; drift: number;
}
export interface StockConsistencyReport {
  valuation?: import('./valuation-consistency').ValuationReport;
  checkedAt: string; productsChecked: number; productsMatching: number;
  productsWithDifferences: number; rows: StockDifference[];
}
export function consistencyReport(checkedAt: string, productsChecked: number, rows: StockDifference[]): StockConsistencyReport {
  if (!Number.isFinite(Date.parse(checkedAt)) || !Number.isSafeInteger(productsChecked) || productsChecked < rows.length) throw Error('Invalid stock consistency report');
  // Explicit projection keeps storage-only fields and costs out of the payload.
  const differences = rows.map(({ productId, name, sku, trackingType, onHand, ledgerSum }) => {
    const drift = onHand - ledgerSum;
    if (![onHand, ledgerSum, drift].every(Number.isSafeInteger)) throw Error('Stock quantity exceeds supported range');
    return { productId, name, sku, trackingType, onHand, ledgerSum, drift };
  }).filter(row => row.drift !== 0).sort((a, b) => a.sku.localeCompare(b.sku) || a.productId.localeCompare(b.productId));
  return { checkedAt, productsChecked, productsMatching: productsChecked - differences.length, productsWithDifferences: differences.length, rows: differences };
}
export function consistencyFromRows(products: Pick<Product, 'id' | 'name' | 'sku' | 'trackingType' | 'quantityOnHand'>[], units: Pick<ProductUnit, 'productId' | 'status'>[], movements: Pick<StockMovement, 'productId' | 'quantity'>[], checkedAt: string): StockConsistencyReport {
  const counts = new Map<string, number>(), totals = new Map<string, number>();
  for (const unit of units) if (unit.status === 'IN_STOCK') counts.set(unit.productId, (counts.get(unit.productId) ?? 0) + 1);
  for (const movement of movements) totals.set(movement.productId, (totals.get(movement.productId) ?? 0) + movement.quantity);
  return consistencyReport(checkedAt, products.length, products.map(product => {
    const onHand = product.trackingType === 'SERIAL' ? counts.get(product.id) ?? 0 : product.quantityOnHand;
    const ledgerSum = totals.get(product.id) ?? 0;
    return { productId: product.id, name: product.name, sku: product.sku, trackingType: product.trackingType, onHand, ledgerSum, drift: onHand - ledgerSum };
  }));
}
export type StockCheckResult = { report: StockConsistencyReport; error?: never } | { error: 'consistency.failed'; report?: never };
