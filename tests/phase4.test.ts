import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { Product, ProductUnit, StockMovement, Supplier, User } from '@/domain/types';
import { searchInventory } from '@/lib/search';
import type { Repositories } from '@/repositories';
import { getDashboard } from '@/services/dashboard';

const now = new Date('2026-07-18T06:00:00.000Z');

const serialProduct: Product = {
  id: 'serial-product', sku: 'PHONE-1', barcode: '10001', name: 'Test Phone', description: null,
  model: 'T1', trackingType: 'SERIAL', categoryId: 'phones', brandId: null,
  defaultCostPrice: 500, defaultSalePrice: 800, taxRate: 0, reorderPoint: 2,
  quantityOnHand: 0, avgCostPrice: 0, imageUrl: null, isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const bulkProduct: Product = {
  ...serialProduct, id: 'bulk-product', sku: 'CABLE-1', barcode: '20002', name: 'Test Cable',
  model: null, trackingType: 'QUANTITY', defaultCostPrice: 100, defaultSalePrice: 200,
  quantityOnHand: 10, avgCostPrice: 100, reorderPoint: 3,
};

const units: ProductUnit[] = [
  {
    id: 'unit-in', serialNo: 'IMEI-EXACT', productId: serialProduct.id, status: 'IN_STOCK',
    costPrice: 500, salePrice: null, supplierId: 'supplier-1', receivedAt: '2026-06-01T00:00:00.000Z',
    soldAt: null, warrantyMonths: 12, warrantyExpiresAt: '2027-06-01T00:00:00.000Z',
    location: 'A1', note: null, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'unit-sold', serialNo: 'IMEI-SOLD', productId: serialProduct.id, status: 'SOLD',
    costPrice: 500, salePrice: 800, supplierId: 'supplier-1', receivedAt: '2026-05-01T00:00:00.000Z',
    soldAt: '2026-07-05T00:00:00.000Z', warrantyMonths: 12, warrantyExpiresAt: '2027-05-01T00:00:00.000Z',
    location: null, note: null, createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z',
  },
];

const movement = (patch: Partial<StockMovement> & Pick<StockMovement, 'id'>): StockMovement => ({
  id: patch.id, type: 'OUT', reason: 'SALE', productId: serialProduct.id, unitId: null,
  quantity: -1, unitCost: 500, unitPrice: 800, supplierId: null, customerName: null,
  customerPhone: null, reference: null, note: null, actorId: 'user-1', idempotencyKey: patch.id,
  reversesId: null, createdAt: '2026-07-05T00:00:00.000Z', ...patch,
});

const movements: StockMovement[] = [
  movement({ id: 'serial-sale', unitId: 'unit-sold' }),
  movement({ id: 'bulk-sale', productId: bulkProduct.id, quantity: -2, unitCost: 100, unitPrice: 200 }),
  movement({
    id: 'bulk-correction', type: 'ADJUST', reason: 'CORRECTION', productId: bulkProduct.id,
    quantity: 2, unitCost: 100, unitPrice: 200, reversesId: 'bulk-sale',
  }),
];

const supplier: Supplier = {
  id: 'supplier-1', name: 'Supplier One', phone: null, email: null, address: null, note: null,
  isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const user: User = {
  id: 'user-1', name: 'Test User', email: 'test@example.com', emailVerified: true, image: null,
  role: 'ADMIN', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

function repositories(search = vi.fn(async () => [serialProduct, bulkProduct])): Repositories {
  return {
    products: {
      findAll: vi.fn(async () => [serialProduct, bulkProduct]),
      findById: vi.fn(async (id: string) => [serialProduct, bulkProduct].find((p) => p.id === id) ?? null),
      search,
    },
    units: {
      findBySerial: vi.fn(async (serial: string) => units.find((unit) => unit.serialNo === serial) ?? null),
      findByProduct: vi.fn(async (productId: string) => units.filter((unit) => unit.productId === productId)),
      countInStock: vi.fn(async (productId: string) => units.filter((unit) => unit.productId === productId && unit.status === 'IN_STOCK').length),
    },
    suppliers: { findById: vi.fn(async () => supplier) },
    users: { findAll: vi.fn(async () => [user]) },
    movements: { findByDateRange: vi.fn(async () => movements) },
  } as unknown as Repositories;
}

describe('Phase 4 dashboard', () => {
  it('derives operational and financial KPIs from stock and the append-only ledger', async () => {
    const dashboard = await getDashboard('ADMIN', now, repositories());
    expect(dashboard.totalUnits).toBe(11);
    expect(dashboard.distinctSkus).toBe(2);
    expect(dashboard.recentActivity[0]?.actorName).toBe('Test User');
    expect(dashboard.canSeeFinancials).toBe(true);
    if (!dashboard.canSeeFinancials) throw new Error('Expected financial dashboard');
    expect(dashboard.stockValueAtCost).toBe(1_500);
    expect(dashboard.stockValueAtRetail).toBe(2_800);
    expect(dashboard.potentialMargin).toBe(1_300);
    expect(dashboard.monthRevenue).toBe(800);
    expect(dashboard.monthCogs).toBe(500);
    expect(dashboard.monthGrossProfit).toBe(300);
  });

  it('never serializes financial or cost fields for STAFF', async () => {
    const dashboard = await getDashboard('STAFF', now, repositories());
    expect(dashboard.canSeeFinancials).toBe(false);
    const payload = JSON.stringify(dashboard);
    for (const field of ['stockValueAtCost', 'stockValueAtRetail', 'potentialMargin', 'monthRevenue', 'monthCogs', 'monthGrossProfit', 'dailyFinancials', 'unitCost', 'costPrice']) {
      expect(payload).not.toContain(field);
    }
  });
});

describe('Phase 4 search', () => {
  it('returns an exact serial before attempting product search', async () => {
    const productSearch = vi.fn(async () => {
      throw new Error('Product search must not run after an exact serial hit');
    });
    const result = await searchInventory('IMEI-EXACT', 'ADMIN', now, repositories(productSearch));
    expect(result.units).toHaveLength(1);
    expect(result.products).toHaveLength(0);
    expect(result.units[0]).toMatchObject({ serialNo: 'IMEI-EXACT', supplierName: 'Supplier One', costPrice: 500 });
    expect(productSearch).not.toHaveBeenCalled();
  });

  it('strips costs from STAFF serial and product results', async () => {
    const unitResult = await searchInventory('IMEI-EXACT', 'STAFF', now, repositories());
    expect(unitResult.units[0]).not.toHaveProperty('costPrice');

    const productResult = await searchInventory('Test', 'STAFF', now, repositories());
    expect(productResult.products).toHaveLength(2);
    for (const product of productResult.products) {
      expect(product).not.toHaveProperty('defaultCostPrice');
      expect(product).not.toHaveProperty('avgCostPrice');
    }
  });
});

describe('Phase 4 UI and API boundaries', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('protects the search route and disables caching', () => {
    const route = source('src/app/api/search/route.ts');
    expect(route).toContain('getOptionalSession()');
    expect(route).toContain("status: 401");
    expect(route).toContain("'Cache-Control': 'private, no-store'");
  });

  it('supports mouse opening, Ctrl/Cmd+K, 250 ms debounce, and Escape', () => {
    const palette = source('src/components/search/CommandPalette.tsx');
    expect(palette).toContain('onClick={() => setOpen(true)}');
    expect(palette).toContain('event.metaKey || event.ctrlKey');
    expect(palette).toContain('}, 250)');
    expect(palette).toContain("event.key === 'Escape'");
  });

  it('automatically retries one transient first-search server failure', () => {
    const palette = source('src/components/search/CommandPalette.tsx');
    expect(palette).toContain('response.status >= 500');
    expect(palette).toContain('window.setTimeout(resolve, 300)');
    expect(palette.match(/response = await request\(\)/g)).toHaveLength(2);
  });

  it('resolves movement actors from Better Auth instead of only legacy JSON users', () => {
    const ledger = source('src/app/(dashboard)/stock/movements/page.tsx');
    expect(ledger).toContain('getAuthUserNames(all.map((movement) => movement.actorId))');
    expect(ledger).toContain('actorNameById.get(m.actorId)');
  });
});
