// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/actions/reconciliation', () => ({ checkStockAction: mocks.check }));
import { StockConsistencyWorkspace } from '@/components/stock/StockConsistencyWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { consistencyReport, type StockConsistencyReport } from '@/lib/reconciliation';
let root: Root, container: HTMLDivElement;
const report = (count = 30, checkedAt = '2026-09-11T18:30:00Z') => consistencyReport(checkedAt, count + 5, Array.from({ length: count }, (_, index) => ({
  productId: `p${index}`, name: `Glass ${index}`, sku: `SKU-${String(index).padStart(2, '0')}`, trackingType: 'QUANTITY' as const, onHand: 2, ledgerSum: 1, drift: 1,
})));
const get = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === label)!;
const click = async (node: HTMLElement) => { await act(async () => node.click()); };
async function mount(value: StockConsistencyReport | null = report(), locale: 'en' | 'bn' = 'en') {
  await act(async () => root.render(<I18nProvider locale={locale}><StockConsistencyWorkspace initialReport={value} /></I18nProvider>));
}
async function search(value: string) {
  const input = get<HTMLInputElement>('#consistency-search');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(button('Apply filters'));
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.check.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('shows report totals, paginates discrepancies and searches without changing the check snapshot', async () => {
  await mount(); expect(get('tbody').children).toHaveLength(25); expect(container.textContent).toContain('Stock records don’t match for 30 products.');
  await click(button('Next')); expect(get('tbody').children).toHaveLength(5);
  await search('SKU-00'); expect(get('tbody').children).toHaveLength(1); expect(container.textContent).toContain('Stock records don’t match for 30 products.');
  await search('missing'); expect(container.textContent).toContain('No matching discrepancies.'); expect(container.textContent).not.toContain('Stock records match.');
  await click(button('Reset')); expect(get('tbody').children).toHaveLength(25); expect(mocks.check).not.toHaveBeenCalled();
});
it('keeps results and timestamp on rerun failure, prevents duplicates, and replaces them on retry', async () => {
  await mount(); const oldTime = get('dl').textContent;
  let finish!: (value: unknown) => void; mocks.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click(button('Run check again')); await click(button('Run check again'));
  expect(mocks.check).toHaveBeenCalledTimes(1); expect(button('Run check again').disabled).toBe(true); expect(get<HTMLFieldSetElement>('fieldset').disabled).toBe(true);
  expect(get('tbody').children).toHaveLength(25); expect(container.textContent).toContain('Checking stock records…');
  await act(async () => finish({ error: 'consistency.failed' }));
  expect(get('[role=alert]').textContent).toContain('Showing the previous successful result.'); expect(get('dl').textContent).toBe(oldTime);
  mocks.check.mockResolvedValueOnce({ report: report(0, '2026-09-12T01:00:00Z') }); await click(button('Run check again'));
  expect(container.textContent).toContain('Stock records match.'); expect(container.querySelector('table')).toBeNull(); expect(container.querySelector('[role=alert]')).toBeNull(); expect(get('dl').textContent).not.toBe(oldTime);
});
it('distinguishes initial failure, empty inventory and a healthy inventory', async () => {
  await mount(null); expect(container.textContent).toContain('The check couldn’t be completed.'); expect(container.textContent).not.toContain('Stock records match.');
  mocks.check.mockRejectedValueOnce(Error('Network')); await click(button('Run check again')); expect(button('Run check again').disabled).toBe(false);
  await mount(consistencyReport('2026-09-12T00:00:00Z', 0, [])); expect(container.textContent).toContain('No products to check yet.');
  await mount(report(0)); expect(container.textContent).toContain('Stock records match.');
});
it('opens responsive details with investigation links and restores focus after dismissal', async () => {
  await mount(report(1)); const trigger = button('Details'); trigger.focus(); await click(trigger);
  const modal = get('[role=dialog]'); expect(modal.textContent).toContain('Quantity'); expect(modal.textContent).toContain('+1');
  expect(modal.querySelector('a[href="/stock/movements?product=p0"]')).not.toBeNull(); expect(modal.querySelector('a[href="/products/p0"]')).not.toBeNull();
  expect(document.activeElement).toBe(get('[aria-label=Close]'));
  const links = modal.querySelectorAll('a'); (links[1] as HTMLElement).focus();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))); expect(document.activeElement).toBe(get('[aria-label=Close]'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(trigger);
  await click(trigger); await act(async () => get('[role=dialog]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); expect(document.querySelector('[role=dialog]')).not.toBeNull();
  await act(async () => get('[role=dialog]').parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(container.querySelectorAll('article')).toHaveLength(1);
});
it('renders Bengali labels, Dhaka dates, and no cost information', async () => {
  await mount(report(1), 'bn'); expect(container.textContent).toContain('স্টকের সামঞ্জস্য'); expect(container.textContent).toContain('১২');
  await click(button('বিস্তারিত')); expect(get('[role=dialog]').textContent).toContain('রেকর্ড করা স্টক'); expect(get('[role=dialog]').textContent).not.toContain('ক্রয়মূল্য');
});
