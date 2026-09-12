import { valuationFromRows } from '@/lib/valuation-consistency';
import { consistencyFromRows } from '@/lib/reconciliation';
import type { Product, ProductUnit, StockMovement, RefurbishmentExpense, UsedDeviceAcquisition } from '@/domain/types';
import { readAll } from './store';

/** Caller holds the JSON process lock, including when used in a transaction. */
export async function checkJsonStockConsistency() {
  const checkedAt = new Date().toISOString();
  const [products, units, movements, expenses, acquisitions] = await Promise.all([
    readAll<Product>('products'), readAll<ProductUnit>('product-units'), readAll<StockMovement>('stock-movements'),
    readAll<RefurbishmentExpense>('refurbishment-expenses'), readAll<UsedDeviceAcquisition>('used-device-acquisitions'),
  ]);
  return { ...consistencyFromRows(products, units, movements, checkedAt), valuation: valuationFromRows({ products, units, movements, expenses, acquisitions }) };
}
