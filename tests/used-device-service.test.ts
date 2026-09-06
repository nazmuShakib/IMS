import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductUnit, TradeInCartDraft, UsedDeviceAcquisition, StockMovement } from '@/domain/types';
import type { Repositories } from '@/repositories';
import { usedDeviceInspectionGroups } from '@/lib/used-device-inspection';
const mock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('@/repositories', () => ({ db: { transaction: mock.transaction } }));
import { acceptUsedDevice, assertUsedDeviceEligible } from '@/services/used-devices';
import { saveTradeInDraft, checkoutCart } from '@/services/checkout';
import type { AcceptUsedDeviceInput } from '@/schemas';
const productId = '11111111-1111-4111-8111-111111111111';
const cartId = '22222222-2222-4222-8222-222222222222';
const appearance = { screen: 'LIGHT_SCRATCHES' as const, frame: null, back: null, note: 'Near edge' };
const input: AcceptUsedDeviceInput = {
  productId, serialNo: 'USED-1', grade: 'GRADE_A', batteryHealth: null,
  inspectionResults: Object.fromEntries(usedDeviceInspectionGroups.flatMap(group => group.items.map(([key]) => [key, 'WORKING']))) as AcceptUsedDeviceInput['inspectionResults'],
  cosmeticCondition: appearance, askingPrice: 2500000, acquisitionType: 'DIRECT_PURCHASE',
  acquisitionValue: 2000000, sellerName: 'Seller', sellerPhone: '01712345678', ownershipConfirmed: true,
  actorId: 'actor', idempotencyKey: 'used-device-key',
};
let units: ProductUnit[];
let acquisitions: UsedDeviceAcquisition[];
let movements: StockMovement[];
let draft: TradeInCartDraft | null;
let history: { warranties: object[]; expenses: object[]; invoice: string | null };
let tx: Repositories;
beforeEach(() => {
  units = []; acquisitions = []; movements = []; draft = null;
  history = { warranties: [], expenses: [], invoice: null };
  tx = {
    products: { findById: async () => ({ id: productId, isActive: true, trackingType: 'SERIAL', name: 'Phone', sku: 'PHONE', defaultSalePrice: 3000000, staffMaxDiscount: 0 }) },
    units: {
      findBySerial: async (serial: string) => units.find(unit => unit.serialNo === serial) ?? null,
      findById: async (id: string) => units.find(unit => unit.id === id) ?? null,
      createMany: async (values: ProductUnit[]) => { units.push(...structuredClone(values)); },
      transitionStatus: async (id: string, _status: string, status: string, patch: Partial<ProductUnit>) => { const unit = units.find(unit => unit.id === id)!; Object.assign(unit, patch, { status }); return structuredClone(unit); },
    },
    warranties: { findAll: async () => history.warranties },
    refurbishmentExpenses: { findByUnit: async () => history.expenses },
    usedDeviceAcquisitions: {
      findByUnit: async () => history.invoice ? { tradeInSaleId: history.invoice } : null,
      findByIdempotencyKey: async (key: string) => acquisitions.find(value => value.idempotencyKey === key) ?? null,
      create: async (value: UsedDeviceAcquisition) => { acquisitions.push(structuredClone(value)); return value; },
      attachToSale: async (id: string, saleId: string) => { acquisitions.find(value => value.id === id)!.tradeInSaleId = saleId; },
    },
    movements: {
      record: async (value: StockMovement) => { movements.push(structuredClone(value)); return value; },
      findByIdempotencyKey: async (key: string) => movements.find(value => value.idempotencyKey === key) ?? null,
    },
    carts: {
      findById: async () => ({ id: cartId, actorId: 'actor', tradeInDraft: draft }),
      findByIdForUpdate: async () => ({ id: cartId, actorId: 'actor', tradeInDraft: draft }),
      update: async (_id: string, patch: { tradeInDraft: TradeInCartDraft }) => { draft = structuredClone(patch.tradeInDraft); return { id: cartId, actorId: 'actor', tradeInDraft: draft }; },
      delete: async () => { draft = null; },
    },
  } as unknown as Repositories;
  mock.transaction.mockReset().mockImplementation(async fn => fn(tx));
});
describe('used-phone service behavior', () => {
  it('saves appearance provisionally without creating stock, then receives exactly once', async () => {
    await saveTradeInDraft({ ...input, cartId });
    expect(draft?.cosmeticCondition).toEqual(appearance); expect(units).toHaveLength(0); expect(movements).toHaveLength(0); expect(acquisitions).toHaveLength(0);
    const accepted = await acceptUsedDevice(input); await acceptUsedDevice(input);
    expect(units).toHaveLength(1); expect(movements).toHaveLength(1); expect(acquisitions).toHaveLength(1);
    expect(accepted.unit.cosmeticCondition).toEqual(appearance);
  });
  it.each(['warranties', 'expenses', 'invoice'] as const)('rejects voided units with %s history both when drafting and receiving', async kind => {
    units.push({ id: 'unit', serialNo: input.serialNo, productId, status: 'VOID' } as ProductUnit);
    if (kind === 'invoice') history.invoice = 'sale'; else history[kind] = [{}];
    await expect(saveTradeInDraft({ ...input, cartId })).rejects.toMatchObject({ field: 'serialNo' });
    await expect(acceptUsedDevice(input)).rejects.toMatchObject({ field: 'serialNo' });
    expect(units[0].status).toBe('VOID'); expect(draft).toBeNull(); expect(acquisitions).toHaveLength(0);
  });
  it('revives a safely voided unit and replaces its appearance', async () => {
    units.push({ id: 'unit', serialNo: input.serialNo, productId, status: 'VOID', cosmeticCondition: { ...appearance, screen: 'HEAVY_WEAR' } } as ProductUnit);
    await saveTradeInDraft({ ...input, cartId }); const result = await acceptUsedDevice(input);
    expect(result.unit.id).toBe('unit'); expect(units).toHaveLength(1); expect(result.unit.cosmeticCondition).toEqual(appearance);
  });
  it('rejects another product’s serial and inactive products', async () => {
    units.push({ id: 'unit', serialNo: input.serialNo, productId: 'other', status: 'VOID' } as ProductUnit);
    await expect(assertUsedDeviceEligible(tx, productId, input.serialNo)).rejects.toMatchObject({ field: 'serialNo' });
    tx.products.findById = async () => null;
    await expect(assertUsedDeviceEligible(tx, productId, 'new')).rejects.toMatchObject({ field: 'productId' });
  });
  it('snapshots appearance for both the incoming trade-in and outgoing resale', async () => {
    const received = await acceptUsedDevice(input);
    await saveTradeInDraft({ ...input, serialNo: 'INCOMING-2', cartId });
    let savedSale: Record<string, unknown> | null = null;
    const items: Record<string, unknown>[] = [];
    Object.assign(tx, {
      sales: { findByIdempotencyKey: async () => null, nextInvoiceNumber: async () => 'INV-1', create: async (sale: Record<string, unknown>) => { savedSale = structuredClone(sale); return sale; }, createItem: async (item: Record<string, unknown>) => { items.push(structuredClone(item)); } },
      auditLogs: { create: async () => ({}) },
    });
    const repository = { transaction: async (fn: (tx: Repositories) => unknown) => fn(tx) } as Repositories;
    await checkoutCart({ cartId, actorId: 'actor', actorName: 'Manager', actorRole: 'MANAGER', idempotencyKey: 'checkout-key',
      lines: [{ clientId: 'line', productId, unitId: received.unit.id, quantity: 1, actualUnitPrice: 3000000 }],
      customerId: null, paymentMethod: 'CASH', tradeInPayoutMethod: 'CASH', paymentStatus: 'PAID', reference: null, note: null,
      isEmi: false, emiTermMonths: null, emiDownPayment: 0, emiFirstDueDate: null, identificationType: null, identificationNumber: null, auditIp: null,
    }, repository);
    expect(items[0].cosmeticCondition).toEqual(appearance);
    expect(savedSale).toMatchObject({ tradeInDetails: { cosmeticCondition: appearance }, tradeInCredit: 2000000 });
    units[0].cosmeticCondition = { ...appearance, screen: 'DAMAGED' };
    expect(items[0].cosmeticCondition).toEqual(appearance);
    expect(draft).toBeNull(); expect(acquisitions[1].tradeInSaleId).toBeTruthy();
  });
});
