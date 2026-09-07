// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockLabelStudio } from '@/components/labels/StockLabelStudio';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import type { LabelPrintState, LabelUnitOption } from '@/lib/label-print';
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), scan: vi.fn(), push: vi.fn() }));
vi.mock('@/actions/labels', () => ({ recordLabelPrintAction: mocks.prepare, resolveLabelIdentifierAction: mocks.scan }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
const phone = { id: 'phone', sku: 'PHONE', name: 'Phone', barcode: null, model: null, brandName: null, isActive: true, trackingType: 'SERIAL' as const, quantityOnHand: 4 };
const bulk = { ...phone, id: 'bulk', sku: 'BULK', name: 'Cable', barcode: '12345678', trackingType: 'QUANTITY' as const };
const units: LabelUnitOption[] = Array.from({ length: 4 }, (_, index) => ({ id: `unit-${index}`, serialNo: `35238604529391${index}`, status: index === 3 ? 'SOLD' : 'IN_STOCK', receivedAt: '2026-09-01T00:00:00Z' }));
let root: Root;
let container: HTMLDivElement;
let props: React.ComponentProps<typeof StockLabelStudio>;
const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (name: string) => [...document.querySelectorAll('button')].find(element => element.textContent === name)!;
const printButton = () => query<HTMLButtonElement>('button[type="submit"]');
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function scan(unit: LabelUnitOption, productId = 'phone') {
  mocks.scan.mockResolvedValueOnce({ productId, unit });
  const scanner = query<HTMLInputElement>('input[maxlength="120"]');
  await change(scanner, unit.serialNo);
  await act(async () => scanner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
}
async function mount(overrides: Partial<typeof props> = {}, locale: 'en' | 'bn' = 'en') {
  props = { products: [phone, bulk], product: phone, units, initialUnitIds: [], initialCopies: 1, role: 'ADMIN', resultVersion: 'one', selectionContext: 'phone', ...overrides };
  await act(async () => root.render(<I18nProvider locale={locale}><StockLabelStudio {...props} /></I18nProvider>));
}
async function rerender(overrides: Partial<typeof props>) {
  props = { ...props, ...overrides };
  await act(async () => root.render(<I18nProvider locale="en"><StockLabelStudio {...props} /></I18nProvider>));
}
async function nextFrame() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  window.print = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.prepare.mockReset().mockImplementation(async (_state, data: FormData) => {
    const product = data.get('productId') === 'bulk' ? bulk : phone;
    const selected = JSON.parse(String(data.get('unitIds'))) as string[];
    const copies = Number(data.get('copies'));
    return { printNonce: crypto.randomUUID(), job: { product: { ...product, name: 'Server snapshot' }, units: units.filter(unit => selected.includes(unit.id)), copies, layout: data.get('layout'), labelCount: copies * (product.trackingType === 'SERIAL' ? selected.length : 1) } };
  });
  mocks.scan.mockReset(); mocks.push.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('label selection and printing interactions', () => {
  it('keeps preview-only labels unprintable until acceptance, then prints the server snapshot once', async () => {
    await mount({ initialUnitIds: [units[0].id] });
    expect(document.querySelector('.label-print-area')).toBeNull(); expect(query<HTMLElement>('.label-print-notice').hidden).toBe(true); expect(query('.label-print-notice').textContent).toContain('Print labels button');
    await click(printButton()); await nextFrame();
    expect(window.print).toHaveBeenCalledTimes(1); expect(query('.label-print-area').textContent).toContain('Server snapshot');
    expect(query('.stock-label-print-root').getAttribute('data-print-ready')).toBe('true');
    await rerender({ resultVersion: 'refresh' }); await nextFrame(); expect(window.print).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event('afterprint'))); await nextFrame();
    expect(document.querySelector('.label-print-area')).toBeNull(); expect(document.activeElement).toBe(printButton());
    expect(query<HTMLInputElement>('[name="copies"]').matches(':disabled')).toBe(false);
  });
  it('freezes every job control and ignores duplicate submissions while waiting', async () => {
    let resolve!: (state: LabelPrintState) => void;
    mocks.prepare.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await mount({ initialUnitIds: [units[0].id] });
    await act(async () => { printButton().click(); printButton().click(); });
    expect(mocks.prepare).toHaveBeenCalledOnce();
    for (const control of document.querySelectorAll('input:not([type="hidden"]), select, button')) expect(control.matches(':disabled')).toBe(true);
    await act(async () => resolve({ error: 'labels.prepareFailed' }));
    expect(query<HTMLInputElement>('[name="copies"]').matches(':disabled')).toBe(false);
    await click(printButton()); await nextFrame(); expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });
  it('preserves copies and selection after transport failure and retries', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('offline'));
    await mount({ initialUnitIds: [units[0].id] }); await change(query('[name="copies"]'), '2');
    await click(printButton());
    expect(query('[role="alert"]').textContent).toContain('try again'); expect(query<HTMLInputElement>('[name="copies"]').value).toBe('2');
    expect(document.querySelector('.label-print-area')).toBeNull();
    await click(printButton()); await nextFrame(); expect(query('.label-print-area').querySelectorAll('.stock-label')).toHaveLength(2);
  });
  it('accumulates same-product scans once without navigating or resetting settings', async () => {
    await mount(); await change(query('[name="copies"]'), '2'); await change(query('[name="layout"]'), 'a4');
    await scan(units[0]); await scan(units[1]); await scan(units[0]);
    expect(JSON.parse(query<HTMLInputElement>('[name="unitIds"]').value)).toEqual([units[0].id, units[1].id]);
    expect(mocks.push).not.toHaveBeenCalled(); expect(query<HTMLInputElement>('[name="copies"]').value).toBe('2');
    expect([...document.querySelectorAll('[role="status"]')].find(element => element.textContent === 'Device already selected.')?.classList.contains('text-ok')).toBe(true);
    expect(query<HTMLSelectElement>('[name="layout"]').value).toBe('a4'); expect(query<HTMLInputElement>('input[maxlength="120"]').value).toBe('');
  });
  it('switches automatically after a cross-product scan and resets copies for the new operation', async () => {
    await mount({ initialUnitIds: [units[0].id] }); await change(query('[name="copies"]'), '5'); await change(query('[name="layout"]'), 'a4');
    await scan(units[1], 'bulk');
    expect(mocks.push).toHaveBeenCalledWith('/stock/labels?product=bulk&unit=unit-1');
    expect(query<HTMLInputElement>('[role="combobox"]').value).toContain('Cable');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await rerender({ product: bulk, units: [], initialUnitIds: [], selectionContext: 'bulk' });
    expect(query<HTMLInputElement>('[name="copies"]').value).toBe('1');
    expect(query<HTMLSelectElement>('[name="layout"]').value).toBe('a4');
    expect(JSON.parse(query<HTMLInputElement>('[name="unitIds"]').value)).toEqual([]);
  });
  it.each([phone, bulk])('updates the picker immediately and resets copies when switching from $name', async current => {
    const next = current.id === 'phone' ? bulk : phone;
    await mount({ product: current, selectionContext: current.id, initialCopies: 5, initialUnitIds: current.id === 'phone' ? [units[0].id] : [] });
    const combo = query<HTMLInputElement>('[role="combobox"]');
    await act(async () => combo.focus());
    const option = [...document.querySelectorAll('[role="option"]')].find(option => option.textContent?.includes(next.name))!;
    await act(async () => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    expect(combo.value).toContain(next.name);
    expect(mocks.push).toHaveBeenCalledWith('/stock/labels?product=' + next.id);
    await rerender({ product: next, selectionContext: next.id, initialUnitIds: [], units: next.id === 'phone' ? units : [] });
    expect(query<HTMLInputElement>('[name="copies"]').value).toBe('1');
  });
  it('preserves selections on refresh and applies receipt defaults only on a new context', async () => {
    await mount({ initialUnitIds: [units[0].id], receiptId: 'receipt-one', selectionContext: 'receipt-one' });
    await change(query('[name="copies"]'), '4'); await scan(units[1]);
    await rerender({ resultVersion: 'refresh' });
    expect(query<HTMLInputElement>('[name="copies"]').value).toBe('4'); expect(JSON.parse(query<HTMLInputElement>('[name="unitIds"]').value)).toHaveLength(2);
    await rerender({ product: bulk, units: [], initialUnitIds: [], receiptId: 'receipt-two', selectionContext: 'receipt-two', initialCopies: 600, receiptCount: 600 });
    expect(query<HTMLInputElement>('[name="copies"]').value).toBe('600'); await click(printButton()); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('nothing has been removed automatically');
  });
  it('reveals hidden and non-stock selections, and shows distinct preview devices rather than copies', async () => {
    await mount({ initialUnitIds: units.map(unit => unit.id), initialCopies: 10 });
    expect(document.querySelectorAll('.label-preview-grid .stock-label')).toHaveLength(3);
    const status = [...document.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'IN_STOCK'))!;
    await change(status, 'IN_STOCK'); expect(document.body.textContent).toContain('4 selected · 1 hidden'); expect(document.body.textContent).toContain('Selected devices not in stock: 1');
    await click(button('Show more (up to 12 devices)')); expect(document.querySelectorAll('.label-preview-grid .stock-label')).toHaveLength(4);
    const showSelected = [...document.querySelectorAll('label')].find(label => label.textContent?.includes('Show selected'))!.querySelector('input')!;
    await click(showSelected); expect(status.value).toBe('ALL'); expect(document.body.textContent).toContain('4 selected · 0 hidden');
  });
  it.each(['', '1.5', '501'])('keeps invalid copies %s visible and focuses their error', async value => {
    await mount({ product: bulk, units: [] }); await change(query('[name="copies"]'), value);
    await act(async () => query('[name="copies"]').dispatchEvent(new FocusEvent('blur', { bubbles: true })));
    expect(query<HTMLInputElement>('[name="copies"]').value).toBe(value);
    await click(printButton()); expect(mocks.prepare).not.toHaveBeenCalled(); expect(document.activeElement).toBe(query('[name="copies"]'));
    expect(query('[name="copies"]').getAttribute('aria-invalid')).toBe('true');
  });
  it('keeps STAFF status valid and blocks empty-stock printing including browser print output', async () => {
    await mount({ role: 'STAFF', initialUnitIds: [units[0].id], units: units.filter(unit => unit.status === 'IN_STOCK') });
    expect(document.querySelector('option[value="ALL"]')).toBeNull();
    await rerender({ product: { ...bulk, quantityOnHand: 0 }, units: [], initialUnitIds: [], selectionContext: 'bulk' });
    await click(printButton()); expect(mocks.prepare).not.toHaveBeenCalled(); expect(document.querySelector('.label-print-area')).toBeNull();
    expect(document.body.textContent).toContain('only print labels for items currently in stock');
  });
  it('shows explicit unavailable deep links and permission-aware missing-barcode help', async () => {
    await mount({ selectionError: 'labels.selectionUnavailable' }); expect(document.querySelector('form')).toBeNull();
    await click(button('Return to product selection')); expect(mocks.push).toHaveBeenCalledWith('/stock/labels?product=phone');
    await rerender({ selectionError: undefined, product: { ...bulk, barcode: null }, selectionContext: 'bulk', resultVersion: 'new', units: [] });
    expect(document.querySelector('a')?.textContent).toBe('Edit product');
    await rerender({ role: 'STAFF' }); expect(document.querySelector('a')).toBeNull();
  });
  it('supports keyboard picker visibility and closes it when focus leaves', async () => {
    await mount(); const combo = query<HTMLInputElement>('[role="combobox"]');
    await act(async () => { combo.focus(); combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    const active = document.getElementById(combo.getAttribute('aria-activedescendant')!); expect(active).not.toBeNull();
    await act(async () => query<HTMLInputElement>('input[maxlength="120"]').focus()); expect(combo.getAttribute('aria-expanded')).toBe('false');
  });
  it('localizes controls, checkbox labels, dates and barcode errors in Bangla', async () => {
    await mount({ units: [{ ...units[0], serialNo: 'পণ্য' }], initialUnitIds: [units[0].id] }, 'bn');
    expect(document.body.textContent).toContain('মোট লেবেল'); expect(query('input[type="checkbox"][aria-label]')?.getAttribute('aria-label')).toContain('নির্বাচন করুন');
    expect(document.body.textContent).toContain('বারকোডে রূপান্তর করা যায় না'); expect(document.body.textContent).toContain('২০২৬');
  });
});
