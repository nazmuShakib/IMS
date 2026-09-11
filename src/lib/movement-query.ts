import { MOVEMENT_REASONS, MOVEMENT_TYPES, OUTBOUND_UNIT_STATUS, type MovementReason, type MovementType, type StockMovement, type Role } from '@/domain/types';
import { one, pageRequest, paginate, type PageRequest, type PageResult, type RawParams } from '@/lib/catalog-query';
import { movementOrder } from '@/lib/movement-correction';
import { canSeeCosts, hasPermission } from '@/lib/permissions';
import type { MessageKey } from '@/lib/i18n/messages';

export const MOVEMENT_DEFAULTS = { q: '', reason: '', from: '', to: '', product: '', type: '', actor: '', order: 'newest' };
export type MovementFilters = typeof MOVEMENT_DEFAULTS;
export interface MovementQuery extends MovementFilters, PageRequest {}
export interface MovementSummary {
  id: string; type: MovementType; reason: MovementReason; quantity: number;
  unitCost?: number; unitPrice: number | null; createdAt: string; occurredAt: string;
  reference: string | null; note: string | null;
}
export type MovementAction = { kind: 'reverse' } | { kind: 'blocked'; message: MessageKey } | { kind: 'invoice' | 'supplierReturn' | 'warranty'; href: string; label: string };
export interface MovementRow extends MovementSummary {
  productId: string; productName: string; sku: string; serial: string | null;
  actorId: string | null; actorName: string | null;
  original: MovementSummary | null; correction: MovementSummary | null; action: MovementAction;
}
export interface MovementPage extends PageResult<MovementRow> { ledgerCount: number }
export class MovementQueryError extends Error {
  constructor(public details: Record<string, MessageKey>) { super('ledger.invalidFilters'); }
}
export function movementFilterErrors(values: MovementFilters): Record<string, MessageKey> {
  const errors: Record<string, MessageKey> = {};
  for (const key of ['from', 'to'] as const) {
    const value = values[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors[key] = 'catalog.invalidDate';
  }
  if (!errors.from && !errors.to && values.from && values.to && values.from > values.to) errors.to = 'catalog.invalidDateRange';
  if (values.reason && !MOVEMENT_REASONS.includes(values.reason as MovementReason)) errors.reason = 'ledger.invalidReason';
  if (values.type && !MOVEMENT_TYPES.includes(values.type as MovementType)) errors.type = 'ledger.invalidDirection';
  return errors;
}
export function movementFilters(raw: RawParams): MovementFilters {
  return { ...Object.fromEntries(Object.keys(MOVEMENT_DEFAULTS).map(key => [key, one(raw, key)])) as MovementFilters, order: one(raw, 'order') === 'oldest' ? 'oldest' : 'newest' };
}
export function parseMovementQuery(raw: RawParams): MovementQuery {
  const values = movementFilters(raw), errors = movementFilterErrors(values);
  if (Object.keys(errors).length) throw new MovementQueryError(errors);
  return { ...values, ...pageRequest(raw) };
}
export function movementUrl(values: MovementFilters, request: PageRequest = { page: 1, pageSize: 25 }) {
  const params = new URLSearchParams();
  for (const key of Object.keys(MOVEMENT_DEFAULTS) as (keyof MovementFilters)[]) {
    const value = values[key].trim();
    if (value && value !== MOVEMENT_DEFAULTS[key]) params.set(key, value);
  }
  if (request.page > 1) params.set('page', String(request.page));
  if (request.pageSize !== 25) params.set('pageSize', String(request.pageSize));
  return `/stock/movements${params.size ? `?${params}` : ''}`;
}
export function movementBounds(query: MovementFilters) {
  return { from: query.from ? new Date(`${query.from}T00:00:00+06:00`) : undefined, to: query.to ? new Date(`${query.to}T23:59:59.999+06:00`) : undefined };
}
export function movementSummary(row: StockMovement): MovementSummary {
  return { id: row.id, type: row.type, reason: row.reason, quantity: row.quantity, unitCost: row.unitCost, unitPrice: row.unitPrice,
    createdAt: row.createdAt, occurredAt: row.occurredAt ?? row.createdAt, reference: row.reference, note: row.note };
}
export interface MovementRelations {
  product: { name: string; sku: string } | null;
  unit: { serialNo: string; status: string } | null;
  actor: { name: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  supplierReturn: { id: string; returnNumber: string } | null;
  original: StockMovement | null; correction: StockMovement | null; latestId: string | null;
}
export function movementRow(row: StockMovement, relations: MovementRelations): MovementRow {
  let action: MovementAction;
  if (row.warrantyClaimId) action = { kind: 'warranty', href: `/warranty/${row.warrantyClaimId}`, label: row.reference ?? row.warrantyClaimId };
  else if (relations.invoice && (row.reason === 'SALE' || row.reason === 'TRADE_IN')) action = { kind: 'invoice', href: `/invoices/${relations.invoice.id}`, label: relations.invoice.invoiceNumber };
  else if (relations.supplierReturn) action = { kind: 'supplierReturn', href: `/suppliers/returns?q=${encodeURIComponent(relations.supplierReturn.returnNumber)}`, label: relations.supplierReturn.returnNumber };
  else if (row.reason === 'CORRECTION') action = { kind: 'blocked', message: 'ledger.isCorrection' };
  else if (relations.correction) action = { kind: 'blocked', message: 'ledger.alreadyReversed' };
  else if (row.reason === 'SALE') action = { kind: 'blocked', message: 'ledger.invoiceUnavailable' };
  else if (!relations.product || (row.unitId && (!relations.unit || relations.unit.status !== (row.quantity > 0 ? 'IN_STOCK' : OUTBOUND_UNIT_STATUS[row.reason] ?? 'SOLD')))) action = { kind: 'blocked', message: 'ledger.stockChanged' };
  else if (!row.unitId && row.quantity < 0 && relations.latestId !== row.id) action = { kind: 'blocked', message: 'ledger.laterActivity' };
  else action = { kind: 'reverse' };
  return { ...movementSummary(row), productId: row.productId, productName: relations.product?.name ?? '', sku: relations.product?.sku ?? '',
    serial: relations.unit?.serialNo ?? null, actorId: row.actorId, actorName: relations.actor?.name ?? null,
    original: relations.original ? movementSummary(relations.original) : null, correction: relations.correction ? movementSummary(relations.correction) : null, action };
}
/** Whitelist projection applies to related entries too, before the client boundary. */
export function movementPageForRole(page: MovementPage, role: Role): MovementPage {
  const project = (row: MovementSummary): MovementSummary => { const { unitCost, ...safe } = row; return canSeeCosts(role) ? { ...safe, unitCost } : safe; };
  return { ...page, rows: page.rows.map((row): MovementRow => {
    const { unitCost, ...safe } = row;
    return { ...safe, ...(canSeeCosts(role) ? { unitCost } : {}),
      original: row.original ? project(row.original) : null, correction: row.correction ? project(row.correction) : null,
      action: (row.action.kind === 'reverse' && !hasPermission(role, 'CORRECT_STOCK')) || (row.action.kind === 'supplierReturn' && !hasPermission(role, 'MANAGE_CATALOG'))
        ? { kind: 'blocked', message: 'ledger.readOnly' } : row.action,
    };
  }) };
}

export interface MovementData {
  movements: StockMovement[];
  products: Array<{ id: string; name: string; sku: string }>;
  units: Array<{ id: string; serialNo: string; status: string }>;
  users: Array<{ id: string; name: string }>;
  sales: Array<{ id: string; invoiceNumber: string }>;
  acquisitions: Array<{ unitId: string; tradeInSaleId: string | null }>;
  returns: Array<{ id: string; movementId: string; returnNumber: string }>;
}
export function movementPageFromRows(data: MovementData, query: MovementQuery): MovementPage {
  const products = new Map(data.products.map(row => [row.id, row])), units = new Map(data.units.map(row => [row.id, row]));
  const users = new Map(data.users.map(row => [row.id, row])), byId = new Map(data.movements.map(row => [row.id, row]));
  const corrections = new Map(data.movements.filter(row => row.reversesId).map(row => [row.reversesId!, row]));
  const latest = new Map<string, StockMovement>();
  for (const row of data.movements) if (row.reason !== 'CORRECTION' && !corrections.has(row.id) && (!latest.has(row.productId) || movementOrder(row, latest.get(row.productId)!) > 0)) latest.set(row.productId, row);
  const { from, to } = movementBounds(query), search = query.q.toLowerCase();
  const matches = data.movements.filter(row => {
    const product = products.get(row.productId), serial = row.unitId ? units.get(row.unitId)?.serialNo : null;
    return (!from || row.createdAt >= from.toISOString()) && (!to || row.createdAt <= to.toISOString())
      && (!query.reason || row.reason === query.reason) && (!query.type || row.type === query.type)
      && (!query.product || row.productId === query.product) && (!query.actor || row.actorId === query.actor)
      && (!search || [product?.name, product?.sku, row.reference, row.note].some(value => value?.toLowerCase().includes(search)) || serial?.toLowerCase() === search);
  }).sort((a, b) => query.order === 'oldest' ? movementOrder(a, b) : movementOrder(b, a));
  const result = paginate(matches, query);
  return { ...result, ledgerCount: data.movements.length, rows: result.rows.map(row => {
    const tradeIn = data.acquisitions.find(item => item.unitId === row.unitId);
    return movementRow(row, { product: products.get(row.productId) ?? null, unit: row.unitId ? units.get(row.unitId) ?? null : null,
      actor: row.actorId ? users.get(row.actorId) ?? null : null, invoice: data.sales.find(sale => row.reason === 'TRADE_IN' ? sale.id === tradeIn?.tradeInSaleId : sale.invoiceNumber === row.reference) ?? null,
      supplierReturn: data.returns.find(item => item.movementId === row.id) ?? null, original: row.reversesId ? byId.get(row.reversesId) ?? null : null,
      correction: corrections.get(row.id) ?? null, latestId: latest.get(row.productId)?.id ?? null });
  }) };
}

export const MOVEMENT_LABELS: Record<MovementReason, MessageKey> = {
  INITIAL_STOCK: 'reason.initialStock', PURCHASE: 'reason.purchase', TRADE_IN: 'reason.tradeIn', CUSTOMER_RETURN: 'reason.customerReturn', SALE: 'reason.sale',
  RETURN_TO_SUPPLIER: 'reason.returnSupplier', DAMAGE: 'reason.damage', LOSS: 'reason.loss', INTERNAL_USE: 'reason.internalUse', SHOP_USE: 'reason.shopUse', GIFT: 'reason.gift',
  WARRANTY_REPLACEMENT: 'reason.warrantyReplacement', CORRECTION: 'reason.correction', STOCK_COUNT: 'reason.stockCount',
};
