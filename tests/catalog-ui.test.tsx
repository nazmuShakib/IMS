// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ProductForm } from '@/components/catalog/ProductForm';
import { ProductRegister } from '@/components/catalog/ProductRegister';
import { SerializedUnitRegister } from '@/components/catalog/SerializedUnitRegister';
import { ArchiveProductControl } from '@/components/catalog/ArchiveProductControl';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { StockCount } from '@/components/ui/StockCount';
import { TableViewport } from '@/components/ui/TableViewport';
import { PRODUCT_DEFAULTS, UNIT_DEFAULTS } from '@/lib/catalog-query';
import { toProductUnitDTO } from '@/lib/dto';
import { products, units, categoryId } from './catalog-fixtures';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), archive: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/actions/catalog', () => ({ archiveProductWithFeedback: mocks.archive }));
vi.mock('@/components/stock/RefurbishmentExpenseForm', () => ({ RefurbishmentExpenseForm: () => null }));
vi.mock('@/components/stock/UsedDeviceDetailsForm', () => ({ UsedDeviceDetailsForm: () => null }));
let root: Root; let container: HTMLDivElement;
const node = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (text: string) => [...document.querySelectorAll('button')].find(el => el.textContent === text)!;
async function click(el: HTMLElement) { await act(async () => el.click()); }
async function change(selector: string, value: string) {
  const el = node<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function mount(element: React.ReactNode, locale: 'en' | 'bn' = 'en') { await act(async () => root.render(<I18nProvider locale={locale}>{element}</I18nProvider>)); }
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, '', '/products');
  mocks.refresh.mockReset(); mocks.archive.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const formProps = { categories: [{ id: categoryId, name: 'Phones', isActive: true } as any], brands: [], canManageStaffDiscount: true };
