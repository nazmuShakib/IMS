// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockInForm } from '@/components/stock/StockInForm';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import type { ProductDTO } from '@/lib/dto';
import type { StockActionState } from '@/actions/stock';
import { receiptFieldsSchema, receiptFormInput } from '@/lib/stock-receipt';

const actions = vi.hoisted(() => ({ receive: vi.fn(), preflight: vi.fn() }));
vi.mock('@/actions/stock', () => ({ receiveStockAction: actions.receive, preflightStockSerials: actions.preflight }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
const products = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Pixel Phone', sku: 'PIXEL', barcode: '123456789', model: 'Pixel 9', isActive: true, trackingType: 'SERIAL', defaultCostPrice: 12500 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'USB Cable', sku: 'CABLE', barcode: '987654321', model: 'USB C', isActive: true, trackingType: 'QUANTITY', defaultCostPrice: 10000 },
] as ProductDTO[];
let root: Root;
let container: HTMLDivElement;
const query = <T extends Element = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const button = (text: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === text)!;
async function click(element: HTMLElement) { await act(async () => { element.click(); }); }
async function type(selector: string, value: string) {
  const element = query<HTMLInputElement | HTMLTextAreaElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function scan(value: string, target: HTMLElement = document.body, prefix = false, suffix = 'Enter') {
  await act(async () => {
    if (prefix) target.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }));
    for (const key of value) target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { key: suffix, bubbles: true, cancelable: true }));
  });
}
async function mount(productId?: string, locale: 'en' | 'bn' = 'en') {
  await act(async () => { root.render(<I18nProvider locale={locale}><StockInForm products={products} suppliers={[]} initialProductId={productId} /></I18nProvider>); });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); this.querySelector<HTMLElement>('[autofocus], button')?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  actions.preflight.mockReset().mockResolvedValue({ conflicts: [] });
  actions.receive.mockReset().mockImplementation(async (_previous: StockActionState, data: FormData): Promise<StockActionState> => {
    const product = products.find((item) => item.id === data.get('productId'))!;
    const input = receiptFieldsSchema.parse(receiptFormInput(data, product.trackingType));
    const count = input.quantity ?? input.serialNumbers!.length;
    const id = String(data.get('idempotencyKey'));
    return { ok: `Received ${count} × ${product.name} into stock.`, labelReceiptId: id,
      receipt: { id, productId: product.id, productName: product.name, sku: product.sku, trackingType: product.trackingType,
        count, unitCost: input.unitCost, totalCost: count * input.unitCost, supplierId: null, reason: input.reason,
        reference: input.reference ?? null, location: null, note: null, serials: input.serialNumbers ?? [],
        warrantyMonths: input.warrantyMonths ?? null, warrantyDays: input.warrantyDays ?? null, unitCondition: input.unitCondition } };
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('receive stock interactions', () => {
  it('searches model and barcode, selects with the keyboard, and closes on Tab blur', async () => {
    await mount();
    await act(async () => query<HTMLInputElement>('[role="combobox"]').focus());
    await type('[role="combobox"]', 'usb c');
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    await act(async () => query('[role="combobox"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(query<HTMLInputElement>('[name="productId"]').value).toBe(products[1]!.id);
    await act(async () => query<HTMLInputElement>('[role="combobox"]').focus());
    await type('[role="combobox"]', '123456789');
    expect(query('[role="option"]').textContent).toContain('Pixel Phone');
    await act(async () => query<HTMLInputElement>('[name="unitCost"]').focus());
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
  it('routes product scans and serial scans, rejects duplicates, and removes entries', async () => {
    await mount();
    await scan('123456789');
    await scan('IMEI-ONE'); await scan('IMEI-ONE');
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-ONE');
    expect(container.textContent).toContain('IMEI-ONE is already in this receipt.');
    await scan('IMEI-TWO', document.body, false, 'Tab');
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-ONE\nIMEI-TWO');
    await click(query('[aria-label="Remove IMEI-ONE"]'));
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-TWO');
  });
  it('protects ordinary text entry and supports F9-prefixed scanning while editing cost', async () => {
    await mount(products[0]!.id);
    await type('[name="unitCost"]', '200');
    const cost = query<HTMLInputElement>('[name="unitCost"]');
    await act(async () => cost.focus());
    await scan('TYPED', cost);
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('');
    await scan('IMEI-F9', cost, true);
    expect(cost.value).toBe('200');
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-F9');
  });
  it('guards a product change and clears product-specific data only after confirmation', async () => {
    await mount(products[0]!.id);
    await scan('IMEI-ONE'); await type('[name="reference"]', 'DELIVERY-1');
    await scan('987654321');
    expect(query('dialog').textContent).toContain('Change the product?');
    await scan('IGNORED');
    await click(button('Cancel'));
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-ONE');
    await scan('987654321'); await click(button('Clear units and change product'));
    expect(query<HTMLInputElement>('[name="productId"]').value).toBe(products[1]!.id);
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('');
    expect(query<HTMLInputElement>('[name="reference"]').value).toBe('DELIVERY-1');
    expect(query<HTMLInputElement>('[name="unitCost"]').value).toBe('100');
  });
  it('keeps bulk quantities manual and computes the total before review', async () => {
    await mount(products[1]!.id); await type('[name="quantity"]', '4');
    await scan('987654321');
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('4');
    expect(container.textContent).toContain('৳400.00');
    expect(container.querySelector('option[value="CUSTOMER_RETURN"]')).toBeNull();
  });
  it('rotates the request key after each of three identical receipts and resets quantity', async () => {
    await mount(products[1]!.id);
    const keys: string[] = [];
    for (let index = 0; index < 3; index++) {
      keys.push(query<HTMLInputElement>('[name="idempotencyKey"]').value);
      await type('[name="quantity"]', '2'); await click(button('Review receipt')); await click(button('Yes, receive stock'));
      expect(container.textContent).toContain('Stock received');
      expect(query<HTMLAnchorElement>('a').href).toContain(`receipt=${keys[index]}`);
      await click(button('Receive another'));
      expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('');
    }
    expect(new Set(keys).size).toBe(3);
    expect(actions.receive).toHaveBeenCalledTimes(3);
  });
  it('shows validation errors, opens the details section, and focuses the invalid field', async () => {
    await mount(products[0]!.id); await scan('IMEI-ONE');
    await type('[name="warrantyDuration"]', '121'); await click(button('Review receipt'));
    const warranty = query<HTMLInputElement>('[name="warrantyDuration"]');
    expect(warranty.getAttribute('aria-invalid')).toBe('true');
    expect(warranty.closest('details')!.open).toBe(true);
    expect(document.activeElement).toBe(warranty);
    expect(actions.preflight).not.toHaveBeenCalled();
    expect(actions.receive).not.toHaveBeenCalled();
  });
  it('freezes the draft during preflight and presents conflicts inline', async () => {
    let resolve!: (result: object) => void;
    actions.preflight.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await mount(products[0]!.id); await scan('IMEI-ONE'); await click(button('Review receipt'));
    expect(query<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
    await scan('IMEI-TWO');
    await act(async () => resolve({ conflicts: [{ serialNo: 'IMEI-ONE', status: 'SOLD' }] }));
    expect(query<HTMLInputElement>('[name="serialNumbers"]').value).toBe('IMEI-ONE');
    expect(container.textContent).toContain('Sold');
    expect(container.querySelector('dialog')).toBeNull();
  });
  it('keeps the key and confirmation for a retry, and blocks duplicate confirm clicks', async () => {
    actions.receive.mockResolvedValueOnce({ error: 'Temporary failure' });
    await mount(products[1]!.id); await type('[name="quantity"]', '2'); await click(button('Review receipt'));
    const key = query<HTMLInputElement>('[name="idempotencyKey"]').value;
    await click(button('Yes, receive stock'));
    expect(query('dialog').textContent).toContain('Temporary failure');
    expect(query<HTMLInputElement>('[name="idempotencyKey"]').value).toBe(key);
    await act(async () => { button('Yes, receive stock').click(); button('Yes, receive stock').click(); });
    expect(actions.receive).toHaveBeenCalledTimes(2);
    expect(actions.receive.mock.calls[1]![1].get('idempotencyKey')).toBe(key);
  });
  it('shows server field errors after confirmation and preserves entered units', async () => {
    actions.receive.mockResolvedValueOnce({ fieldErrors: { quantity: 'Invalid quantity' } });
    await mount(products[1]!.id); await type('[name="quantity"]', '2'); await click(button('Review receipt')); await click(button('Yes, receive stock'));
    expect(container.querySelector('dialog')).toBeNull();
    expect(query<HTMLInputElement>('[name="quantity"]').value).toBe('2');
    expect(container.textContent).toContain('Enter a whole quantity greater than zero.');
  });
  it('wraps Tab inside confirmation and restores focus to its opener on Escape', async () => {
    await mount(products[1]!.id); await type('[name="quantity"]', '2');
    const review = button('Review receipt');
    await act(async () => review.focus()); await click(review);
    const confirm = button('Yes, receive stock');
    await act(async () => {
      confirm.focus();
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(button('Go back'));
    await act(async () => query('dialog').dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })));
    expect(document.activeElement).toBe(review);
  });
  it('renders the new Bengali copy', async () => {
    await mount(products[0]!.id, 'bn');
    expect(container.textContent).toContain('রসিদের সারাংশ');
    await scan('ONE'); await scan('ONE');
    expect(container.textContent).toContain('ONE এই রসিদে ইতিমধ্যে আছে।');
  });
});
