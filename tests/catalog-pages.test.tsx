import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canSeeCosts } from '@/lib/permissions';
import { products, units, acquisitions, expenses, movements, now, categoryId } from './catalog-fixtures';
import { productPageFromRows, unitPageFromRows, unitQuery } from '@/lib/catalog-query';
const mocks = vi.hoisted(() => ({ session: vi.fn(), product: vi.fn(), products: vi.fn(), units: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: mocks.session, canSeeCosts: (role: string) => role !== 'STAFF' }));
vi.mock('@/repositories', () => ({ db: {
  products: { findById: mocks.product, findPage: mocks.products }, units: { findPage: mocks.units },
  categories: { findAll: async () => [{ id: 'removed-category', name: 'Old', isActive: false }, { id: categoryId, name: 'Phones', isActive: true }], findById: async () => ({ name: 'Phones' }) },
  brands: { findAll: async () => [], findById: async () => null },
} }));
vi.mock('@/components/catalog/ArchiveProductControl', () => ({ ArchiveProductControl: () => null }));
vi.mock('@/actions/catalog', () => ({ restoreProduct: vi.fn() }));
vi.mock('@/components/catalog/SerializedUnitRegister', () => ({ SerializedUnitRegister: () => null }));
vi.mock('@/components/catalog/ProductRegister', () => ({ ProductRegister: () => null }));
import ProductPage from '@/app/(dashboard)/products/[id]/page';
import ProductsPage from '@/app/(dashboard)/products/page';
import { SerializedUnitRegister } from '@/components/catalog/SerializedUnitRegister';
import { ProductRegister } from '@/components/catalog/ProductRegister';
function find(value: any, type: unknown): any {
  if (Array.isArray(value)) return value.map(v => find(v, type)).find(Boolean);
  if (React.isValidElement(value)) return value.type === type ? value.props : find((value.props as any).children, type);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.product.mockResolvedValue(products[1]);
  mocks.session.mockResolvedValue({ role: 'STAFF', locale: 'en' });
  mocks.units.mockImplementation(async q => unitPageFromRows(units, acquisitions, expenses, q));
  mocks.products.mockImplementation(async q => productPageFromRows([{ ...products[0]!, categoryId: 'removed-category' }, ...products.slice(1)], units, movements, { ...q, now: now.toISOString() }));
});
describe('catalog page boundaries', () => {
  it.each(['STAFF', 'MANAGER', 'ADMIN'])('returns only the requested unit page with role-safe props for %s', async role => {
    mocks.session.mockResolvedValue({ role, locale: 'en' });
    const page = await ProductPage({ params: Promise.resolve({ id: 'p-1' }), searchParams: Promise.resolve({ page: '2', order: 'cost-desc' }) });
    const props = find(page, SerializedUnitRegister);
    expect(props.units).toHaveLength(25); expect(props.meta).toMatchObject({ page: 2, totalCount: 61 });
    expect(props.unitCount).toBe(61); expect(props.inStock).toBe(40); expect(mocks.units).toHaveBeenCalledTimes(1);
    if (!canSeeCosts(role as any)) {
      expect(JSON.stringify(props)).not.toContain('costPrice'); expect(JSON.stringify(props)).not.toContain('sellerName'); expect(JSON.stringify(props)).not.toContain('stockValue');
      expect(mocks.units.mock.calls[0][0].order).toBe('in-stock-first');
    } else expect(props.units[0].costPrice).toBeDefined();
  });
  it('keeps removed taxonomy usable in archived-product filtering', async () => {
    const page = await ProductsPage({ searchParams: Promise.resolve({ status: 'archived', order: 'cost-desc' }) });
    const props = find(page, ProductRegister);
    expect(props.categories).toContainEqual({ id: 'removed-category', name: 'Old (Removed)' });
    expect(props.confirmedFilters.order).toBe('name-asc'); expect(mocks.products).toHaveBeenCalledTimes(1);
  });
});