const registerProps = { confirmedFilters: PRODUCT_DEFAULTS, categories: [], brands: [], showCosts: true, resultVersion: '1', meta: { page: 1, pageSize: 25, pageCount: 4, totalCount: 81 } };
const unitProps = { units: units.slice(0, 25).map(u => toProductUnitDTO(u, 'ADMIN')), productId: 'p-1', showCosts: true, locale: 'en' as const, productActive: true, confirmedFilters: UNIT_DEFAULTS, meta: { page: 1, pageSize: 25, pageCount: 3, totalCount: 61 }, unitCount: 61, inStock: 40, targetStatus: null, targetUnit: '', resultVersion: '1' };
describe('catalog form and register behavior', () => {
  it.each([false, true])('preserves every entered field after a rejected save (editing=%s)', async editing => {
    const action = vi.fn(async () => ({ fieldErrors: { sku: 'This code already exists.' } }));
    await mount(<ProductForm {...formProps} product={editing ? products[1] : undefined} action={action} />);
    for (const [name, value] of Object.entries({ sku: 'ENTERED', name: 'Entered name', barcode: '123456', description: 'Entered description', model: 'Entered model', categoryId, defaultCostPrice: '100', defaultSalePrice: '200', staffMaxDiscount: '10', reorderPoint: '7' })) await change(`[name="${name}"]`, value);
    const before = [...new FormData(node('form')).entries()];
    await click(button(editing ? 'Save changes' : 'Create product'));
    expect(action).toHaveBeenCalledTimes(1);
    expect([...new FormData(node('form')).entries()]).toEqual(before);
    expect(node('[name="sku"]').getAttribute('aria-invalid')).toBe('true');
    await change('[name="sku"]', '');
    expect(node('[name="sku"]').getAttribute('aria-invalid')).toBe('true');
    await change('[name="sku"]', 'VALID-NEW');
    expect(node('[name="sku"]').getAttribute('aria-invalid')).toBe('false');
  });
  it('rejects noninteger reorder points and invalid money before submitting', async () => {
    const action = vi.fn(async () => ({}));
    await mount(<ProductForm {...formProps} product={products[1]} action={action} />);
    await change('[name="reorderPoint"]', '1.5'); await change('[name="defaultCostPrice"]', 'oops');
    await click(button('Save changes'));
    expect(action).not.toHaveBeenCalled();
    expect(node('[name="reorderPoint"]').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(node('[name="defaultCostPrice"]'));
  });
  it('generates a barcode into controlled state and freezes pending form controls', async () => {
    let resolve!: (value: {}) => void;
    const action = vi.fn(() => new Promise<{}>(done => { resolve = done; }));
    await mount(<ProductForm {...formProps} product={products[1]} action={action} />);
    await click(button('Generate'));
    expect(node<HTMLInputElement>('[name="barcode"]').value).toMatch(/^\d{15}$/);
    await click(button('Save changes'));
    expect(node('fieldset').hasAttribute('disabled')).toBe(true);
    await act(async () => resolve({}));
  });
  it('retains draft filters across paging while navigating with applied filters', async () => {
    await mount(<ProductRegister {...registerProps}><TableViewport><table><tbody><tr><td>Existing rows</td></tr></tbody></table></TableViewport></ProductRegister>);
    await change('input[type="search"]', 'Draft'); await click(button('Next'));
    expect(window.location.search).toBe('?page=2');
    expect(node('fieldset').hasAttribute('disabled')).toBe(true);
    expect(container.textContent).toContain('Existing rows');
    await mount(<ProductRegister {...registerProps} meta={{ ...registerProps.meta, page: 2 }} resultVersion="2"><p>New page</p></ProductRegister>);
    expect(node<HTMLInputElement>('input[type="search"]').value).toBe('Draft');
    await click(button('Apply filters'));
    expect(window.location.search).toBe('?q=Draft');
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
  it('resets filters to page 1 while retaining the page size and handles history traversal', async () => {
    const props = { ...registerProps, meta: { ...registerProps.meta, page: 2, pageSize: 50 }, confirmedFilters: { ...PRODUCT_DEFAULTS, q: 'Phone' } };
    await mount(<ProductRegister {...props}><p>Rows</p></ProductRegister>);
    await click(button('Reset')); expect(window.location.search).toBe('?pageSize=50');
    await mount(<ProductRegister {...props} confirmedFilters={PRODUCT_DEFAULTS} resultVersion="2"><p>Rows</p></ProductRegister>);
    await act(async () => { window.history.replaceState(null, '', '/products?q=Phone&page=2&pageSize=50'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await mount(<ProductRegister {...props} resultVersion="3"><p>Rows</p></ProductRegister>);
    expect(node<HTMLInputElement>('input[type="search"]').value).toBe('Phone');
  });
  it('keeps all unit filters visible and removes stock actions on archived products', async () => {
    await mount(<SerializedUnitRegister {...unitProps} productActive={false} />);
    expect(document.querySelector('a[href^="/checkout"]')).toBeNull();
    expect(document.querySelectorAll('select').length).toBe(5);
    expect(container.textContent).toContain('Showing 1–25 of 61');
    await mount(<SerializedUnitRegister {...unitProps} productActive={false} units={[]} unitCount={0} meta={{ ...unitProps.meta, pageCount: 1, totalCount: 0 }} resultVersion="2" />);
    expect(document.querySelector('a[href^="/stock/in"]')).toBeNull();
    expect(button('Apply filters')).toBeDefined();
    expect(button('Next').disabled).toBe(true);
  });
  it('validates unit ranges without sending a request and only applies explicit submissions', async () => {
    await mount(<SerializedUnitRegister {...unitProps} />);
    const cost = document.querySelectorAll('input[inputmode="decimal"]');
    cost[0]!.setAttribute('data-testid', 'min'); cost[1]!.setAttribute('data-testid', 'max');
    await change('[data-testid="min"]', '200'); await change('[data-testid="max"]', '100');
    expect(mocks.refresh).not.toHaveBeenCalled();
    await click(button('Apply filters'));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Maximum cost must be at least');
    await change('[data-testid="max"]', '300'); await click(button('Apply filters'));
    expect(window.location.search).toContain('minCost=200');
  });
  it('resolves old hash-only links and canonicalizes server-resolved targets', async () => {
    window.history.replaceState(null, '', '/products/p-1#unit-u-60');
    await mount(<SerializedUnitRegister {...unitProps} />);
    expect(window.location.search).toBe('?unit=u-60');
    await mount(<SerializedUnitRegister {...unitProps} units={[toProductUnitDTO(units[60]!, 'ADMIN')]} targetUnit="u-60" targetStatus="found" meta={{ ...unitProps.meta, page: 3 }} resultVersion="2" />);
    expect(window.location.search).toBe('?page=3'); expect(window.location.hash).toBe('#unit-u-60');
  });
  it('names, traps focus in, and restores focus from the inspection dialog', async () => {
    await mount(<SerializedUnitRegister {...unitProps} />);
    const trigger = [...document.querySelectorAll('button')].find(el => el.textContent?.includes('View condition and acquisition details'))!;
    await act(async () => trigger.focus()); await click(trigger);
    const dialog = node('[role="dialog"]');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBeTruthy();
    const close = node<HTMLButtonElement>('[aria-label="Close"]'); expect(document.activeElement).toBe(close);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it('requires archive confirmation and shows server errors without closing the dialog', async () => {
    mocks.archive.mockResolvedValue({ error: 'Failed' });
    await mount(<ArchiveProductControl productId="p-1" />); await click(button('Archive'));
    expect(mocks.archive).not.toHaveBeenCalled(); await click(button('Cancel'));
    expect(mocks.archive).not.toHaveBeenCalled(); await click(button('Archive'));
    await click(node<HTMLButtonElement>('[role="alertdialog"] button[type="submit"]'));
    expect(mocks.archive).toHaveBeenCalledTimes(1); expect(node('[role="alert"]').textContent).toContain('Could not archive');
  });
  it('localizes stock status and scroll-region labels in Bangla', async () => {
    await mount(<TableViewport><StockCount onHand={0} reorderPoint={5} /><StockCount onHand={1} reorderPoint={5} /></TableViewport>, 'bn');
    expect(node('[role="region"]').getAttribute('aria-label')).toBe('স্ক্রলযোগ্য সারণি');
    expect(container.textContent).toContain('স্টক নেই'); expect(container.textContent).toContain('কম');
  });
});
