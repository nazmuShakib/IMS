import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), products: vi.fn(), suppliers: vi.fn() }));
vi.mock('@/repositories', () => ({ db: { products: { findAll: mocks.products }, suppliers: { findAll: mocks.suppliers } } }));
vi.mock('@/lib/session', () => ({ requirePageCapability: mocks.permission, getSession: async () => ({ locale: 'en' }) }));
vi.mock('@/components/stock/StockOutForm', () => ({ StockOutForm: () => null }));
import Page from '@/app/(dashboard)/stock/out/page';
import { StockOutForm } from '@/components/stock/StockOutForm';
beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ role: 'ADMIN' }); });
it('includes archived bulk stock and excludes exhausted archives and serial products', async () => {
  mocks.products.mockResolvedValue([{ id: 'active', trackingType: 'QUANTITY', isActive: true, quantityOnHand: 0 }, { id: 'archived', trackingType: 'QUANTITY', isActive: false, quantityOnHand: 2 }, { id: 'empty', trackingType: 'QUANTITY', isActive: false, quantityOnHand: 0 }, { id: 'phone', trackingType: 'SERIAL', isActive: true }]);
  mocks.suppliers.mockResolvedValue([{ id: 'active', isActive: true }, { id: 'inactive', isActive: false }]);
  const element = await Page({ searchParams: Promise.resolve({ serial: 'DEVICE' }) });
  const form = React.Children.toArray(element.props.children).find((child: any) => child.type === StockOutForm) as React.ReactElement<any>;
  expect(form.props.bulkProducts.map((item: any) => item.id)).toEqual(['active', 'archived']); expect(form.props.suppliers).toHaveLength(1); expect(form.props.initialSerial).toBe('DEVICE');
  expect(mocks.permission).toHaveBeenCalledWith('REMOVE_STOCK');
});
it('rejects unauthorized access before reading inventory', async () => {
  mocks.permission.mockRejectedValueOnce(new Error('Forbidden'));
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('Forbidden'); expect(mocks.products).not.toHaveBeenCalled();
});
