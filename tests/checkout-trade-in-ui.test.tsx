// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutWorkspace, type CheckoutLine, type CheckoutProductOption, type CheckoutUnitOption } from '@/components/checkout/CheckoutWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import type { CartDraft, Customer, TradeInCartDraft } from '@/domain/types';
import { usedDeviceFieldsSchema, usedDeviceFormInput } from '@/lib/used-device-form';
const mocks = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn(), checkout: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/used-devices', () => ({ saveTradeInDraftAction: mocks.save, acceptUsedDeviceAction: vi.fn() }));
vi.mock('@/actions/checkout', () => ({ checkoutAction: mocks.checkout, clearTradeInDraftAction: mocks.clear, expireCartDraftAction: vi.fn(), discardCartAction: vi.fn() }));
vi.mock('@/components/customers/CreateCustomerForm', () => ({ CreateCustomerForm: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
const productId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const draft: TradeInCartDraft = {
  productId, serialNo: 'INCOMING', grade: 'GRADE_B', batteryHealth: null, inspectionResults: { imeiMatches: 'WORKING', activationLockClear: 'WORKING' },
  knownDefects: null, includedAccessories: null, askingPrice: 2500000, warrantyMonths: null, warrantyDays: 15, location: null,
  sellerName: 'Seller', sellerPhone: '01712345678', identificationType: null, identificationNumber: null, acquisitionValue: 2000000, reference: null, note: null,
};
const cart = { id: '44444444-4444-4444-8444-444444444444', actorId: 'manager', tradeInDraft: draft, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } satisfies CartDraft;
const products: CheckoutProductOption[] = [{ id: productId, name: 'Phone', sku: 'PHONE', trackingType: 'SERIAL', onHand: 1, barcode: '12345', listUnitPrice: 4000000, staffMaxDiscount: 0 }];
const units: CheckoutUnitOption[] = [{ id: unitId, productId, productName: 'Phone', sku: 'PHONE', serialNo: 'OUTGOING', usedGrade: null, listUnitPrice: 4000000, staffMaxDiscount: 0, knownDefects: null, warrantyMonths: null, warrantyDays: null }];
const line: CheckoutLine = { ...units[0], id: 'line', unitId, trackingType: 'SERIAL', quantity: 1, actualUnitPrice: 3500000, position: 0, onHand: 1 };
const customers = [{ id: customerId, name: 'Customer', phone: '01812345678', isActive: true, identificationType: null, identificationNumber: null }] as Customer[];
let root: Root; let container: HTMLDivElement;
const storageKey = 'ims:checkout-draft:v1:manager';
const button = (name: string) => [...document.querySelectorAll('button')].find(item => item.textContent === name)!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function mount() { await act(async () => root.render(<I18nProvider locale="en"><CheckoutWorkspace cart={cart} shopName="Shop" shopLogoDataUri={null} lines={[]} products={products} units={units} customers={customers} role="MANAGER" /></I18nProvider>)); }
function stored() { return JSON.parse(window.localStorage.getItem(storageKey)!); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); this.querySelector<HTMLElement>('button, input')?.focus(); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.localStorage.clear();
  window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, cartId: cart.id, updatedAt: Date.now(), lines: [line], customerId, saleMode: 'CASH', emiDownPayment: '0', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PAID', tradeInPayoutMethod: 'CASH', reference: 'SALE-REF', note: 'Keep this note' }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.save.mockReset().mockImplementation(async (_previous: unknown, data: FormData) => ({ tradeInDraft: usedDeviceFieldsSchema.parse(usedDeviceFormInput(data, 'trade-in')), ok: 'saved' }));
  mocks.clear.mockReset().mockResolvedValue({ ok: 'Removed' }); mocks.checkout.mockReset(); mocks.refresh.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.localStorage.clear(); });
describe('trade-in integrated with checkout', () => {
  it('keeps earlier sale time across trade-in editing and focuses invalid dates', async () => {
    const data = stored(); data.saleTiming = 'earlier'; data.saleOccurredAt = ''; window.localStorage.setItem(storageKey, JSON.stringify(data));
    await mount();
    const review = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Complete sale'))!;
    expect(review).toBeTruthy();
    await click(review);
    expect(document.activeElement?.id).toBe('actual-sale-time');
    expect(document.querySelector('#actual-sale-time')?.getAttribute('aria-invalid')).toBe('true');
    const value = new Date(Date.now() - 3600_000 + 6 * 3600_000).toISOString().slice(0, 16);
    await act(async () => { const el = document.querySelector('#actual-sale-time')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(button('Edit trade-in')); await click(document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!);
    expect(stored().saleOccurredAt).toBe(value);
    expect(new FormData(document.querySelector<HTMLFormElement>('#checkout-form')!).get('saleOccurredAt')).toBe(value);
    await click(review);
    expect(document.querySelector('#complete-sale-description')?.textContent).toContain('Report month');
    expect((document.querySelector('#actual-sale-time') as HTMLInputElement).disabled).toBe(true);
  });
  it('preserves customer, cart, discount, payment, and notes across saving and removing', async () => {
    await mount(); const before = stored();
    await click(button('Edit trade-in'));
    const form = document.querySelector('dialog form')!;
    expect(form.parentElement?.closest('form')).toBeNull();
    const credit = form.querySelector<HTMLInputElement>('[name="acquisitionValue"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(credit, '21000'); credit.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(button('Save trade-in'));
    expect(document.querySelector('dialog')).toBeNull(); expect(document.body.textContent).toContain('৳21,000.00');
    expect(document.activeElement).toBe(button('Edit trade-in'));
    for (const key of ['lines', 'customerId', 'paymentMethod', 'reference', 'note']) expect(stored()[key]).toEqual(before[key]);
    await click(button('Remove trade-in')); await click(button('Yes, remove trade-in'));
    expect(mocks.clear).toHaveBeenCalledOnce(); expect(button('Add trade-in')).toBeTruthy();
    for (const key of ['lines', 'customerId', 'paymentMethod', 'reference', 'note']) expect(stored()[key]).toEqual(before[key]);
  });
  it('clears the old local sale when the server provides a replacement cart', async () => {
    await mount();
    const replacement = { ...cart, id: '55555555-5555-4555-8555-555555555555', tradeInDraft: null };
    await act(async () => root.render(<I18nProvider locale="en"><CheckoutWorkspace cart={replacement} shopName="Shop" shopLogoDataUri={null} lines={[]} products={products} units={units} customers={customers} role="MANAGER" /></I18nProvider>));
    expect(stored().cartId).toBe(replacement.id);
    expect(stored().lines).toEqual([]);
    expect(stored().customerId).toBe('');
    expect(stored().note).toBe('');
    expect(stored().paymentMethod).toBe('CASH');
    expect(button('Add trade-in')).toBeTruthy();
  });
  it('does not route an incoming phone scan into the outgoing cart while the panel is open', async () => {
    await mount(); const before = stored().lines;
    await click(button('Edit trade-in'));
    await act(async () => {
      for (const key of ['F9', ...'OUTGOING', 'Enter']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    expect(stored().lines).toEqual(before); expect(mocks.save).not.toHaveBeenCalled();
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!); expect(document.querySelector('dialog')).toBeNull(); expect(stored().lines).toEqual(before);
  });
});
