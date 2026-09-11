import type { StockMovement } from '@/domain/types';
import type { MovementData } from '@/lib/movement-query';
export const ledgerMovement = (index: number, patch: Partial<StockMovement> = {}): StockMovement => ({
  id: `m${String(index).padStart(4, '0')}`, productId: 'p', unitId: null, type: 'IN', reason: 'PURCHASE', quantity: 1,
  unitCost: 12345, unitPrice: null, supplierId: null, customerName: null, customerPhone: null, reference: null, note: null,
  actorId: 'u', idempotencyKey: `key-${index}`, reversesId: null, createdAt: '2026-09-02T12:00:00.000Z', ...patch,
});
export const ledgerData = (movements = Array.from({ length: 205 }, (_, index) => ledgerMovement(index))): MovementData => ({
  movements, products: [{ id: 'p', name: 'Phone', sku: 'PHONE' }], users: [{ id: 'u', name: 'Admin' }], units: [], sales: [], acquisitions: [], returns: [],
});

