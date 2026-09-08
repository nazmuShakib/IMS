import { describe, it, expect } from 'vitest';
import { productQuery, unitQuery, productPageFromRows, unitPageFromRows, pageRequest, unitRangeErrors, catalogUrl, PRODUCT_DEFAULTS, UNIT_DEFAULTS } from '@/lib/catalog-query';
import { productFormSchema } from '@/lib/product-form';
import { products, units, movements, acquisitions, expenses, now, categoryId } from './catalog-fixtures';
const productPage = (raw = {}) => productPageFromRows(products, units, movements, productQuery(raw, true, now));
const unitPage = (raw = {}) => unitPageFromRows(units, acquisitions, expenses, unitQuery(raw, 'p-1', true));
describe('catalog pagination and validation', () => {
  it('normalizes malformed page parameters and preserves explicit sizes', () => {
    for (const page of ['0', '-1', '1.2', 'abc', '99999999999999999999']) expect(pageRequest({ page, pageSize: '4' })).toEqual({ page: 1, pageSize: 25 });
    expect(pageRequest({ page: ['2', '3'], pageSize: '50' })).toEqual({ page: 2, pageSize: 50 });
  });
  it('sorts and filters before slicing, clamps pages and computes full-result counts', () => {
    const all = productPage({ status: 'all', pageSize: '100' });
    expect(all.rows.map(r => r.product.name).slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, i) => `Phone ${i}`));
    expect(productPage({ status: 'all', page: '2' }).rows).toEqual(all.rows.slice(25, 50));
    expect(productPage({ stock: 'low', page: '99' })).toMatchObject({ page: 1, pageCount: 1, totalCount: 23, lowCount: 23 });
    expect(productPage({ q: 'does-not-exist' })).toMatchObject({ rows: [], page: 1, pageCount: 1, totalCount: 0, catalogCount: 81 });
  });
  it('uses stock age and excludes reversed operations for dead stock', () => {
    const page = productPage({ stock: 'dead', pageSize: '100' });
    expect(page.rows.some(r => r.product.id === 'p-2')).toBe(false);
    expect(page.rows.some(r => r.product.id === 'p-3')).toBe(true);
    for (const days of [59, 60]) {
      const date = new Date(now.getTime() - days * 86400000).toISOString();
      expect(productPageFromRows([products[2]!], [], [{ ...movements[2]!, createdAt: date }], productQuery({ stock: 'dead' }, true, now)).totalCount).toBe(days === 60 ? 1 : 0);
    }
  });
  it('paginates units globally, retains aggregates and locates a target on later pages', () => {
    const all = unitPage({ order: 'serial-asc', pageSize: '100' });
    const second = unitPage({ order: 'serial-asc', page: '2' });
    expect(second.rows).toEqual(all.rows.slice(25, 50));
    expect(second).toMatchObject({ unitCount: 61, inStock: 40, stockValue: all.stockValue });
    expect(unitPage({ order: 'serial-asc', unit: 'u-60' })).toMatchObject({ page: 3, targetStatus: 'found' });
    expect(unitPage({ status: 'IN_STOCK', unit: 'u-60' }).targetStatus).toBe('filtered');
    expect(unitPage({ unit: 'foreign' }).targetStatus).toBe('missing');
    expect(second.usedDetails.every(d => second.rows.some(u => u.id === d.unitId))).toBe(true);
  });
  it('combines grade, acquisition, Dhaka date, cost and profit filters', () => {
    expect(unitPage({ grade: 'GRADE_A', acquisitionType: 'DIRECT_PURCHASE' }).totalCount).toBe(7);
    expect(unitPage({ receivedFrom: '2026-09-02', receivedTo: '2026-09-02' }).totalCount).toBe(30);
    const page = unitPage({ status: 'SOLD', order: 'profit-desc', minCost: '100', maxCost: '140' });
    expect(page.rows.every(u => u.status === 'SOLD' && u.costPrice <= 14000)).toBe(true);
    expect(page.rows[0]!.salePrice! - page.rows[0]!.costPrice).toBe(3000);
  });
  it('rejects invalid ranges instead of ignoring them', () => {
    for (const patch of [{ minCost: 'abc' }, { minCost: '-1' }, { maxCost: '1.234' }, { minCost: '20', maxCost: '10' }, { receivedFrom: '2026-02-30' }, { receivedFrom: '2026-09-02', receivedTo: '2026-09-01' }]) {
      expect(Object.keys(unitRangeErrors({ ...UNIT_DEFAULTS, ...patch })).length).toBeGreaterThan(0);
      expect(unitPage(patch).rows).toEqual([]);
    }
  });
  it('normalizes restricted STAFF filters before repository use and serializes only query fields', () => {
    expect(productQuery({ order: 'cost-desc' }, false).order).toBe('name-asc');
    expect(unitQuery({ order: 'profit-desc', minCost: '100', acquisitionType: 'TRADE_IN' }, 'p-1', false)).toMatchObject({ order: 'in-stock-first', minCost: '', acquisitionType: 'all' });
    expect(catalogUrl('/products', { ...PRODUCT_DEFAULTS, q: 'Phone & cable' }, { page: 2, pageSize: 50 })).toBe('/products?q=Phone+%26+cable&page=2&pageSize=50');
  });
  it('shares strict field-specific form validation across browser and server', () => {
    const valid = { sku: 'SKU', name: 'Phone', categoryId, brandId: '', trackingType: 'SERIAL', defaultCostPrice: '', defaultSalePrice: '', staffMaxDiscount: '0', reorderPoint: '5' };
    expect(productFormSchema.safeParse(valid).success).toBe(true);
    for (const reorderPoint of ['1.5', '1e2', '-1', 'abc']) expect(productFormSchema.safeParse({ ...valid, reorderPoint }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, defaultSalePrice: '1.234' }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, defaultSalePrice: '10', staffMaxDiscount: '11' }).success).toBe(false);
  });
});
