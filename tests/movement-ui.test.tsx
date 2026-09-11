// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), reverse: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/actions/stock', () => ({ reverseMovementAction: mocks.reverse }));
import { MovementWorkspace } from '@/components/stock/MovementWorkspace';
import { MovementReversalDialog } from '@/components/stock/ReverseButton';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { MOVEMENT_REASONS, type Role } from '@/domain/types';
import { movementPageForRole, movementPageFromRows, parseMovementQuery, type MovementRow } from '@/lib/movement-query';
import { ledgerData, ledgerMovement } from './movement-fixtures';
let root: Root, container: HTMLDivElement;
const get = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)!;
const click = async (node: HTMLElement) => { await act(async () => node.click()); };
async function change(name: string, value: string) {
  const node = get<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value); node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}
const data = ledgerData([ledgerMovement(1), ledgerMovement(2, { unitId: 'unit', createdAt: '2026-09-03T00:00:00.000Z' })]);
data.units = [{ id: 'unit', serialNo: 'VALID-SERIAL', status: 'IN_STOCK' }];
async function mount(raw: Record<string, string> = {}, role: Role = 'ADMIN', locale: 'en' | 'bn' = 'en') {
  const query = parseMovementQuery(raw), result = movementPageForRole(movementPageFromRows(data, query), role);
  await act(async () => root.render(<I18nProvider locale={locale}><MovementWorkspace query={query} result={result} products={data.products} users={data.users} role={role} /></I18nProvider>));
}
const serialRow = (): MovementRow => movementPageFromRows(data, parseMovementQuery({})).rows[0]!;
async function reversal(onClose = vi.fn()) { await act(async () => root.render(<I18nProvider locale="en"><MovementReversalDialog row={serialRow()} onClose={onClose} /></I18nProvider>)); return onClose; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.push.mockReset(); mocks.refresh.mockReset(); mocks.reverse.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('ledger filters and results', () => {
  it('marks reversed originals in desktop, mobile and details even when the correction is filtered out', async () => {
    const original = ledgerMovement(1);
    const fixture = ledgerData([original, ledgerMovement(2, { reason: 'CORRECTION', quantity: -1, reversesId: original.id })]);
    const query = parseMovementQuery({ reason: 'PURCHASE' });
    const result = movementPageFromRows(fixture, query);
    await act(async () => root.render(<I18nProvider locale="en"><MovementWorkspace query={query} result={result} products={fixture.products} users={fixture.users} role="ADMIN" /></I18nProvider>));
    expect(result.rows).toHaveLength(1);
    expect(get('tbody').textContent).toContain('reversed');
    expect(get('article').textContent).toContain('reversed');
    await click(button('Details'));
    const modal = get('[role=dialog]');
    expect([...modal.querySelectorAll('dt')].map(node => node.textContent)).toContain('Status');
    expect(modal.textContent).toContain('reversed');
    expect(modal.textContent).toContain('Correction entry');
    expect(button('Reverse')).toBeUndefined();
  });
  it('offers every movement reason and applies combined filters through URL navigation', async () => {
    await mount(); expect(get('[name=product]').closest('details')).toBeNull(); expect(get('[name=order]').closest('form')).not.toBeNull(); expect([...get<HTMLSelectElement>('[name=reason]').options].map(option => option.value)).toEqual(['', ...MOVEMENT_REASONS]);
    await change('q', 'Phone'); await change('reason', 'RETURN_TO_SUPPLIER'); await change('actor', 'u'); await change('order', 'oldest'); await click(button('Apply filters'));
    const url = new URL(mocks.push.mock.calls[0]![0], 'http://localhost'); expect(url.searchParams.get('q')).toBe('Phone'); expect(url.searchParams.get('reason')).toBe('RETURN_TO_SUPPLIER'); expect(url.searchParams.get('actor')).toBe('u'); expect(url.searchParams.get('order')).toBe('oldest');
    expect(mocks.push).toHaveBeenCalledWith(expect.any(String), { scroll: false });
  });
  it('synchronizes dirty fields on Back/Forward and clears the reason along with every other filter', async () => {
    await mount({ q: 'alpha', reason: 'SALE' }); await change('q', 'unsubmitted');
    await mount({ q: 'beta', reason: 'PURCHASE' }); expect(get<HTMLInputElement>('[name=q]').value).toBe('beta');
    await mount({ q: 'alpha', reason: 'SALE' }); expect(get<HTMLInputElement>('[name=q]').value).toBe('alpha');
    await click(button('Reset')); expect(mocks.push).toHaveBeenLastCalledWith('/stock/movements', { scroll: false });
    expect(get<HTMLInputElement>('[name=q]').value).toBe(''); expect(get<HTMLSelectElement>('[name=reason]').value).toBe('');
  });
  it('removes individual applied filters and keeps pagination filters', async () => {
    await mount({ reason: 'PURCHASE', actor: 'u' }); await click(get('[aria-label="Remove Recorded by filter"]'));
    expect(mocks.push.mock.calls.at(-1)![0]).toBe('/stock/movements?reason=PURCHASE');
    const query = parseMovementQuery({ reason: 'PURCHASE' }), result = movementPageFromRows(ledgerData(), query);
    await act(async () => root.render(<I18nProvider locale="en"><MovementWorkspace query={query} result={result} products={data.products} users={data.users} role="ADMIN" /></I18nProvider>));
    await click([...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Movement ledger pages"] button')].find(node => node.textContent === 'Next')!);
    expect(mocks.push.mock.calls.at(-1)![0]).toBe('/stock/movements?reason=PURCHASE&page=2');
  });
  it('rejects reversed date ranges, focuses the field, and withholds rows', async () => {
    await mount(); await change('from', '2026-09-03'); await change('to', '2026-09-02'); await click(button('Apply filters'));
    expect(mocks.push).not.toHaveBeenCalled(); expect(get('[name=to]').getAttribute('aria-invalid')).toBe('true'); expect(container.querySelector('table')).toBeNull();
    await act(async () => new Promise(resolve => setTimeout(resolve, 30))); expect(document.activeElement).toBe(get('[name=to]'));
  });
  it('disables controls while pending and recovers from a failed navigation', async () => {
    let reject!: (error: Error) => void; mocks.push.mockImplementation(() => new Promise((_, no) => { reject = no; }));
    await mount(); await change('q', 'Phone'); await click(button('Apply filters'));
    expect(get<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
    await act(async () => reject(Error('Failed navigation')));
    expect(get<HTMLFieldSetElement>('fieldset').disabled).toBe(false); expect(document.body.textContent).toContain('The ledger could not be loaded');
    expect(get<HTMLInputElement>('[name=q]').value).toBe('Phone');
    const failedHref = mocks.push.mock.calls[0]![0];
    mocks.push.mockResolvedValue(undefined);
    await click(button('Try again'));
    expect(mocks.push).toHaveBeenLastCalledWith(failedHref, { scroll: false });
    expect(document.body.textContent).not.toContain('The ledger could not be loaded');
  });
  it('keeps serials readable, includes years, and provides desktop and mobile details', async () => {
    await mount(); expect(get('table').textContent).not.toContain('2026'); expect(get('table').textContent).toContain('Unit cost');
    expect([...container.querySelectorAll('span')].find(node => node.textContent === 'VALID-SERIAL')?.className).not.toContain('line-through');
    expect(container.querySelectorAll('article')).toHaveLength(2);
    await click(button('Details')); expect(get('[role=dialog]').textContent).toContain('Movement ID'); expect(get('[role=dialog]').textContent).toContain('Stock change'); expect([...get('[role=dialog]').querySelectorAll('dt')].map(node => node.textContent)).toContain('Recorded by'); expect(get('[role=dialog]').textContent).toContain('2026'); await click(get('[aria-label=Close]')); expect(document.querySelector('[role=dialog]')).toBeNull();
    await click(button('Details')); await act(async () => get('[role=dialog]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); expect(document.querySelector('[role=dialog]')).not.toBeNull();
    await act(async () => get('[role=dialog]').parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('renders Bengali and keeps costs and reversal actions absent for STAFF', async () => {
    await mount({}, 'STAFF', 'bn'); expect(container.textContent).toContain('রেকর্ডের সময়'); expect(container.textContent).not.toContain('প্রতি ইউনিট ক্রয়মূল্য');
    await click(button('বিস্তারিত')); expect(get('[role=dialog]').textContent).not.toContain('প্রতি ইউনিট ক্রয়মূল্য'); expect(get('[role=dialog]').textContent).not.toContain('রিভার্স');
  });
  it('distinguishes a filtered empty state from an empty ledger', async () => {
    await mount({ q: 'missing' }); expect(container.textContent).toContain('No movements match these filters.');
    const query = parseMovementQuery({}); await act(async () => root.render(<MovementWorkspace query={query} result={{ ...query, rows: [], ledgerCount: 0, totalCount: 0, pageCount: 1 }} products={[]} users={[]} role="ADMIN" />));
    expect(container.textContent).toContain('No movements recorded yet.');
  });
});

describe('reversal confirmation', () => {
  it('validates the reason, preserves rejected input, and permits cancel without a write', async () => {
    const close = await reversal(); await click(button('Confirm reversal')); expect(mocks.reverse).not.toHaveBeenCalled(); expect(get('[name=note]').getAttribute('aria-invalid')).toBe('true');
    mocks.reverse.mockResolvedValue({ outcome: 'rejected', error: 'ledger.stockChanged' }); await change('note', 'Wrong IMEI'); await click(button('Confirm reversal'));
    expect(get<HTMLTextAreaElement>('[name=note]').value).toBe('Wrong IMEI'); expect(document.body.textContent).toContain('no longer in the state');
    await click(button('Cancel')); expect(close).toHaveBeenCalledTimes(1);
  });
  it('locks pending edits and cancellation, then retries an unconfirmed request unchanged', async () => {
    let resolve!: (value: unknown) => void; mocks.reverse.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const close = await reversal(); await change('note', 'Wrong receipt'); await click(button('Confirm reversal'));
    expect(button('Cancel').disabled).toBe(true); expect(get<HTMLTextAreaElement>('[name=note]').disabled).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(close).not.toHaveBeenCalled();
    await act(async () => resolve({ outcome: 'unconfirmed', error: 'ledger.unconfirmed' })); expect(button('Cancel').disabled).toBe(true);
    mocks.reverse.mockResolvedValue({ receipt: { id: 'correction', productId: 'p', quantity: -1, createdAt: '2026-09-04' } });
    await click(button('Retry same reversal'));
    expect([...mocks.reverse.mock.calls[0]![1].entries()]).toEqual([...mocks.reverse.mock.calls[1]![1].entries()]);
    expect(document.body.textContent).toContain('Movement reversed'); expect(get('[role=status]').textContent).toContain('correction'); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('preserves a committed success when a client refresh throws', async () => {
    await reversal(); mocks.reverse.mockResolvedValue({ receipt: { id: 'correction', productId: 'p', quantity: -1, createdAt: '2026-09-04' } });
    mocks.refresh.mockImplementation(() => { throw Error('refresh failed'); }); await change('note', 'Wrong receipt'); await click(button('Confirm reversal'));
    expect(document.body.textContent).toContain('Movement reversed'); expect(button('Close')).toBeTruthy();
  });
});
