import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), products: vi.fn(), receipt: vi.fn(), movements: vi.fn(), audit: vi.fn(), units: vi.fn() }));
vi.mock('@/lib/session', () => ({ requirePageCapability: mocks.actor, getSession: async () => ({ locale: 'en' }) }));
vi.mock('@/repositories', () => ({ db: { products: { findAll: mocks.products }, brands: { findAll: async () => [] }, movements: { findById: mocks.receipt, findByProduct: mocks.movements }, auditLogs: { findByEntity: mocks.audit }, units: { findByProduct: mocks.units } } }));
vi.mock('@/components/labels/StockLabelStudio', () => ({ StockLabelStudio: () => null }));
import Page from '@/app/(dashboard)/stock/labels/page';
const phone = { id: 'phone', sku: 'PHONE', name: 'Phone', trackingType: 'SERIAL', quantityOnHand: 1, isActive: true };
const bulk = { ...phone, id: 'bulk', trackingType: 'QUANTITY' };
async function studio(params: { product?: string; unit?: string; receipt?: string }) {
  const page = await Page({ searchParams: Promise.resolve(params) });
  return (page.props.children[1] as React.ReactElement<Record<string, unknown>>).props;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor', role: 'ADMIN' }); mocks.products.mockResolvedValue([phone, bulk]);
  mocks.receipt.mockResolvedValue(null); mocks.movements.mockResolvedValue([]); mocks.audit.mockResolvedValue([]);
  mocks.units.mockResolvedValue([{ id: 'one', serialNo: 'SERIAL', status: 'IN_STOCK', receivedAt: '2026-09-01T00:00:00Z' }]);
});
describe('label deep-link initialization', () => {
  it.each([{ product: 'missing' }, { product: '' }, { product: 'phone', receipt: 'missing' }, { product: 'phone', unit: 'foreign' }, { unit: 'one' }, { product: 'bulk', unit: 'one' }])('rejects unavailable context %j', async params => {
    expect((await studio(params)).selectionError).toBe('labels.selectionUnavailable');
  });
  it('preselects an eligible unit and asks STAFF repositories for in-stock records only', async () => {
    mocks.actor.mockResolvedValue({ id: 'actor', role: 'STAFF' });
    expect((await studio({ product: 'phone', unit: 'one' })).initialUnitIds).toEqual(['one']);
    expect(mocks.units).toHaveBeenCalledWith('phone', 'IN_STOCK');
    mocks.units.mockResolvedValue([]);
    expect((await studio({ product: 'phone', unit: 'one' })).selectionError).toBe('labels.selectionUnavailable');
  });
  it('preserves oversized quantity receipts without truncating or silently selecting one', async () => {
    mocks.receipt.mockResolvedValue({ id: 'receipt', productId: 'bulk', type: 'IN', quantity: 600 });
    expect(await studio({ product: 'bulk', receipt: 'receipt' })).toMatchObject({ initialCopies: 600, receiptCount: 600, receiptId: 'receipt' });
    expect((await studio({ product: 'phone', receipt: 'receipt' })).selectionError).toBe('labels.selectionUnavailable');
  });
  it('uses recorded receipt membership and reports inaccessible receipt units', async () => {
    mocks.receipt.mockResolvedValue({ id: 'receipt', productId: 'phone', type: 'IN', quantity: 1 });
    mocks.audit.mockResolvedValue([{ action: 'stock.in', after: { movementIds: ['m1', 'm2'] } }]);
    mocks.movements.mockResolvedValue([{ id: 'm1', type: 'IN', unitId: 'one' }, { id: 'm2', type: 'IN', unitId: 'two' }, { id: 'unrelated', type: 'IN', unitId: 'three' }]);
    mocks.units.mockResolvedValue(['one', 'two', 'three'].map(id => ({ id, serialNo: id, status: 'IN_STOCK', receivedAt: '2026-09-01T00:00:00Z' })));
    expect(await studio({ receipt: 'receipt' })).toMatchObject({ initialUnitIds: ['one', 'two'], receiptCount: 2 });
    mocks.units.mockResolvedValue([{ id: 'one', serialNo: 'one', status: 'IN_STOCK', receivedAt: '2026-09-01T00:00:00Z' }]);
    expect((await studio({ receipt: 'receipt' })).selectionError).toBe('labels.selectionUnavailable');
  });
});
