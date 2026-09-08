import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@/domain/types';
import CheckoutPage from '@/app/(dashboard)/checkout/page';
const mock = vi.hoisted(() => ({ role: 'ADMIN' as Role }));
vi.mock('@/lib/session', () => ({
  requirePageCapability: async () => ({ id: 'actor', role: mock.role }),
  getSession: async () => ({ locale: 'en' }),
}));
vi.mock('@/services/checkout', () => ({ getOrCreateCart: async () => ({ id: 'cart' }) }));
vi.mock('@/components/checkout/CheckoutWorkspace', () => ({ CheckoutWorkspace: () => null }));
vi.mock('@/repositories', () => ({ db: {
  products: { findAll: async () => [
    { id: 'bulk', name: 'Cable', trackingType: 'QUANTITY', quantityOnHand: 4, avgCostPrice: 12500, defaultCostPrice: 15000, defaultSalePrice: 20000 },
    { id: 'serial', name: 'Phone', trackingType: 'SERIAL', avgCostPrice: 0, defaultCostPrice: 88000, defaultSalePrice: 120000 },
  ] },
  units: { findAllInStock: async () => [{ id: 'unit', productId: 'serial', costPrice: 75000 }] },
  customers: { findAll: async () => [] },
} }));

describe('checkout cost disclosure', () => {
  it.each(['ADMIN', 'MANAGER', 'STAFF'] as const)('limits cost data to authorized roles: %s', async role => {
    mock.role = role;
    const page = await CheckoutPage({ searchParams: Promise.resolve({}) });
    const props = page.props.children[1].props;
    const bulk = props.products.find((product: { id: string }) => product.id === 'bulk');
    const unit = props.units[0];
    if (role === 'STAFF') {
      expect(bulk).not.toHaveProperty('costPrice');
      expect(unit).not.toHaveProperty('costPrice');
    } else {
      expect(bulk.costPrice).toBe(12500);
      expect(unit.costPrice).toBe(75000);
    }
  });
});
