import { movementOccurredAt } from '@/lib/sale-timing';
import type { Product, ProductUnit, StockMovement, MovementReason } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import type { ReportFilters, ReportResult, ReportColumn, ReportRow } from './report-query';
const DAY = 86_400_000;
const startBoundary = (value?: string) =>
  value ? new Date(`${value}T00:00:00+06:00`) : new Date(-8640000000000000);
const endBoundary = (value: string | undefined, _now: Date) =>
  value ? new Date(`${value}T23:59:59.999+06:00`) : new Date(8640000000000000);
function dhakaKey(iso: string, month = false): string {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: month ? undefined : '2-digit',
  }).format(new Date(iso));
  return value;
}

function economicReason(movement: StockMovement, byId: Map<string, StockMovement>): MovementReason {
  if (movement.reason !== 'CORRECTION' || !movement.reversesId) return movement.reason;
  return byId.get(movement.reversesId)?.reason ?? movement.reason;
}

function compareNumericRows(a: ReportRow, b: ReportRow, key: string, direction: number): number {
  const av = a.cells[key],
    bv = b.cells[key];
  if (av == null && bv != null) return 1;
  if (bv == null && av != null) return -1;
  return direction * (Number(av ?? 0) - Number(bv ?? 0)) || a.id.localeCompare(b.id);
}

function sum(rows: ReportRow[], key: string): number {
  return rows.reduce(
    (total, row) => total + (typeof row.cells[key] === 'number' ? row.cells[key] : 0),
    0,
  );
}

export interface ReportContext {
  products: Product[];
  units: ProductUnit[];
  movements: StockMovement[];
  productById: Map<string, Product>;
  categoryNames: Map<string, string>;
  brandNames: Map<string, string>;
  supplierNames: Map<string, string>;
  actorNames: Map<string, string>;
}

function allowedProduct(product: Product | undefined, filters: ReportFilters): product is Product {
  return (
    Boolean(product) &&
    (!filters.productId || product!.id === filters.productId) &&
    (!filters.categoryId || product!.categoryId === filters.categoryId) &&
    (!filters.brandId || product!.brandId === filters.brandId)
  );
}

function inPeriod(
  movement: StockMovement,
  filters: ReportFilters,
  now: Date,
  businessTime = false,
): boolean {
  const when = new Date(businessTime ? movementOccurredAt(movement) : movement.createdAt).getTime();
  return (
    when >= startBoundary(filters.from).getTime() && when <= endBoundary(filters.to, now).getTime()
  );
}

const moneyCols = (keys: Array<[string, string]>): ReportColumn[] =>
  keys.map(([key, label]) => ({ key, label, type: 'money' }));

function valuation(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const groupBy = filters.groupBy === 'brand' ? 'brand' : 'category';
  const buckets = new Map<string, { label: string; units: number; value: Paisa }>();
  for (const product of ctx.products) {
    if (!allowedProduct(product, filters)) continue;
    const units =
      product.trackingType === 'SERIAL'
        ? ctx.units.filter((unit) => unit.productId === product.id && unit.status === 'IN_STOCK')
        : [];
    const quantity = product.trackingType === 'SERIAL' ? units.length : product.quantityOnHand;
    const value =
      product.trackingType === 'SERIAL'
        ? units.reduce((total, unit) => total + unit.costPrice, 0)
        : quantity * product.avgCostPrice;
    const key = groupBy === 'brand' ? (product.brandId ?? 'unbranded') : product.categoryId;
    const label =
      groupBy === 'brand'
        ? product.brandId
          ? ctx.brandNames.get(product.brandId)
          : '__report_unbranded'
        : ctx.categoryNames.get(product.categoryId);
    const bucket = buckets.get(key) ?? { label: label ?? '__report_unknown', units: 0, value: 0 };
    bucket.units += quantity;
    bucket.value += value;
    buckets.set(key, bucket);
  }
  const rows = [...buckets]
    .map(([id, item]) => ({
      id,
      cells: { group: item.label, quantity: item.units, value: item.value },
    }))
    .sort((a, b) => Number(b.cells.value) - Number(a.cells.value) || a.id.localeCompare(b.id));
  return {
    kind: 'valuation',
    title: 'Inventory valuation',
    description: `Current stock at cost, grouped by ${groupBy}.`,
    generatedAt: now.toISOString(),
    columns: [
      { key: 'group', label: groupBy === 'brand' ? 'Brand' : 'Category', type: 'text' },
      { key: 'quantity', label: 'Units', type: 'number' },
      ...moneyCols([['value', 'Value at cost']]),
    ],
    rows,
    totals: { quantity: sum(rows, 'quantity'), value: sum(rows, 'value') },
  };
}

function saleRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const groupBy = filters.groupBy ?? 'day';
  const buckets = new Map<
    string,
    { label: string; quantity: number; revenue: Paisa; cogs: Paisa }
  >();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (
      !inPeriod(movement, filters, now, true) ||
      !allowedProduct(product, filters) ||
      economicReason(movement, byId) !== 'SALE'
    )
      continue;
    let key: string;
    let label: string;
    if (groupBy === 'category') {
      key = product.categoryId;
      label = ctx.categoryNames.get(key) ?? '__report_unknown';
    } else if (groupBy === 'brand') {
      key = product.brandId ?? 'unbranded';
      label = product.brandId
        ? (ctx.brandNames.get(product.brandId) ?? '__report_unknown')
        : '__report_unbranded';
    } else {
      key = dhakaKey(movementOccurredAt(movement), groupBy === 'month');
      label = key;
    }
    const bucket = buckets.get(key) ?? { label, quantity: 0, revenue: 0, cogs: 0 };
    bucket.quantity += -movement.quantity;
    bucket.revenue += movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice;
    bucket.cogs += -movement.quantity * movement.unitCost;
    buckets.set(key, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.revenue !== 0 || item.cogs !== 0)
    .map(([id, item]) => ({
      id,
      cells: {
        group: item.label,
        quantity: item.quantity,
        revenue: item.revenue,
        cogs: item.cogs,
        profit: item.revenue - item.cogs,
        margin:
          item.revenue === 0
            ? null
            : Math.round(((item.revenue - item.cogs) / item.revenue) * 10_000) / 100,
      },
    }));
  const sortKey = filters.sort ?? 'revenue';
  const direction = filters.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => compareNumericRows(a, b, sortKey, direction));
  if (groupBy === 'day' || groupBy === 'month') rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    kind: 'sales',
    periodBounds:
      ['day', 'month'].includes(groupBy) && buckets.size
        ? { first: [...buckets.keys()].sort()[0]!, last: [...buckets.keys()].sort().at(-1)! }
        : undefined,
    title: 'Revenue, cost and sales profit',
    description: `Sales results grouped by ${groupBy}.`,
    generatedAt: now.toISOString(),
    columns: [
      {
        key: 'group',
        label: 'Period / group',
        type: groupBy === 'day' || groupBy === 'month' ? 'period' : 'text',
      },
      { key: 'quantity', label: 'Units sold', type: 'number' },
      ...moneyCols([
        ['revenue', 'Revenue'],
        ['cogs', 'Cost of sold items (COGS)'],
        ['profit', 'Sales profit'],
      ]),
      { key: 'margin', label: 'Profit margin %', type: 'percent' },
    ],
    rows,
    totals: {
      quantity: sum(rows, 'quantity'),
      revenue: sum(rows, 'revenue'),
      cogs: sum(rows, 'cogs'),
      profit: sum(rows, 'profit'),
    },
  };
}

function profitRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const base = saleRows(ctx, { ...filters, groupBy: 'day' }, now);
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<
    string,
    { product: Product; quantity: number; revenue: Paisa; cogs: Paisa }
  >();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (
      !inPeriod(movement, filters, now, true) ||
      !allowedProduct(product, filters) ||
      economicReason(movement, byId) !== 'SALE'
    )
      continue;
    const bucket = buckets.get(product.id) ?? { product, quantity: 0, revenue: 0, cogs: 0 };
    bucket.quantity += -movement.quantity;
    bucket.revenue += movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice;
    bucket.cogs += -movement.quantity * movement.unitCost;
    buckets.set(product.id, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.revenue !== 0 || item.cogs !== 0)
    .map(([id, item]) => ({
      id,
      cells: {
        product: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        revenue: item.revenue,
        cogs: item.cogs,
        profit: item.revenue - item.cogs,
        margin:
          item.revenue === 0
            ? null
            : Math.round(((item.revenue - item.cogs) / item.revenue) * 10_000) / 100,
      },
    }));
  const sortKey = filters.sort ?? 'profit';
  const direction = filters.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => compareNumericRows(a, b, sortKey, direction));
  return {
    ...base,
    kind: 'profit',
    periodBounds: undefined,
    title: 'Profit per product',
    description: 'Exact sale margin from snapshotted selling price and cost.',
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'sku', label: 'Product code (SKU)', type: 'text' },
      { key: 'quantity', label: 'Units sold', type: 'number' },
      ...moneyCols([
        ['revenue', 'Revenue'],
        ['cogs', 'Cost of sold items (COGS)'],
        ['profit', 'Sales profit'],
      ]),
      { key: 'margin', label: 'Profit margin %', type: 'percent' },
    ],
    rows,
    totals: {
      quantity: sum(rows, 'quantity'),
      revenue: sum(rows, 'revenue'),
      cogs: sum(rows, 'cogs'),
      profit: sum(rows, 'profit'),
    },
  };
}

function purchaseRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<string, { label: string; quantity: number; spend: Paisa }>();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    if (
      !inPeriod(movement, filters, now) ||
      !allowedProduct(product, filters) ||
      economicReason(movement, byId) !== 'PURCHASE' ||
      (filters.supplierId && movement.supplierId !== filters.supplierId)
    )
      continue;
    const key = movement.supplierId ?? 'unknown';
    const label = movement.supplierId
      ? (ctx.supplierNames.get(movement.supplierId) ?? '__report_unknownSupplier')
      : '__report_noSupplier';
    const bucket = buckets.get(key) ?? { label, quantity: 0, spend: 0 };
    bucket.quantity += movement.quantity;
    bucket.spend += movement.quantity * movement.unitCost;
    buckets.set(key, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.spend !== 0)
    .map(([id, item]) => ({
      id,
      cells: { supplier: item.label, quantity: item.quantity, spend: item.spend },
    }))
    .sort((a, b) => Number(b.cells.spend) - Number(a.cells.spend) || a.id.localeCompare(b.id));
  return {
    kind: 'purchases',
    title: 'Purchase receipts',
    description: 'Net purchase receipts by supplier; corrections cancel original spend.',
    generatedAt: now.toISOString(),
    columns: [
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'quantity', label: 'Units', type: 'number' },
      ...moneyCols([['spend', 'Spend']]),
    ],
    rows,
    totals: { quantity: sum(rows, 'quantity'), spend: sum(rows, 'spend') },
  };
}

function agingRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const values = new Map<string, { quantity: number; value: Paisa }>(
    ['0–30', '31–60', '61–90', '91+'].map((key) => [key, { quantity: 0, value: 0 }]),
  );
  const add = (receivedAt: string, quantity: number, cost: Paisa) => {
    const days = Math.max(0, Math.floor((now.getTime() - new Date(receivedAt).getTime()) / DAY));
    const key = days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '91+';
    const bucket = values.get(key)!;
    bucket.quantity += quantity;
    bucket.value += quantity * cost;
  };
  for (const unit of ctx.units) {
    const product = ctx.productById.get(unit.productId);
    if (unit.status === 'IN_STOCK' && allowedProduct(product, filters))
      add(unit.receivedAt, 1, unit.costPrice);
  }
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const reversedIds = new Set(
    ctx.movements.map((movement) => movement.reversesId).filter((id): id is string => Boolean(id)),
  );
  for (const product of ctx.products.filter(
    (item) => item.trackingType === 'QUANTITY' && allowedProduct(item, filters),
  )) {
    let remaining = product.quantityOnHand;
    const lots = ctx.movements
      .filter(
        (movement) =>
          movement.productId === product.id &&
          movement.quantity > 0 &&
          movement.reason !== 'CORRECTION' &&
          !reversedIds.has(movement.id) &&
          ['PURCHASE', 'TRADE_IN', 'INITIAL_STOCK', 'CUSTOMER_RETURN'].includes(
            economicReason(movement, byId),
          ),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    for (const lot of lots) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, lot.quantity);
      add(lot.createdAt, quantity, product.avgCostPrice);
      remaining -= quantity;
    }
    if (remaining > 0) add(product.createdAt, remaining, product.avgCostPrice);
  }
  const rows = [...values].map(([id, item]) => ({
    id,
    cells: { bucket: `${id} days`, quantity: item.quantity, value: item.value },
  }));
  return {
    kind: 'aging',
    title: 'Stock aging',
    description: 'Current inventory grouped by age since receipt.',
    generatedAt: now.toISOString(),
    columns: [
      { key: 'bucket', label: 'Age', type: 'text' },
      { key: 'quantity', label: 'Units', type: 'number' },
      ...moneyCols([['value', 'Value at cost']]),
    ],
    rows,
    totals: { quantity: sum(rows, 'quantity'), value: sum(rows, 'value') },
    note: 'Bulk/count-based stock uses oldest stock first (FIFO) for this report.',
  };
}

function shrinkageRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const byId = new Map(ctx.movements.map((movement) => [movement.id, movement]));
  const buckets = new Map<
    string,
    { product: Product; damage: Paisa; loss: Paisa; quantity: number }
  >();
  for (const movement of ctx.movements) {
    const product = ctx.productById.get(movement.productId);
    const reason = economicReason(movement, byId);
    if (
      !inPeriod(movement, filters, now) ||
      !allowedProduct(product, filters) ||
      !['DAMAGE', 'LOSS'].includes(reason)
    )
      continue;
    const bucket = buckets.get(product.id) ?? { product, damage: 0, loss: 0, quantity: 0 };
    const value = -movement.quantity * movement.unitCost;
    bucket.quantity += -movement.quantity;
    if (reason === 'DAMAGE') bucket.damage += value;
    else bucket.loss += value;
    buckets.set(product.id, bucket);
  }
  const rows = [...buckets]
    .filter(([, item]) => item.quantity !== 0 || item.damage !== 0 || item.loss !== 0)
    .map(([id, item]) => ({
      id,
      cells: {
        product: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        damage: item.damage,
        loss: item.loss,
        value: item.damage + item.loss,
      },
    }))
    .sort((a, b) => Number(b.cells.value) - Number(a.cells.value) || a.id.localeCompare(b.id));
  return {
    kind: 'shrinkage',
    title: 'Shrinkage',
    description: 'Damage and loss valued at snapshotted cost.',
    generatedAt: now.toISOString(),
    columns: [
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'sku', label: 'Product code (SKU)', type: 'text' },
      { key: 'quantity', label: 'Units', type: 'number' },
      ...moneyCols([
        ['damage', 'Damage'],
        ['loss', 'Loss'],
        ['value', 'Total'],
      ]),
    ],
    rows,
    totals: {
      quantity: sum(rows, 'quantity'),
      damage: sum(rows, 'damage'),
      loss: sum(rows, 'loss'),
      value: sum(rows, 'value'),
    },
  };
}

function movementRows(ctx: ReportContext, filters: ReportFilters, now: Date): ReportResult {
  const rows = ctx.movements
    .filter((movement) => {
      const product = ctx.productById.get(movement.productId);
      return (
        inPeriod(movement, filters, now) &&
        allowedProduct(product, filters) &&
        (!filters.type || movement.type === filters.type) &&
        (!filters.reason || movement.reason === filters.reason) &&
        (!filters.actorId || movement.actorId === filters.actorId)
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .map((movement) => {
      const product = ctx.productById.get(movement.productId)!;
      return {
        id: movement.id,
        cells: {
          date: movement.createdAt,
          occurredAt: movementOccurredAt(movement),
          product: product.name,
          sku: product.sku,
          type: movement.type,
          reason: movement.reason,
          quantity: movement.quantity,
          unitCost: movement.unitCost,
          unitPrice: movement.unitPrice,
          actor: movement.actorId
            ? (ctx.actorNames.get(movement.actorId) ?? '__report_unknownUser')
            : '__report_system',
          reference: movement.reference,
        },
      };
    });
  return {
    kind: 'movements',
    title: 'Movement audit',
    description: 'Append-only inventory ledger with complete operational filters.',
    generatedAt: now.toISOString(),
    columns: [
      { key: 'date', label: 'Recorded on', type: 'date' },
      { key: 'occurredAt', label: 'Actual time', type: 'date' },
      { key: 'product', label: 'Product', type: 'text' },
      { key: 'sku', label: 'Product code (SKU)', type: 'text' },
      { key: 'type', label: 'Type', type: 'enum' },
      { key: 'reason', label: 'Reason', type: 'enum' },
      { key: 'quantity', label: 'Qty', type: 'number' },
      ...moneyCols([
        ['unitCost', 'Unit cost'],
        ['unitPrice', 'Unit price'],
      ]),
      { key: 'actor', label: 'Actor', type: 'text' },
      { key: 'reference', label: 'Reference', type: 'text' },
    ],
    rows,
    totals: { quantity: sum(rows, 'quantity') },
  };
}

export function calculateReport(
  ctx: ReportContext,
  filters: ReportFilters,
  now: Date,
): ReportResult {
  const builders = {
    valuation,
    sales: saleRows,
    profit: profitRows,
    purchases: purchaseRows,
    aging: agingRows,
    shrinkage: shrinkageRows,
    movements: movementRows,
  };
  return { ...builders[filters.report](ctx, filters, now), filters };
}
