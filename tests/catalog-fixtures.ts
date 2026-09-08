import type { Product, ProductUnit, StockMovement, UsedDeviceAcquisition, RefurbishmentExpense } from '@/domain/types';
export const categoryId = '11111111-1111-4111-8111-111111111111';
export const brandId = '22222222-2222-4222-8222-222222222222';
export const now = new Date('2026-09-08T12:00:00.000Z');
export const products: Product[] = Array.from({ length: 81 }, (_, i) => ({
  id: `p-${i}`, name: `Phone ${i}`, sku: `P${String(i).padStart(3, '0')}`, barcode: `90000${i}`, model: `M${i}`, description: null,
  trackingType: i === 1 ? 'SERIAL' : 'QUANTITY', categoryId, brandId: i % 2 ? brandId : null,
  defaultCostPrice: 10000 + i * 100, defaultSalePrice: 20000 + i * 200, staffMaxDiscount: 0,
  taxRate: 0, reorderPoint: 3, quantityOnHand: i % 10, avgCostPrice: 10000, imageUrl: null, isActive: i % 5 !== 0,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}));
export const units: ProductUnit[] = Array.from({ length: 61 }, (_, i) => ({
  id: `u-${i}`, serialNo: `00${String(i).padStart(3, '0')}`, productId: 'p-1', status: i % 3 ? 'IN_STOCK' : 'SOLD',
  costPrice: 10000 + i * 100, salePrice: i % 3 ? null : 10000 + i * 100 + (i % 7 - 3) * 1000,
  receivedAt: i % 2 ? '2026-09-01T18:30:00.000Z' : '2026-08-01T00:00:00.000Z',
  soldAt: i % 3 ? null : '2026-09-02T00:00:00.000Z', supplierId: null, location: i % 2 ? 'Shelf A' : 'Back room',
  warrantyMonths: null, warrantyDays: null, warrantyExpiresAt: null, note: null,
  usedGrade: i % 5 ? null : 'GRADE_A', batteryHealth: null, inspectionResults: null, cosmeticCondition: null,
  knownDefects: null, includedAccessories: null, askingPrice: null,
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
}));
export const movements: StockMovement[] = products.map(p => ({
  id: `m-${p.id}`, productId: p.id, unitId: null, type: 'IN', reason: 'PURCHASE', quantity: 10,
  unitCost: 10000, unitPrice: null, supplierId: null, customerName: null, customerPhone: null,
  actorId: 'actor', idempotencyKey: `m-${p.id}`, reversesId: null, reference: null, note: null,
  createdAt: p.id === 'p-2' ? '2026-09-07T12:00:00.000Z' : '2026-01-01T00:00:00.000Z',
}));
movements.push({ ...movements[0]!, id: 'out', idempotencyKey: 'out', productId: 'p-3', quantity: -1, type: 'OUT', reason: 'SALE', createdAt: '2026-09-07T00:00:00.000Z' },
  { ...movements[0]!, id: 'undo', idempotencyKey: 'undo', productId: 'p-3', quantity: 1, type: 'ADJUST', reason: 'CORRECTION', reversesId: 'out', createdAt: '2026-09-08T00:00:00.000Z' });
export const acquisitions: UsedDeviceAcquisition[] = units.filter(u => u.usedGrade).map((u, i) => ({
  id: `a-${u.id}`, idempotencyKey: `a-${u.id}`, unitId: u.id, type: i % 2 ? 'TRADE_IN' : 'DIRECT_PURCHASE',
  sellerName: 'Test seller', sellerPhone: '01712345678', identificationType: null, identificationNumber: null,
  acquisitionValue: 10000, ownershipConfirmed: true, acceptedById: 'actor', reference: null, note: null, tradeInSaleId: null,
  acquiredAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
}));
export const expenses: RefurbishmentExpense[] = [{ id: 'expense', unitId: 'u-5', description: 'Repair', amount: 2500, actorId: 'actor', createdAt: '2026-09-01T00:00:00.000Z' }];
