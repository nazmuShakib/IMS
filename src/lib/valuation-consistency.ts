import type { Product, ProductUnit, StockMovement, RefurbishmentExpense, UsedDeviceAcquisition } from '@/domain/types';
import { weightedAvgCost } from '@/lib/money';
import { movementOrder } from '@/lib/movement-correction';

export type ValuationIssue = 'valuation.historyMissing' | 'valuation.historyInvalid' | 'valuation.historyCost' | 'valuation.acquisitionMismatch';
type Movement = Pick<StockMovement, 'id' | 'productId' | 'unitId' | 'reason' | 'quantity' | 'unitCost' | 'reversesId' | 'createdAt' | 'idempotencyKey'>;
export interface ValuationData {
  products: Pick<Product, 'id' | 'name' | 'sku' | 'trackingType' | 'quantityOnHand' | 'avgCostPrice'>[];
  units: Pick<ProductUnit, 'id' | 'productId' | 'serialNo' | 'status' | 'costPrice'>[];
  movements: Movement[];
  expenses: Pick<RefurbishmentExpense, 'id' | 'unitId' | 'amount' | 'createdAt'>[];
  acquisitions: Pick<UsedDeviceAcquisition, 'unitId' | 'idempotencyKey' | 'acquisitionValue'>[];
}
export interface UnitValueDifference { unitId: string; serial: string; recordedValue: number; expectedValue: number; difference: number }
export interface ValuationDifference {
  productId: string; name: string; sku: string; trackingType: Product['trackingType'];
  recordedValue: number; expectedValue: number | null; difference: number | null; issue: ValuationIssue | null;
  units: UnitValueDifference[];
}
export interface ValuationReport {
  unitsInStock: number; productsChecked: number; productsMatching: number; productsWithDifferences: number; productsUnverified: number;
  recordedValue: number; expectedValue: number | null; difference: number | null; rows: ValuationDifference[];
}
const safe = (value: number) => { if (!Number.isSafeInteger(value)) throw Error('Unsupported valuation amount'); return value; };
const nonnegative = (value: number) => { if (safe(value) < 0) throw Error('Invalid valuation amount'); return value; };
function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const list = result.get(id) ?? []; list.push(row); result.set(id, list); }
  return result;
}
function effectiveHistory(rows: Movement[]) {
  const byId = new Map(rows.map(row => [row.id, row])), cancelled = new Set<string>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.quantity) || row.quantity === 0 || !Number.isSafeInteger(row.unitCost) || row.unitCost < 0 || !Number.isFinite(Date.parse(row.createdAt))) throw 'valuation.historyInvalid';
    if (row.reason !== 'CORRECTION' && row.reversesId) throw 'valuation.historyInvalid';
    if (row.reason === 'CORRECTION') {
      const original = row.reversesId ? byId.get(row.reversesId) : null;
      if (!original || original.reason === 'CORRECTION' || original.unitId !== row.unitId || original.unitCost !== row.unitCost || original.quantity !== -row.quantity || cancelled.has(original.id)) throw 'valuation.historyInvalid';
      cancelled.add(original.id);
    }
  }
  return rows.filter(row => row.reason !== 'CORRECTION' && !cancelled.has(row.id)).sort(movementOrder);
}

/** Independent replay: never reads stored average cost or unit cost to derive
 * expected value. An incomplete history is unverified, never silently zero. */
