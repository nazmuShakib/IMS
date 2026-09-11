import { describe, expect, it } from 'vitest';
import { MOVEMENT_REASONS } from '@/domain/types';
import { MOVEMENT_DEFAULTS, movementPageFromRows, movementPageForRole, movementRow, movementUrl, parseMovementQuery, type MovementRelations } from '@/lib/movement-query';
import { ledgerMovement, ledgerData } from './movement-fixtures';

describe('movement query', () => {
  it('defaults to all-time recording order with bounded pages', () => {
    const query = parseMovementQuery({}); expect(query).toEqual({ ...MOVEMENT_DEFAULTS, page: 1, pageSize: 25 });
    const data = ledgerData(); const first = movementPageFromRows(data, query), last = movementPageFromRows(data, { ...query, page: 999 });
    expect(first).toMatchObject({ totalCount: 205, ledgerCount: 205, page: 1, pageCount: 9 }); expect(first.rows).toHaveLength(25);
    expect(last).toMatchObject({ totalCount: 205, page: 9 }); expect(last.rows).toHaveLength(5);
    const ids = Array.from({ length: 9 }, (_, index) => movementPageFromRows(data, { ...query, page: index + 1 }).rows.map(row => row.id)).flat();
    expect(new Set(ids).size).toBe(205); expect(ids).toEqual(data.movements.map(row => row.id).reverse());
  });
  it.each(MOVEMENT_REASONS)('supports reason %s and stable oldest ordering', reason => {
    const data = ledgerData([ledgerMovement(1, { reason }), ledgerMovement(2, { reason }), ledgerMovement(3, { reason: reason === 'SALE' ? 'PURCHASE' : 'SALE' })]);
    expect(movementPageFromRows(data, parseMovementQuery({ reason, order: 'oldest' })).rows.map(row => row.id)).toEqual(['m0001', 'm0002']);
  });
  it.each(['2026-02-31', '2026-02-29', '2026-13-01', 'junk', '0000-01-01'])('rejects invalid date %s', from => expect(() => parseMovementQuery({ from })).toThrow());
  it('validates leap days, ranges, enums and pagination', () => {
    expect(parseMovementQuery({ from: '2024-02-29', to: '2024-02-29' }).from).toBe('2024-02-29');
    for (const raw of [{ from: '2026-09-03', to: '2026-09-02' }, { reason: 'fake' }, { type: 'fake' }]) expect(() => parseMovementQuery(raw)).toThrow();
    expect(parseMovementQuery({ page: '-2', pageSize: '100000' })).toMatchObject({ page: 1, pageSize: 25 });
  });
  it('filters by recording date at both Dhaka midnight boundaries', () => {
    const data = ledgerData(['2026-09-01T17:59:59.999Z', '2026-09-01T18:00:00.000Z', '2026-09-02T17:59:59.999Z', '2026-09-02T18:00:00.000Z'].map((createdAt, index) => ledgerMovement(index, { createdAt, occurredAt: '2026-08-01T00:00:00.000Z' })));
    expect(movementPageFromRows(data, parseMovementQuery({ from: '2026-09-02', to: '2026-09-02', order: 'oldest' })).rows.map(row => row.id)).toEqual(['m0001', 'm0002']);
  });
  it('combines product, actor, direction and case-insensitive text/exact serial search', () => {
    const data = ledgerData([ledgerMovement(1, { unitId: 'unit', type: 'OUT', reason: 'SALE', quantity: -1 }), ledgerMovement(2)]);
    data.units.push({ id: 'unit', serialNo: 'SERIAL_100%', status: 'SOLD' });
    const query = parseMovementQuery({ q: 'serial_100%', product: 'p', actor: 'u', type: 'OUT' });
    expect(movementPageFromRows(data, query).rows).toHaveLength(1);
    expect(movementPageFromRows(data, { ...query, q: 'serial' }).rows).toHaveLength(0);
    expect(movementPageFromRows(data, { ...query, actor: 'other' }).rows).toHaveLength(0);
    expect(movementPageFromRows(data, { ...query, q: 'phone' }).rows).toHaveLength(1);
  });
  it('includes linked corrections outside date filters and pages, with nested costs removed for staff', () => {
    const data = ledgerData([ledgerMovement(1), ledgerMovement(2, { reason: 'CORRECTION', quantity: -1, reversesId: 'm0001', createdAt: '2026-09-03T00:00:00.000Z' })]);
    const page = movementPageFromRows(data, parseMovementQuery({ to: '2026-09-02' }));
    expect(page.rows[0]?.correction?.id).toBe('m0002'); expect(page.rows[0]?.action.kind).toBe('blocked');
    const staff = movementPageForRole(page, 'STAFF'); expect(JSON.stringify(staff)).not.toContain('unitCost'); expect(JSON.stringify(page)).toContain('unitCost');
    expect(JSON.stringify(staff)).not.toContain('idempotencyKey');
    const corrections = movementPageFromRows(data, parseMovementQuery({ reason: 'CORRECTION' })); expect(corrections.rows[0]?.original?.id).toBe('m0001');
  });
  it('preserves URL filters during paging and resets all defaults cleanly', () => {
    const query = parseMovementQuery({ reason: 'RETURN_TO_SUPPLIER', q: 'Phone & cable', actor: 'u' });
    const url = new URL(movementUrl(query, { page: 3, pageSize: 50 }), 'http://localhost');
    expect(url.searchParams.get('q')).toBe('Phone & cable'); expect(url.searchParams.get('reason')).toBe('RETURN_TO_SUPPLIER'); expect(url.searchParams.get('page')).toBe('3');
    expect(movementUrl(MOVEMENT_DEFAULTS)).toBe('/stock/movements');
  });
  it('routes owned movements and blocks unavailable states without offering a doomed reversal', () => {
    const base: MovementRelations = { product: { name: 'Phone', sku: 'PHONE' }, actor: null, unit: null, invoice: null, supplierReturn: null, original: null, correction: null, latestId: 'm0001' };
    expect(movementRow(ledgerMovement(1), base).action.kind).toBe('reverse');
    expect(movementRow(ledgerMovement(1, { warrantyClaimId: 'claim' }), base).action).toMatchObject({ kind: 'warranty', href: '/warranty/claim' });
    expect(movementRow(ledgerMovement(1, { reason: 'SALE' }), { ...base, invoice: { id: 'sale', invoiceNumber: 'INV-1' } }).action).toMatchObject({ kind: 'invoice', href: '/invoices/sale' });
    expect(movementRow(ledgerMovement(1, { reason: 'RETURN_TO_SUPPLIER' }), { ...base, supplierReturn: { id: 'r', returnNumber: 'SRT-1' } }).action.kind).toBe('supplierReturn');
    expect(movementRow(ledgerMovement(1), { ...base, latestId: 'm0002' }).action).toEqual({ kind: 'reverse' });
    expect(movementRow(ledgerMovement(1, { quantity: -1, reason: 'DAMAGE' }), { ...base, latestId: 'm0002' }).action).toMatchObject({ kind: 'blocked', message: 'ledger.laterActivity' });
    expect(movementRow(ledgerMovement(1, { unitId: 'u' }), { ...base, unit: { serialNo: 'S', status: 'SOLD' } }).action).toMatchObject({ kind: 'blocked', message: 'ledger.stockChanged' });
  });
});
