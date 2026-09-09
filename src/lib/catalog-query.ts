import type { Product, ProductUnit, StockMovement, UsedDeviceAcquisition, RefurbishmentExpense } from '@/domain/types';
import { filterAndOrderUnits, type UnitFilters } from '@/lib/unit-filters';
import { parseBDT } from '@/lib/money';

export interface PageRequest { page: number; pageSize: number }
export interface PageResult<T> extends PageRequest { rows: T[]; totalCount: number; pageCount: number }
export type RawParams = Record<string, string | string[] | undefined>;
export const one = (raw: RawParams, key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key])?.trim() ?? '';
export const PRODUCT_DEFAULTS = { q: '', tracking: '', stock: '', category: '', brand: '', status: 'active', order: 'name-asc' };
export type ProductFilterValues = typeof PRODUCT_DEFAULTS;
export const UNIT_DEFAULTS = { query: '', location: '', status: 'all', receivedFrom: '', receivedTo: '', minCost: '', maxCost: '', order: 'in-stock-first', grade: 'all', acquisitionType: 'all' };
export type UnitFilterValues = typeof UNIT_DEFAULTS;
export interface ProductQuery extends PageRequest, ProductFilterValues { now: string }
export interface UnitQuery extends PageRequest, UnitFilterValues { productId: string; unit: string }
export interface ProductRow { product: Product; onHand: number }
export interface ProductPageResult extends PageResult<ProductRow> {
  catalogCount: number; lowCount: number; outCount: number;
  categoryIds: string[]; brandIds: string[];
}
export interface UsedUnitDetail {
  unitId: string; acquisitionType: 'DIRECT_PURCHASE' | 'TRADE_IN' | null;
  sellerName: string | null; sellerPhone: string | null; identificationType: string | null;
  identificationNumber: string | null; acquisitionValue: number | null; reference: string | null;
  note: string | null; acquiredAt: string | null; refurbishmentTotal: number;
}
export interface UnitPageResult extends PageResult<ProductUnit> {
  unitCount: number; inStock: number; stockValue: number; usedDetails: UsedUnitDetail[];
  targetStatus: 'found' | 'filtered' | 'missing' | null;
}
const productOrders = ['name-asc', 'name-desc', 'newest', 'oldest', 'stock-desc', 'stock-asc', 'cost-desc', 'cost-asc', 'price-desc', 'price-asc'];
const unitOrders = ['in-stock-first', 'newest', 'oldest', 'profit-desc', 'profit-asc', 'cost-desc', 'cost-asc', 'serial-asc'];
const choice = (value: string, choices: readonly string[], fallback: string) => choices.includes(value) ? value : fallback;
export function pageRequest(raw: RawParams): PageRequest {
  const value = one(raw, 'page');
  const page = /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1;
  return { page, pageSize: [25, 50, 100].includes(Number(one(raw, 'pageSize'))) ? Number(one(raw, 'pageSize')) : 25 };
}
export function productQuery(raw: RawParams, showCosts: boolean, now = new Date()): ProductQuery {
  const values = Object.fromEntries(Object.keys(PRODUCT_DEFAULTS).map(key => [key, one(raw, key)])) as ProductFilterValues;
  values.status = choice(values.status, ['active', 'archived', 'all'], 'active');
  values.tracking = choice(values.tracking, ['SERIAL', 'QUANTITY'], '');
  values.stock = choice(values.stock, ['on-hand', 'low', 'out', 'dead'], '');
  values.order = choice(values.order, productOrders, 'name-asc');
  if (!showCosts && values.order.startsWith('cost-')) values.order = 'name-asc';
  return { ...values, ...pageRequest(raw), now: now.toISOString() };
}
export function unitQuery(raw: RawParams, productId: string, showCosts: boolean): UnitQuery {
  const values = Object.fromEntries(Object.keys(UNIT_DEFAULTS).map(key => [key, one(raw, key)])) as UnitFilterValues;
  values.status = choice(values.status, ['IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED', 'DAMAGED', 'LOST', 'VOID'], 'all');
  values.grade = choice(values.grade, ['NEW', 'GRADE_A', 'GRADE_B', 'GRADE_C', 'REFURBISHED'], 'all');
  values.acquisitionType = choice(values.acquisitionType, ['DIRECT_PURCHASE', 'TRADE_IN'], 'all');
  values.order = choice(values.order, unitOrders, 'in-stock-first');
  if (!showCosts) { values.minCost = ''; values.maxCost = ''; values.acquisitionType = 'all'; if (/^(cost|profit)-/.test(values.order)) values.order = 'in-stock-first'; }
  return { ...values, ...pageRequest(raw), productId, unit: one(raw, 'unit') };
}
export function unitRangeErrors(values: UnitFilterValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ['receivedFrom', 'receivedTo'] as const) {
    const value = values[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors[key] = 'catalog.invalidDate';
  }
  if (!errors.receivedFrom && !errors.receivedTo && values.receivedFrom && values.receivedTo && values.receivedFrom > values.receivedTo) errors.receivedTo = 'catalog.invalidDateRange';
  for (const key of ['minCost', 'maxCost'] as const) {
    try { if (values[key] && parseBDT(values[key]) < 0) throw new Error(); }
    catch { errors[key] = 'catalog.invalidAmount'; }
  }
  if (!errors.minCost && !errors.maxCost && values.minCost && values.maxCost && parseBDT(values.minCost) > parseBDT(values.maxCost)) errors.maxCost = 'catalog.invalidCostRange';
  return errors;
}
export function catalogUrl(path: string, values: ProductFilterValues | UnitFilterValues | Record<string, string>, request: PageRequest, unit?: string): string {
  const defaults: Record<string, string> = 'usage' in values ? { query: '', status: 'active', usage: 'all', order: 'newest', parent: '' } : 'q' in values ? PRODUCT_DEFAULTS : UNIT_DEFAULTS;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (key in defaults && value.trim() && value !== defaults[key as keyof typeof defaults]) params.set(key, value.trim());
  }
  if (request.page > 1) params.set('page', String(request.page));
  if (request.pageSize !== 25) params.set('pageSize', String(request.pageSize));
  if (unit) params.set('unit', unit);
  return `${path}${params.size ? `?${params}` : ''}`;
}
export function paginate<T>(rows: T[], request: PageRequest): PageResult<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / request.pageSize));
  const page = Math.min(request.page, pageCount);
  return { page, pageSize: request.pageSize, totalCount: rows.length, pageCount, rows: rows.slice((page - 1) * request.pageSize, page * request.pageSize) };
}
export function deadStockDates(movements: readonly StockMovement[]) {
  const reversed = new Set(movements.filter(m => m.reason === 'CORRECTION' && m.reversesId).map(m => m.reversesId));
  const dates = new Map<string, { firstIn?: string; lastOut?: string }>();
  for (const m of movements) {
    if (m.reason === 'CORRECTION' || reversed.has(m.id)) continue;
    const row = dates.get(m.productId) ?? {};
    if (m.quantity > 0 && (!row.firstIn || m.createdAt < row.firstIn)) row.firstIn = m.createdAt;
    if (m.quantity < 0 && (!row.lastOut || m.createdAt > row.lastOut)) row.lastOut = m.createdAt;
    dates.set(m.productId, row);
  }
  return dates;
}
export function productPageFromRows(products: Product[], units: ProductUnit[], movements: StockMovement[], query: ProductQuery): ProductPageResult {
  const counts = new Map<string, number>();
  for (const u of units) if (u.status === 'IN_STOCK') counts.set(u.productId, (counts.get(u.productId) ?? 0) + 1);
  const dates = deadStockDates(movements);
  const rows = products.map(product => ({ product, onHand: product.trackingType === 'SERIAL' ? counts.get(product.id) ?? 0 : product.quantityOnHand })).filter(({ product: p, onHand: n }) => {
    if (query.status !== 'all' && p.isActive !== (query.status === 'active')) return false;
    if (query.tracking && p.trackingType !== query.tracking || query.category && p.categoryId !== query.category || query.brand && p.brandId !== query.brand) return false;
    if (query.q && ![p.name, p.sku, p.model, p.barcode].some(v => v?.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))) return false;
    const d = dates.get(p.id);
    const dead = n > 0 && Date.parse(query.now) - Date.parse(d?.lastOut ?? d?.firstIn ?? p.createdAt) >= 60 * 86_400_000;
    return !query.stock || (query.stock === 'on-hand' ? n > 0 : query.stock === 'low' ? n > 0 && n <= p.reorderPoint : query.stock === 'out' ? n === 0 : dead);
  }).sort((a, b) => {
    const sort = query.order;
    const comparison = sort === 'newest' ? b.product.createdAt.localeCompare(a.product.createdAt) : sort === 'oldest' ? a.product.createdAt.localeCompare(b.product.createdAt)
      : sort.startsWith('stock-') ? (a.onHand - b.onHand) * (sort.endsWith('desc') ? -1 : 1)
      : sort.startsWith('cost-') ? (a.product.defaultCostPrice - b.product.defaultCostPrice) * (sort.endsWith('desc') ? -1 : 1)
      : sort.startsWith('price-') ? (a.product.defaultSalePrice - b.product.defaultSalePrice) * (sort.endsWith('desc') ? -1 : 1)
      : a.product.name.localeCompare(b.product.name, undefined, { numeric: true, sensitivity: 'base' }) * (sort === 'name-desc' ? -1 : 1);
    return comparison || a.product.sku.localeCompare(b.product.sku) || a.product.id.localeCompare(b.product.id);
  });
  return { ...paginate(rows, query), catalogCount: products.length,
    lowCount: rows.filter(r => r.onHand > 0 && r.onHand <= r.product.reorderPoint).length,
    outCount: rows.filter(r => r.onHand === 0).length,
    categoryIds: [...new Set(products.map(p => p.categoryId))], brandIds: [...new Set(products.flatMap(p => p.brandId ? [p.brandId] : []))],
  };
}
export function unitPageFromRows(all: ProductUnit[], acquisitions: UsedDeviceAcquisition[], expenses: RefurbishmentExpense[], query: UnitQuery): UnitPageResult {
  const units = all.filter(u => u.productId === query.productId);
  const acquired = new Map<string, UsedDeviceAcquisition>();
  for (const acquisition of acquisitions) {
    const previous = acquired.get(acquisition.unitId);
    if (!previous || acquisition.acquiredAt > previous.acquiredAt || (acquisition.acquiredAt === previous.acquiredAt && acquisition.id > previous.id)) acquired.set(acquisition.unitId, acquisition);
  }
  const valid = Object.keys(unitRangeErrors(query)).length === 0;
  const filtered = valid ? filterAndOrderUnits(units, { ...query, minCost: query.minCost ? parseBDT(query.minCost) : null, maxCost: query.maxCost ? parseBDT(query.maxCost) : null } as UnitFilters)
    .filter(u => (query.grade === 'all' || (query.grade === 'NEW' ? !u.usedGrade : u.usedGrade === query.grade)) && (query.acquisitionType === 'all' || acquired.get(u.id)?.type === query.acquisitionType)) as ProductUnit[] : [];
  const targetIndex = filtered.findIndex(u => u.id === query.unit);
  const result = paginate(filtered, { ...query, page: targetIndex >= 0 ? Math.floor(targetIndex / query.pageSize) + 1 : query.page });
  return { ...result, unitCount: units.length, inStock: units.filter(u => u.status === 'IN_STOCK').length,
    stockValue: units.filter(u => u.status === 'IN_STOCK').reduce((sum, u) => sum + u.costPrice, 0),
    targetStatus: !query.unit ? null : targetIndex >= 0 ? 'found' : units.some(u => u.id === query.unit) ? 'filtered' : 'missing',
    usedDetails: result.rows.filter(u => u.usedGrade).map(u => {
      const a = acquired.get(u.id);
      return { unitId: u.id, acquisitionType: a?.type ?? null, sellerName: a?.sellerName ?? null, sellerPhone: a?.sellerPhone ?? null,
        identificationType: a?.identificationType ?? null, identificationNumber: a?.identificationNumber ?? null,
        acquisitionValue: a?.acquisitionValue ?? null, reference: a?.reference ?? null, note: a?.note ?? null, acquiredAt: a?.acquiredAt ?? null,
        refurbishmentTotal: expenses.filter(e => e.unitId === u.id).reduce((sum, e) => sum + e.amount, 0) };
    }),
  };
}
