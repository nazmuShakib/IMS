import { describe, expect, it } from 'vitest';
import { consistencyFromRows, consistencyReport } from '@/lib/reconciliation';
import type { Product } from '@/domain/types';

const checkedAt = '2026-09-11T18:30:00.000Z';
const product = (id: string, quantityOnHand = 0, trackingType: Product['trackingType'] = 'QUANTITY') => ({ id, name: id, sku: id, quantityOnHand, trackingType, isActive: false, avgCostPrice: 999 });
describe('stock consistency quantities', () => {
  it('includes inactive and zero-stock products while counting corrections exactly once', () => {
    const report = consistencyFromRows([product('glass', 9), product('empty')], [], [
      { productId: 'glass', quantity: 40 }, { productId: 'glass', quantity: 9 }, { productId: 'glass', quantity: -40 },
    ], checkedAt);
    expect(report).toEqual({ checkedAt, productsChecked: 2, productsMatching: 2, productsWithDifferences: 0, rows: [] });
  });
  it('reports signed differences and uses only IN_STOCK units for serial products', () => {
    const report = consistencyFromRows([product('bulk', 4), product('serial', 999, 'SERIAL')], [
      { productId: 'serial', status: 'IN_STOCK' }, { productId: 'serial', status: 'SOLD' },
      { productId: 'serial', status: 'VOID' }, { productId: 'serial', status: 'DAMAGED' },
    ], [{ productId: 'bulk', quantity: 3 }, { productId: 'serial', quantity: 2 }], checkedAt);
    expect(report).toMatchObject({ productsChecked: 2, productsMatching: 0, productsWithDifferences: 2 });
    expect(report.rows).toEqual([
      { productId: 'bulk', name: 'bulk', sku: 'bulk', trackingType: 'QUANTITY', onHand: 4, ledgerSum: 3, drift: 1 },
      { productId: 'serial', name: 'serial', sku: 'serial', trackingType: 'SERIAL', onHand: 1, ledgerSum: 2, drift: -1 },
    ]);
    expect(JSON.stringify(report)).not.toContain('avgCostPrice');
  });
  it('distinguishes an empty inventory and rejects unrepresentable quantities', () => {
    expect(consistencyFromRows([], [], [], checkedAt)).toMatchObject({ productsChecked: 0, rows: [] });
    expect(() => consistencyFromRows([product('huge', Number.MAX_SAFE_INTEGER + 1)], [], [], checkedAt)).toThrow('supported range');
  });
  it('does not forward accidental storage or cost fields in discrepancies', () => {
    const row = { productId: 'p', sku: 'P', name: 'Product', trackingType: 'QUANTITY' as const, onHand: 2, ledgerSum: 1, drift: 99, unitCost: 999, avgCostPrice: 999 };
    const report = consistencyReport(checkedAt, 1, [row]);
    expect(report.rows[0]?.drift).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/unitCost|avgCostPrice/);
  });
});
