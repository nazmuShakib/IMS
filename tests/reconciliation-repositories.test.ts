import { beforeEach, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => new Map<string, unknown[]>());
vi.mock('@/repositories/json/store', async original => ({ ...await original<typeof import('@/repositories/json/store')>(), readAll: async (key: string) => fixtures.get(key) ?? [] }));
import { jsonRepositories } from '@/repositories/json';
import { reconcile } from '@/services/stock';
beforeEach(() => {
  fixtures.clear(); fixtures.set('products', [{ id: 'p', name: 'Glass', sku: 'GLASS', trackingType: 'QUANTITY', avgCostPrice: 0, quantityOnHand: 2, isActive: false }]);
  fixtures.set('stock-movements', [{ productId: 'p', quantity: 1 }]);
});
it('keeps the legacy service compatible with the complete grouped report', async () => {
  expect(await reconcile(jsonRepositories)).toEqual([{ productId: 'p', name: 'Glass', sku: 'GLASS', trackingType: 'QUANTITY', onHand: 2, ledgerSum: 1, drift: 1 }]);
});
it('waits for an ongoing JSON transaction and supports checking inside that transaction', async () => {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; });
  const write = jsonRepositories.transaction(async tx => {
    fixtures.set('products', [{ id: 'p', name: 'Glass', sku: 'GLASS', trackingType: 'QUANTITY', avgCostPrice: 0, quantityOnHand: 3 }]);
    entered(); await proceed;
    fixtures.set('stock-movements', [{ productId: 'p', quantity: 3 }]);
    return tx.reconciliation.check();
  });
  await ready;
  let finished = false; const pending = jsonRepositories.reconciliation.check().then(report => { finished = true; return report; });
  await Promise.resolve(); expect(finished).toBe(false); release();
  const [inside, outside] = await Promise.all([write, pending]); expect(inside.rows).toEqual([]); expect(outside.rows).toEqual([]);
});
