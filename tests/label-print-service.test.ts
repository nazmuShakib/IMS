import { beforeEach, describe, expect, it, vi } from 'vitest';
import { labelBarcodeFit, labelCopiesSchema, labelPrintSchema } from '@/lib/label-print';
import { prepareLabelJob, resolveLabelIdentifier } from '@/services/labels';
import type { Repositories } from '@/repositories';
import type { Product, ProductUnit } from '@/domain/types';
let products: Product[];
let units: ProductUnit[];
let db: Repositories;
const request = { productId: 'phone', unitIds: ['one'], copies: 2, layout: 'thermal' as const };
beforeEach(() => {
  products = [{ id: 'phone', name: 'Phone', sku: 'PHONE', barcode: null, trackingType: 'SERIAL', quantityOnHand: 1 }, { id: 'bulk', name: 'Cable', sku: 'CABLE', barcode: '12345678', trackingType: 'QUANTITY', quantityOnHand: 2 }] as Product[];
  units = [{ id: 'one', productId: 'phone', serialNo: '352386045293914', status: 'IN_STOCK', receivedAt: '2026-09-01T00:00:00Z' }] as ProductUnit[];
  db = { products: {
    findById: vi.fn(async id => products.find(product => product.id === id) ?? null),
    findByBarcode: vi.fn(async code => products.find(product => product.barcode === code) ?? null),
    findBySku: vi.fn(async code => products.find(product => product.sku === code) ?? null),
  }, units: {
    findBySerial: vi.fn(async serial => units.find(unit => unit.serialNo === serial) ?? null),
    findByProduct: vi.fn(async id => units.filter(unit => unit.productId === id)),
    transitionStatus: vi.fn(), createMany: vi.fn(),
  }, movements: { record: vi.fn() } } as unknown as Repositories;
});

describe('label request validation and barcode fit', () => {
  it.each(['', '0', '-1', '1.5', '501', '1e2', '12abc', 'Infinity'])('rejects invalid copies %s', value => expect(labelCopiesSchema.safeParse(value).success).toBe(false));
  it.each(['1', '500', ' 12 '])('accepts whole copies %s', value => expect(labelCopiesSchema.parse(value)).toBe(Number(value)));
  it('validates the shared action request', () => {
    expect(labelPrintSchema.parse({ ...request, copies: '2' })).toEqual(request);
    expect(labelPrintSchema.safeParse({ ...request, copies: '2', layout: 'anything' }).success).toBe(false);
  });
  it('preserves two-dot IMEIs, warns on narrow barcodes, and rejects overflow', () => {
    expect(labelBarcodeFit('352386045293914')).toMatchObject({ moduleDots: 2 });
    expect(labelBarcodeFit('ANK-NANO-45W')).toMatchObject({ moduleDots: 1, warning: 'labels.narrowBarcode' });
    expect(labelBarcodeFit('ABCDEFGHIJKLMNOPQRSTUVWXYZ123456').error).toBe('labels.barcodeTooWide');
    expect(labelBarcodeFit('পণ্য').error).toBe('labels.barcodeInvalid');
  });
});

