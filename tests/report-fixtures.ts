import type {
  Product,
  ProductUnit,
  StockMovement,
  Category,
  Brand,
  Supplier,
  User,
} from '@/domain/types';
import type { ReportContext } from '@/lib/report-calculations';
export const reportNow = new Date('2026-09-10T06:00:00Z');
export function reportFixture(): ReportContext {
  const products = Array.from(
    { length: 121 },
    (_, i) =>
      ({
        id: `p${String(i).padStart(3, '0')}`,
        name:
          i === 0
            ? '=1+1'
            : i === 1
              ? 'বাংলা স্মার্টফোন দীর্ঘ নাম'
              : i === 2
                ? 'Unknown'
                : `Product ${i % 9}`,
        sku: `SKU-${i}`,
        trackingType: i === 120 ? 'SERIAL' : 'QUANTITY',
        categoryId: `c${i % 12}`,
        brandId: i % 4 === 0 ? null : `b${i % 11}`,
        quantityOnHand: i === 120 ? 0 : 1,
        avgCostPrice: 15000,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isActive: i % 3 !== 0,
      }) as Product,
  );
  const movements: StockMovement[] = products
    .filter((p) => p.trackingType === 'QUANTITY')
    .flatMap(
      (p, i) =>
        [
          {
            id: `receipt-${p.id}`,
            productId: p.id,
            type: 'IN',
            reason: 'PURCHASE',
            quantity: 2,
            unitCost: 10000,
            unitPrice: null,
            createdAt: '2026-01-01T06:00:00.000Z',
            occurredAt: '2026-01-01T06:00:00.000Z',
            supplierId: `s${i % 12}`,
            actorId: 'u1',
            reversesId: null,
            reference: null,
          },
          {
            id: `recent-${p.id}`,
            productId: p.id,
            type: 'IN',
            reason: 'PURCHASE',
            quantity: 1,
            unitCost: 20000,
            unitPrice: null,
            createdAt: '2026-09-01T06:00:00.000Z',
            occurredAt: '2026-09-01T06:00:00.000Z',
            supplierId: `s${i % 12}`,
            actorId: 'u1',
            reversesId: null,
            reference: null,
          },
          {
            id: `sale-${p.id}`,
            productId: p.id,
            type: 'OUT',
            reason: 'SALE',
            quantity: -2,
            unitCost: 15000,
            unitPrice: i === 119 ? 0 : i % 3 === 0 ? 10000 : 25000,
            createdAt: '2026-09-02T06:00:00.000Z',
            occurredAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T17:59:00.000Z`,
            supplierId: null,
            actorId: 'u1',
            reversesId: null,
            reference: null,
          },
        ] as StockMovement[],
    );
  movements.push({
    ...movements[2]!,
    id: 'correction',
    type: 'ADJUST',
    reason: 'CORRECTION',
    quantity: 2,
    reversesId: movements[2]!.id,
    createdAt: '2026-09-04T06:00:00.000Z',
    occurredAt: '2026-09-04T06:00:00.000Z',
  });
  movements.push({
    ...movements[2]!,
    id: 'damage',
    reason: 'DAMAGE',
    quantity: -1,
    unitPrice: null,
    createdAt: '2026-09-04T06:00:00.000Z',
  });
  movements.push({
    ...movements[2]!,
    id: 'loss',
    reason: 'LOSS',
    quantity: -1,
    unitPrice: null,
    createdAt: '2026-09-04T06:00:00.000Z',
  });
  const units = [
    {
      id: 'serial',
      productId: 'p120',
      status: 'IN_STOCK',
      costPrice: 90000,
      receivedAt: '2026-06-10T06:00:00.000Z',
    } as ProductUnit,
  ];
  return {
    products,
    movements,
    units,
    productById: new Map(products.map((p) => [p.id, p])),
    categoryNames: new Map(Array.from({ length: 12 }, (_, i) => [`c${i}`, `Category ${i}`])),
    brandNames: new Map(Array.from({ length: 11 }, (_, i) => [`b${i}`, `Brand ${i}`])),
    supplierNames: new Map(Array.from({ length: 12 }, (_, i) => [`s${i}`, `Supplier ${i}`])),
    actorNames: new Map([['u1', 'ব্যবস্থাপক']]),
  };
}
export function reportStore(ctx: ReportContext): Record<string, unknown[]> {
  return {
    products: ctx.products,
    'stock-movements': ctx.movements,
    'product-units': ctx.units,
    categories: [...ctx.categoryNames].map(([id, name]) => ({ id, name }) as Category),
    brands: [...ctx.brandNames].map(([id, name]) => ({ id, name }) as Brand),
    suppliers: [...ctx.supplierNames].map(([id, name]) => ({ id, name }) as Supplier),
    users: [...ctx.actorNames].map(([id, name]) => ({ id, name }) as User),
  };
}
