import { describe, expect, it } from 'vitest';
import { valuationFromRows, type ValuationData } from '@/lib/valuation-consistency';
type Movement = ValuationData['movements'][number];
const movement = (id: number, patch: Partial<Movement> = {}): Movement => ({ id: `m${id}`, productId: 'p', unitId: null, reason: 'PURCHASE', quantity: 10, unitCost: 10000, reversesId: null, createdAt: `2026-09-${String(id).padStart(2, '0')}T00:00:00.000Z`, idempotencyKey: `key-${id}`, ...patch });
const bulk = (movements: Movement[] = [movement(1), movement(2, { unitCost: 20000 })]): ValuationData => ({ products: [{ id: 'p', name: 'Glass', sku: 'GLASS', trackingType: 'QUANTITY', quantityOnHand: 20, avgCostPrice: 15000 }], units: [], movements, expenses: [], acquisitions: [] });
const serial = (): ValuationData => ({ products: [{ id: 'p', name: 'Phone', sku: 'PHONE', trackingType: 'SERIAL', quantityOnHand: 999, avgCostPrice: 999 }], units: [{ id: 'u', productId: 'p', serialNo: 'SERIAL-1', status: 'IN_STOCK', costPrice: 10000 }], movements: [movement(1, { unitId: 'u', quantity: 1 })], expenses: [], acquisitions: [] });
describe('independent valuation replay', () => {
  it('matches weighted receipt costs and catches a wrong cached average despite matching quantity', () => {
    const data = bulk(); expect(valuationFromRows(data)).toMatchObject({ unitsInStock: 20, recordedValue: 300000, expectedValue: 300000, difference: 0, rows: [] });
    data.products[0]!.avgCostPrice = 17000;
    expect(valuationFromRows(data)).toMatchObject({ recordedValue: 340000, expectedValue: 300000, difference: 40000, productsWithDifferences: 1 });
  });
  it('uses integer-paisa weighted rounding and preserves the cost of remaining units after sales', () => {
    const data = bulk([movement(1, { quantity: 2, unitCost: 101 }), movement(2, { quantity: 1, unitCost: 102 }), movement(3, { reason: 'SALE', quantity: -1, unitCost: 101 })]);
    data.products[0]!.quantityOnHand = 2; data.products[0]!.avgCostPrice = 101;
    expect(valuationFromRows(data)).toMatchObject({ expectedValue: 202, difference: 0 });
  });
  it('excludes reversed originals and corrections and reconstructs the remaining receipt basis', () => {
    const data = bulk([movement(1), movement(2, { unitCost: 20000 }), movement(3, { reason: 'CORRECTION', quantity: -10, reversesId: 'm1' })]);
    data.products[0]!.quantityOnHand = 10; data.products[0]!.avgCostPrice = 20000;
    expect(valuationFromRows(data)).toMatchObject({ expectedValue: 200000, difference: 0 });
  });
  it('handles a stockout followed by a new cost basis and ignores stale averages on zero stock', () => {
    const data = bulk([movement(1), movement(2, { reason: 'SALE', quantity: -10 }), movement(3, { quantity: 2, unitCost: 123 })]);
    data.products[0]!.quantityOnHand = 2; data.products[0]!.avgCostPrice = 123;
    expect(valuationFromRows(data).expectedValue).toBe(246);
    data.movements.pop(); data.products[0]!.quantityOnHand = 0;
    expect(valuationFromRows(data)).toMatchObject({ recordedValue: 0, expectedValue: 0, difference: 0 });
  });
  it('does not turn incomplete or inconsistent history into a matching zero total', () => {
    for (const movements of [[], [movement(1, { reason: 'SALE', quantity: -1 })], [movement(1, { reason: 'CORRECTION', reversesId: 'missing' })]]) {
      expect(valuationFromRows(bulk(movements))).toMatchObject({ expectedValue: null, difference: null, productsMatching: 0, productsUnverified: 1 });
    }
  });
  it('flags historical outbound cost mismatches instead of silently recosting sales', () => {
    const data = bulk([movement(1), movement(2, { reason: 'SALE', quantity: -1, unitCost: 9999 })]);
    expect(valuationFromRows(data).rows[0]?.issue).toBe('valuation.historyCost');
  });
  it('independently values serial receipts and refurbishment, including returned units', () => {
    const data = serial(); data.expenses.push({ id: 'expense', unitId: 'u', amount: 500, createdAt: '2026-09-02T00:00:00.000Z' });
    data.units[0]!.costPrice = 10500;
    data.movements.push(movement(3, { unitId: 'u', reason: 'SALE', quantity: -1, unitCost: 10500 }), movement(4, { unitId: 'u', reason: 'CUSTOMER_RETURN', quantity: 1, unitCost: 10500 }));
    expect(valuationFromRows(data)).toMatchObject({ unitsInStock: 1, recordedValue: 10500, expectedValue: 10500, rows: [] });
    data.units[0]!.costPrice = 11000; expect(valuationFromRows(data).difference).toBe(500);
  });
  it('checks acquisition values and does not double count them as receipt costs', () => {
    const data = serial(); data.acquisitions.push({ unitId: 'u', idempotencyKey: 'key-1', acquisitionValue: 10000 });
    expect(valuationFromRows(data).expectedValue).toBe(10000);
    data.acquisitions[0]!.acquisitionValue = 5000; expect(valuationFromRows(data).rows[0]?.issue).toBe('valuation.acquisitionMismatch');
  });
  it('catches per-unit errors even when product and overall totals cancel out', () => {
    const data = serial(); data.units[0]!.costPrice = 9000;
    data.units.push({ ...data.units[0]!, id: 'u2', serialNo: 'SERIAL-2', costPrice: 11000 });
    data.movements.push(movement(2, { unitId: 'u2', quantity: 1 }));
    const result = valuationFromRows(data);
    expect(result).toMatchObject({ expectedValue: 20000, recordedValue: 20000, difference: 0, productsWithDifferences: 1 });
    expect(result.rows[0]?.units.map(unit => unit.difference)).toEqual([-1000, 1000]);
  });
  it('does not count sold units or old refurbishment costs after a voided receipt is replaced', () => {
    const data = serial(); data.units[0]!.status = 'SOLD'; data.movements.push(movement(2, { unitId: 'u', reason: 'SALE', quantity: -1 }));
    expect(valuationFromRows(data)).toMatchObject({ unitsInStock: 0, expectedValue: 0, recordedValue: 0 });
    data.units[0]!.status = 'IN_STOCK'; data.units[0]!.costPrice = 20000;
    data.movements = [movement(1, { unitId: 'u', quantity: 1 }), movement(3, { unitId: 'u', reason: 'CORRECTION', quantity: -1, reversesId: 'm1' }), movement(4, { unitId: 'u', quantity: 1, unitCost: 20000 })];
    data.expenses = [{ id: 'old', unitId: 'u', amount: 500, createdAt: '2026-09-02T00:00:00.000Z' }];
    expect(valuationFromRows(data)).toMatchObject({ expectedValue: 20000, difference: 0 });
  });
  it('reports missing serialized receipt history and mismatched unit ownership', () => {
    const data = serial(); data.movements = []; expect(valuationFromRows(data).expectedValue).toBeNull();
    data.movements = [movement(1, { unitId: 'other', quantity: 1 })]; expect(valuationFromRows(data).expectedValue).toBeNull();
  });
  it('returns an empty, exact report for no products', () => {
    expect(valuationFromRows({ products: [], units: [], movements: [], expenses: [], acquisitions: [] })).toMatchObject({ productsChecked: 0, unitsInStock: 0, recordedValue: 0, expectedValue: 0, difference: 0 });
  });
});
