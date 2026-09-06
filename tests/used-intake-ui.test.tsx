// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsedDeviceIntakeForm } from '@/components/stock/UsedDeviceIntakeForm';
import { TradeInPanel } from '@/components/checkout/TradeInPanel';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { usedDeviceFieldsSchema, usedDeviceFormInput } from '@/lib/used-device-form';
import type { Customer, TradeInCartDraft } from '@/domain/types';
import type { UsedDeviceActionState } from '@/actions/used-devices';
const actions = vi.hoisted(() => ({ purchase: vi.fn(), tradeIn: vi.fn() }));
vi.mock('@/actions/used-devices', () => ({ acceptUsedDeviceAction: actions.purchase, saveTradeInDraftAction: actions.tradeIn }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
const products = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Pixel Phone', sku: 'PIXEL', model: 'Pixel 9', barcode: '1234' }];
const draft: TradeInCartDraft = {
  productId: products[0].id, serialNo: 'USED-ONE', grade: 'GRADE_A', batteryHealth: 0,
  inspectionResults: { imeiMatches: 'WORKING', activationLockClear: 'WORKING' },
  cosmeticCondition: { screen: 'LIGHT_SCRATCHES', frame: null, back: null, note: 'Near the edge' },
  knownDefects: null, includedAccessories: null, askingPrice: 2500000, warrantyMonths: null, warrantyDays: 15,
  location: null, sellerName: 'Seller', sellerPhone: '01712345678', identificationType: null, identificationNumber: null,
  acquisitionValue: 2000000, reference: null, note: null,
};
let root: Root;
let container: HTMLDivElement;
const query = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (name: string) => [...document.querySelectorAll('button')].find(button => button.textContent === name)!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function change(name: string, value: string) {
  const element = query<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function mountTrade(overrides: Partial<React.ComponentProps<typeof UsedDeviceIntakeForm>> = {}, locale: 'en' | 'bn' = 'en') {
  const onSaved = vi.fn();
  await act(async () => root.render(<I18nProvider locale={locale}><UsedDeviceIntakeForm mode="trade-in" products={products} cartId="cart" initialDraft={draft} checkoutContext={{ isEmi: false, total: 3000000, downPayment: 0 }} onSaved={onSaved} {...overrides as object} /></I18nProvider>));
  return onSaved;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); this.querySelector<HTMLElement>('button, input')?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  actions.purchase.mockReset(); actions.tradeIn.mockReset().mockImplementation(async (_previous: UsedDeviceActionState, data: FormData) => {
    const value = usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, 'trade-in'));
    return { tradeInDraft: value, ok: 'used.tradeInSaved' };
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('shared intake and checkout panel interactions', () => {
  it('edits and saves a trade-in directly, including appearance, exact warranty, and zero battery health', async () => {
    const onSaved = await mountTrade();
    expect(query<HTMLInputElement>('[name="batteryHealth"]').value).toBe('0');
    await change('cosmetic.back', 'LIGHT_SCRATCHES');
    await click(button('Save trade-in'));
    expect(actions.purchase).not.toHaveBeenCalled(); expect(actions.tradeIn).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ grade: 'GRADE_A', warrantyDays: 15, askingPrice: 2500000, cosmeticCondition: expect.objectContaining({ back: 'LIGHT_SCRATCHES' }) }));
  });
  it('opens sections initially and validates ownership beside the bottom action', async () => {
    await mountTrade();
    expect([...document.querySelectorAll('form details')].every(section => (section as HTMLDetailsElement).open)).toBe(true);
    const checkbox = query<HTMLInputElement>('[name="ownershipConfirmed"]');
    const controls = [...query('form').querySelectorAll('input:not([type="hidden"]), select, textarea')];
    expect(controls.at(-1)).toBe(checkbox);
    await click(checkbox);
    await click(button('Save trade-in'));
    expect(actions.tradeIn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(checkbox);
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(checkbox.getAttribute('aria-describedby')!)?.textContent).toBe('Confirm that the seller owns the device.');
  });
  it('expands the optional section and focuses the first invalid field', async () => {
    await mountTrade();
    query('[name="location"]').closest('details')!.open = false;
    await change('location', 'x'.repeat(101));
    await click(button('Save trade-in'));
    const number = query<HTMLInputElement>('[name="location"]');
    expect(number.closest('details')!.open).toBe(true); expect(document.activeElement).toBe(number);
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(number.getAttribute('aria-describedby')!)).not.toBeNull();
    expect(actions.tradeIn).not.toHaveBeenCalled();
  });
  it('rejects malformed amounts before saving, with focus and inline feedback', async () => {
    await mountTrade(); await change('acquisitionValue', '12abc34'); await click(button('Save trade-in'));
    expect(actions.tradeIn).not.toHaveBeenCalled(); expect(document.activeElement).toBe(query('[name="acquisitionValue"]'));
    expect(document.body.textContent).toContain('Enter a valid amount.');
  });
  it('checks EMI credit while editing without changing the manual grade', async () => {
    await mountTrade({ checkoutContext: { isEmi: true, total: 1000000, downPayment: 0 } });
    await click(button('Save trade-in'));
    expect(actions.tradeIn).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('cannot exceed the EMI total');
    expect(query<HTMLSelectElement>('[name="grade"]').value).toBe('GRADE_A');
  });
  it('fills empty seller fields explicitly without overwriting existing details', async () => {
    await mountTrade({ customer: { name: 'Checkout customer', phone: '01812345678', identificationType: 'NID', identificationNumber: '12345678' } as Customer });
    await click(button('Use checkout customer details'));
    expect(query<HTMLInputElement>('[name="sellerName"]').value).toBe('Seller');
    expect(query<HTMLInputElement>('[name="sellerPhone"]').value).toBe('01712345678');
    expect(query<HTMLInputElement>('[name="identificationNumber"]').value).toBe('12345678');
  });
  it('freezes pending inputs, ignores duplicate clicks, and retries with the same key', async () => {
    let resolve!: (state: UsedDeviceActionState) => void;
    actions.tradeIn.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await mountTrade(); const key = query<HTMLInputElement>('[name="idempotencyKey"]').value;
    await act(async () => { button('Save trade-in').click(); button('Save trade-in')?.click(); });
    expect(actions.tradeIn).toHaveBeenCalledTimes(1); expect(query<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
    expect(query<HTMLInputElement>('[name="ownershipConfirmed"]').disabled).toBe(true);
    await act(async () => resolve({ error: 'Temporary error' }));
    expect(query<HTMLInputElement>('[name="ownershipConfirmed"]').disabled).toBe(false);
    expect(query<HTMLInputElement>('[name="serialNo"]').value).toBe('USED-ONE');
    await click(button('Save trade-in'));
    expect(actions.tradeIn).toHaveBeenCalledTimes(2);
    expect((actions.tradeIn.mock.calls[1][1] as FormData).get('idempotencyKey')).toBe(key);
  });
  it('warns before discarding edited panel fields and leaves the saved draft untouched', async () => {
    const onClose = vi.fn(); const onSaved = vi.fn();
    await act(async () => root.render(<I18nProvider locale="en"><TradeInPanel cartId="cart" draft={draft} products={products} customer={null} context={{ isEmi: false, total: 3000000, downPayment: 0 }} onSaved={onSaved} onClose={onClose} /></I18nProvider>));
    await change('acquisitionValue', '21000'); await click(query('[aria-label="Close"]'));
    expect(onClose).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('Discard unsaved changes?');
    await click(button('Keep editing')); expect(query<HTMLInputElement>('[name="acquisitionValue"]').value).toBe('21000');
    await click(query('[aria-label="Close"]')); await click(button('Discard changes'));
    expect(onClose).toHaveBeenCalledOnce(); expect(onSaved).not.toHaveBeenCalled(); expect(draft.acquisitionValue).toBe(2000000);
  });
  it('uses localized appearance and action labels in Bangla', async () => {
    await mountTrade({}, 'bn');
    expect(document.body.textContent).toContain('হালকা আঁচড়'); expect(document.body.textContent).toContain('ট্রেড-ইন সংরক্ষণ করুন');
  });
  it('requires receipt review before committing a direct purchase', async () => {
    await act(async () => root.render(<I18nProvider locale="en"><UsedDeviceIntakeForm mode="purchase" products={products} /></I18nProvider>));
    const combo = query<HTMLInputElement>('[role="combobox"]'); await act(async () => combo.focus());
    await act(async () => query('[role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))); 
    for (const [name, value] of Object.entries({ serialNo: 'DIRECT-1', grade: 'GRADE_B', sellerName: 'Seller', sellerPhone: '01712345678', acquisitionValue: '20000', askingPrice: '25000', 'inspection.imeiMatches': 'WORKING', 'inspection.activationLockClear': 'WORKING' })) await change(name, value);
    await click(query('[name="ownershipConfirmed"]')); await click(button('Review receipt'));
    expect(actions.purchase).not.toHaveBeenCalled(); expect(query('dialog').getAttribute('aria-labelledby')).toBeTruthy();
    const dialog = query('dialog'); const first = dialog.querySelector<HTMLElement>('summary')!;
    await act(async () => { first.focus(); dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(button('Accept into stock'));
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    actions.purchase.mockResolvedValue({ error: 'Retry later' }); await click(button('Accept into stock'));
    expect(actions.purchase).toHaveBeenCalledOnce(); expect(query('dialog').textContent).toContain('Retry later');
  });
});