export function valuationFromRows(data: ValuationData): ValuationReport {
  const histories = group(data.movements, row => row.productId), unitsByProduct = group(data.units, row => row.productId);
  const expensesByUnit = group(data.expenses, row => row.unitId);
  const acquisitionsByKey = new Map(data.acquisitions.map(row => [row.idempotencyKey, row]));
  let recordedValue = 0, expectedTotal = 0, unitsInStock = 0, productsWithDifferences = 0, productsUnverified = 0;
  const rows: ValuationDifference[] = [];
  for (const product of data.products) {
    const units = unitsByProduct.get(product.id) ?? [];
    const recordedQuantity = product.trackingType === 'SERIAL' ? units.filter(unit => unit.status === 'IN_STOCK').length : safe(product.quantityOnHand);
    unitsInStock = safe(unitsInStock + recordedQuantity);
    const recorded = product.trackingType === 'SERIAL'
      ? units.filter(unit => unit.status === 'IN_STOCK').reduce((sum, unit) => safe(sum + nonnegative(unit.costPrice)), 0)
      : safe(recordedQuantity * nonnegative(product.avgCostPrice));
    recordedValue = safe(recordedValue + recorded);
    let expected: number | null = 0, issue: ValuationIssue | null = null;
    const unitDifferences: UnitValueDifference[] = [];
    try {
      const history = effectiveHistory(histories.get(product.id) ?? []);
      if (product.trackingType === 'QUANTITY') {
        let quantity = 0, average = 0;
        if (!history.length && recordedQuantity !== 0) throw 'valuation.historyMissing';
        for (const row of history) {
          if (row.unitId) throw 'valuation.historyInvalid';
          if (row.quantity > 0) {
            safe(quantity * average + row.quantity * row.unitCost);
            average = weightedAvgCost(quantity, average, row.quantity, row.unitCost);
          } else if (row.unitCost !== average) throw 'valuation.historyCost';
          quantity = safe(quantity + row.quantity);
          if (quantity < 0) throw 'valuation.historyInvalid';
        }
        expected = safe(quantity * average);
      } else {
        const unitMap = new Map(units.map(unit => [unit.id, unit]));
        if (history.some(row => !row.unitId || !unitMap.has(row.unitId) || Math.abs(row.quantity) !== 1)) throw 'valuation.historyInvalid';
        const byUnit = group(history, row => row.unitId!);
        for (const unit of units) {
          const movements = byUnit.get(unit.id) ?? [];
          let quantity = 0, base: Movement | null = null, baseCost = 0;
          const expenses = expensesByUnit.get(unit.id) ?? [];
          if (expenses.some(expense => !Number.isSafeInteger(expense.amount) || expense.amount < 0 || !Number.isFinite(Date.parse(expense.createdAt)))) throw 'valuation.historyInvalid';
          const costAt = (at?: Movement) => expenses.filter(expense => base && movementOrder(expense, base) >= 0 && (!at || movementOrder(expense, at) <= 0))
            .reduce((sum, expense) => safe(sum + nonnegative(expense.amount)), baseCost);
          for (const row of movements) {
            if (row.quantity > 0 && !base) {
              if (row.reason === 'CUSTOMER_RETURN') throw 'valuation.historyMissing';
              base = row; baseCost = row.unitCost;
              const acquisition = row.idempotencyKey ? acquisitionsByKey.get(row.idempotencyKey) : null;
              if (row.reason === 'TRADE_IN' && !acquisition) throw 'valuation.historyMissing';
              if (acquisition && (acquisition.unitId !== unit.id || acquisition.acquisitionValue !== row.unitCost)) throw 'valuation.acquisitionMismatch';
            } else if (row.unitCost !== costAt(row)) throw 'valuation.historyCost';
            quantity += row.quantity;
            if (quantity < 0 || quantity > 1) throw 'valuation.historyInvalid';
          }
          if (!base && unit.status === 'IN_STOCK') throw 'valuation.historyMissing';
          const unitExpected = quantity ? costAt() : 0, unitRecorded = unit.status === 'IN_STOCK' ? nonnegative(unit.costPrice) : 0;
          expected = safe(expected + unitExpected);
          if (unitRecorded !== unitExpected) unitDifferences.push({ unitId: unit.id, serial: unit.serialNo, recordedValue: unitRecorded, expectedValue: unitExpected, difference: safe(unitRecorded - unitExpected) });
        }
      }
    } catch (error) {
      issue = typeof error === 'string' && error.startsWith('valuation.') ? error as ValuationIssue : 'valuation.historyInvalid';
      expected = null; unitDifferences.length = 0;
    }
    if (expected === null) productsUnverified++;
    else {
      expectedTotal = safe(expectedTotal + expected);
      if (recorded !== expected || unitDifferences.length) productsWithDifferences++;
    }
    if (expected === null || recorded !== expected || unitDifferences.length) rows.push({ productId: product.id, name: product.name, sku: product.sku, trackingType: product.trackingType, recordedValue: recorded, expectedValue: expected, difference: expected === null ? null : safe(recorded - expected), issue, units: unitDifferences });
  }
  return {
    unitsInStock, productsChecked: data.products.length, productsMatching: data.products.length - productsWithDifferences - productsUnverified,
    productsWithDifferences, productsUnverified, recordedValue, expectedValue: productsUnverified ? null : expectedTotal,
    difference: productsUnverified ? null : safe(recordedValue - expectedTotal), rows: rows.sort((a, b) => a.sku.localeCompare(b.sku) || a.productId.localeCompare(b.productId)),
  };
}
