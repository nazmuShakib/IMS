// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { StockOutForm } from '@/components/stock/StockOutForm';
import { I18nProvider } from '@/components/i18n/I18nProvider';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/stock', () => ({ lookupSerial: mocks.lookup, stockOutAction: mocks.remove }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
const id = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const product = { id, name: 'Test product', sku: 'TEST', trackingType: 'QUANTITY', quantityOnHand: 20, isActive: false } as any;
const device = (serial = 'DEVICE', supplier = supplierId) => ({ productId: id, productName: 'Phone', sku: 'PHONE', isActive: false, unit: { serialNo: serial, supplierId: supplier, id: serial, status: 'IN_STOCK' } });
const supplier = { id: supplierId, name: 'Supplier', isActive: true } as any;
let root: Root; let container: HTMLDivElement;
const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)!;
async function click(node: HTMLElement) { await act(async () => node.click()); }
async function change(name: string, value: string) {
  const node = query<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  await act(async () => {
    const proto = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function mount(locale: 'en' | 'bn' = 'en', products = [product]) {
  await act(async () => root.render(<I18nProvider locale={locale}><StockOutForm bulkProducts={products} suppliers={[supplier]} /></I18nProvider>));
}
async function choose() {
  await act(async () => query<HTMLInputElement>('[role="combobox"]').focus());
  await act(async () => query('[role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
}
async function bulk() { await click(button('By quantity')); await choose(); await change('quantity', '2'); await change('reason', 'DAMAGE'); }
async function scan(serial = 'DEVICE') {
  await change('serialNo', serial);
  await act(async () => query('[name="serialNo"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); this.querySelector<HTMLElement>('button')?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  mocks.lookup.mockReset().mockImplementation(async (_prev, data: FormData) => ({ found: device(String(data.get('serialNo'))) }));
  mocks.remove.mockReset().mockImplementation(async (_prev, data: FormData) => ({ receipt: { movementId: String(data.get('idempotencyKey')), productId: id, productName: 'Recorded product', sku: 'TEST', serialNo: data.get('mode') === 'serial' ? data.get('serialNo') : null, quantity: data.get('mode') === 'serial' ? 1 : Number(data.get('quantity')), reason: data.get('reason'), reference: data.get('reference'), note: data.get('note') }, replayed: false }));
  mocks.refresh.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('removal interactions', () => {
  it('looks up with Enter and Find, clears stale devices and resets details', async () => {
    await mount(); await scan(); expect(mocks.lookup).toHaveBeenCalledTimes(1);
    await change('reason', 'GIFT'); await change('note', 'Old details');
    await change('serialNo', 'NEXT'); expect(button('Review removal')).toBeUndefined();
    await click(button('Find')); expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(query<HTMLInputElement>('[name="note"]').value).toBe(''); expect(query<HTMLSelectElement>('[name="reason"]').value).toBe('');
  });
  it('ignores an old lookup after the scanner changes', async () => {
    let resolve!: (value: any) => void; mocks.lookup.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await mount(); await scan('OLD'); await change('serialNo', 'NEXT');
    await act(async () => resolve({ found: device('OLD') }));
    expect(button('Review removal')).toBeUndefined(); await click(button('Find')); expect(container.textContent).toContain('NEXT');
  });
  it('requires a deliberate reason and focuses the visible inline error', async () => {
    await mount(); await scan(); await click(button('Review removal'));
    const node = query('[name="reason"]'); expect(document.activeElement).toBe(node); expect(node.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(node.getAttribute('aria-describedby')!)?.textContent).toBe('Choose a removal reason.');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('preserves invalid quantity text and notes while showing all errors', async () => {
    await mount(); await bulk(); await change('quantity', '1e3'); await change('note', 'a'.repeat(1001)); await click(button('Review removal'));
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('1e3'); expect(document.activeElement).toBe(query('[name="quantity"]'));
    expect(query('[name="note"]').getAttribute('aria-invalid')).toBe('true'); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('reviews, cancels without changes, then completes and resets without reload', async () => {
    await mount(); await bulk(); await click(button('Review removal'));
    expect(query('dialog').getAttribute('aria-labelledby')).toBeTruthy(); expect(document.activeElement).toBe(button('Back to edit'));
    await click(button('Back to edit')); expect(mocks.remove).not.toHaveBeenCalled(); expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('2');
    await click(button('Review removal')); await click(button('Remove from stock'));
    expect(query('[role="status"]').className).toContain('text-ok'); expect(container.textContent).toContain('Recorded product'); expect(query('dialog')).toBeNull();
    await click(button('Remove another')); expect(query<HTMLInputElement>('[role="combobox"]').value).toBe(''); expect(document.activeElement).toBe(query('[role="combobox"]'));
  });
  it('uses a different key for three identical operations', async () => {
    await mount(); await bulk();
    for (let index = 0; index < 3; index++) {
      await click(button('Review removal')); await click(button('Remove from stock')); await click(button('Remove another'));
      if (index < 2) { await choose(); await change('quantity', '2'); await change('reason', 'DAMAGE'); }
    }
    expect(new Set(mocks.remove.mock.calls.map(call => call[1].get('idempotencyKey'))).size).toBe(3);
  });
  it('freezes pending edits, prevents duplicate submits and retries identical unconfirmed data', async () => {
    let resolve!: (value: any) => void; mocks.remove.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await mount(); await bulk(); await click(button('Review removal')); await click(button('Remove from stock'));
    expect(query<HTMLInputElement>('[name="quantity"]').disabled).toBe(true); expect(button('By serial / IMEI').disabled).toBe(true);
    await click(button('Recording…')); expect(mocks.remove).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ outcome: 'unconfirmed', error: 'removal.unconfirmed' }));
    expect(button('Back to edit').disabled).toBe(true);
    await click(button('Retry same removal'));
    expect([...mocks.remove.mock.calls[0][1].entries()]).toEqual([...mocks.remove.mock.calls[1][1].entries()]);
  });
  it('returns rejected server validation to the field and refreshes stock', async () => {
    mocks.remove.mockResolvedValueOnce({ outcome: 'rejected', fieldErrors: { quantity: 'removal.insufficient' }, available: 1 });
    await mount(); await bulk(); await click(button('Review removal')); await click(button('Remove from stock'));
    expect(query('dialog')).toBeNull(); expect(document.activeElement).toBe(query('[name="quantity"]')); expect(container.textContent).toContain('1 on hand');
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('2'); expect(mocks.refresh).toHaveBeenCalled();
  });
  it('prefills an active original supplier, requires a return reason, and reviews the reference', async () => {
    await mount(); await scan(); await change('reason', 'RETURN_TO_SUPPLIER');
    expect(query<HTMLSelectElement>('[name="supplierId"]').value).toBe(supplierId);
    await click(button('Review removal')); expect(document.activeElement).toBe(query('[name="returnReason"]'));
    await change('returnReason', 'DEFECTIVE'); await change('reference', 'RETURN-1'); await click(button('Review removal'));
    expect(query('dialog').textContent).toContain('RETURN-1'); expect(query('dialog').textContent).toContain('Supplier');
  });
  it('starts another device after a supplier return', async () => {
    mocks.remove.mockResolvedValueOnce({ receipt: { movementId: 'm', productId: id, productName: 'Phone', sku: 'PHONE', serialNo: 'DEVICE', quantity: 1, reason: 'RETURN_TO_SUPPLIER', supplierReturn: { id: 'return', returnNumber: 'SRT-1', supplierName: 'Supplier', returnReason: 'DEFECTIVE' } } });
    await mount(); await scan(); await change('reason', 'RETURN_TO_SUPPLIER'); await change('returnReason', 'DEFECTIVE'); await click(button('Review removal')); await click(button('Remove from stock'));
    expect(query('a[href="/suppliers/returns"]')).not.toBeNull(); await click(button('Remove another')); expect(document.activeElement).toBe(query('[name="serialNo"]'));
    await scan('NEXT'); expect(button('Review removal')).toBeDefined();
  });
  it('supports Escape and contained Tab navigation in the review', async () => {
    await mount(); await bulk(); await click(button('Review removal'));
    await act(async () => button('Remove from stock').focus());
    await act(async () => query('dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button('Back to edit'));
    await act(async () => query('dialog').dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(query('dialog')).toBeNull(); expect(document.activeElement).toBe(button('Review removal'));
  });
  it('keeps archived products selectable and prevents zero-stock removal', async () => {
    await mount('en', [{ ...product, quantityOnHand: 0 }]); await bulk();
    expect(container.textContent).toContain('Archived'); expect(button('Review removal').disabled).toBe(true);
  });
  it('shows Bangla inline validation', async () => {
    await mount('bn'); await scan(); await click(button('অপসারণ যাচাই করুন'));
    expect(container.textContent).toContain('অপসারণের কারণ নির্বাচন করুন।');
  });
});

describe('removal empty states and new operations', () => {
  it('does not copy an inactive original supplier', async () => {
    mocks.lookup.mockResolvedValueOnce({ found: device('DEVICE', 'inactive-supplier') });
    await mount(); await scan(); await change('reason', 'RETURN_TO_SUPPLIER');
    expect(query<HTMLSelectElement>('[name="supplierId"]').value).toBe('');
  });
  it('explains missing suppliers and blocks review until a supplier is selected', async () => {
    await act(async () => root.render(<I18nProvider locale="en"><StockOutForm bulkProducts={[product]} suppliers={[]} /></I18nProvider>));
    await scan(); await change('reason', 'RETURN_TO_SUPPLIER'); await change('returnReason', 'OTHER'); await click(button('Review removal'));
    expect(container.textContent).toContain('No active suppliers are available.'); expect(document.activeElement).toBe(query('[name="supplierId"]')); expect(query('dialog')).toBeNull();
  });
  it('shows one useful empty-product explanation', async () => {
    await mount('en', []); await click(button('By quantity'));
    expect(query<HTMLInputElement>('[role="combobox"]').disabled).toBe(true);
    expect(container.textContent).toContain('No bulk/count-based products yet.'); expect(container.textContent).not.toContain('No active products');
  });
  it('clears quantities and notes when changing bulk products', async () => {
    await mount('en', [product, { ...product, id: '33333333-3333-4333-8333-333333333333', name: 'Second product' }]);
    await bulk(); await change('note', 'Old note');
    await act(async () => query('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })));
    await act(async () => document.querySelectorAll('[role="option"]')[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe(''); expect(query<HTMLInputElement>('[name="note"]').value).toBe(''); expect(query<HTMLSelectElement>('[name="reason"]').value).toBe('');
  });
});