describe('label preparation', () => {
  it('captures immutable text and identifiers without changing stock', async () => {
    const result = await prepareLabelJob(request, 'STAFF', db);
    expect(result.job).toMatchObject({ labelCount: 2, copies: 2, units: [{ serialNo: '352386045293914' }] });
    products[0].name = 'Edited later'; units[0].serialNo = 'CHANGED';
    expect(result.job?.product.name).toBe('Phone'); expect(result.job?.units[0].serialNo).toBe('352386045293914');
    expect(db.units.transitionStatus).not.toHaveBeenCalled(); expect(db.movements.record).not.toHaveBeenCalled(); expect(db.units.createMany).not.toHaveBeenCalled();
  });
  it.each(['SOLD', 'VOID', 'RMA'])('rejects STAFF %s units while allowing manager reprints', async status => {
    units[0].status = status as ProductUnit['status'];
    expect((await prepareLabelJob(request, 'STAFF', db)).fieldErrors?.unitIds).toBe('labels.stockRequired');
    expect((await prepareLabelJob(request, 'MANAGER', db)).job?.labelCount).toBe(2);
  });
  it('checks membership, empty selection and the multiplied limit', async () => {
    expect((await prepareLabelJob({ ...request, productId: 'missing' }, 'ADMIN', db)).job).toBeUndefined();
    expect((await prepareLabelJob({ ...request, unitIds: ['foreign'] }, 'ADMIN', db)).fieldErrors?.unitIds).toBe('labels.invalidUnits');
    expect((await prepareLabelJob({ ...request, unitIds: [] }, 'ADMIN', db)).fieldErrors?.unitIds).toBe('labels.selectRequired');
    units.push({ ...units[0], id: 'two', serialNo: '352386045293915' });
    expect((await prepareLabelJob({ ...request, unitIds: ['one', 'two'], copies: 251 }, 'ADMIN', db)).fieldErrors?.copies).toBe('labels.maxError');
    expect((await prepareLabelJob({ ...request, unitIds: ['one', 'one'], copies: 500 }, 'ADMIN', db)).job?.labelCount).toBe(500);
  });
  it('checks missing barcodes, stock and overflow on quantity products', async () => {
    const bulk = { ...request, productId: 'bulk', unitIds: [] };
    products[1].quantityOnHand = 0;
    expect((await prepareLabelJob(bulk, 'STAFF', db)).fieldErrors?.productId).toBe('labels.stockRequired');
    expect((await prepareLabelJob(bulk, 'ADMIN', db)).job?.labelCount).toBe(2);
    products[1].barcode = null;
    expect((await prepareLabelJob(bulk, 'ADMIN', db)).fieldErrors?.productId).toBe('labels.productBarcodeRequired');
    products[1].barcode = 'A'.repeat(32);
    expect((await prepareLabelJob(bulk, 'ADMIN', db)).fieldErrors?.productId).toBe('labels.barcodeTooWide');
    units[0].serialNo = 'A'.repeat(32);
    expect((await prepareLabelJob(request, 'ADMIN', db)).fieldErrors?.unitIds).toBe('labels.barcodeTooWide');
  });
});

describe('exact label scan resolution', () => {
  it('prefers an exact serial over a colliding product barcode and SKU', async () => {
    products[1].barcode = units[0].serialNo; products[1].sku = units[0].serialNo;
    expect(await resolveLabelIdentifier(units[0].serialNo, 'ADMIN', db)).toMatchObject({ productId: 'phone', unit: { id: 'one' } });
    expect(db.products.findByBarcode).not.toHaveBeenCalled();
  });
  it('prefers barcode over SKU, never treats fuzzy names as scans, and accepts 120-character serials', async () => {
    products[0].sku = '12345678';
    expect((await resolveLabelIdentifier('12345678', 'ADMIN', db)).productId).toBe('bulk');
    expect((await resolveLabelIdentifier('Phon', 'ADMIN', db)).error).toBe('labels.scanNotFound');
    units[0].serialNo = 'A'.repeat(120);
    expect((await resolveLabelIdentifier(units[0].serialNo, 'ADMIN', db)).unit?.id).toBe('one');
    expect((await resolveLabelIdentifier('A'.repeat(121), 'ADMIN', db)).error).toBe('labels.invalidScan');
  });
  it('rejects an unauthorized unit without falling through to a colliding product', async () => {
    units[0].status = 'SOLD'; products[1].barcode = units[0].serialNo;
    expect((await resolveLabelIdentifier(units[0].serialNo, 'STAFF', db)).error).toBe('labels.stockRequired');
    expect(db.products.findByBarcode).not.toHaveBeenCalled();
  });
});
