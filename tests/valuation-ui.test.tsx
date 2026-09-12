// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/actions/reconciliation', () => ({ checkStockAction: mocks.check }));
import { StockConsistencyWorkspace } from '@/components/stock/StockConsistencyWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { consistencyReport } from '@/lib/reconciliation';
import { valuationFromRows, type ValuationData } from '@/lib/valuation-consistency';
let root: Root, container: HTMLDivElement;
const get = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const click = async (node: HTMLElement) => { await act(async () => node.click()); };
const data = (): ValuationData => ({ products: [{ id: 'p', name: 'Glass', sku: 'GLASS', trackingType: 'QUANTITY', quantityOnHand: 40, avgCostPrice: 3100 }], units: [], expenses: [], acquisitions: [], movements: [{ id: 'm', productId: 'p', unitId: null, reason: 'PURCHASE', quantity: 40, unitCost: 3000, reversesId: null, createdAt: '2026-09-01T00:00:00.000Z', idempotencyKey: 'receipt' }] });
async function mount(input = data(), locale: 'en' | 'bn' = 'en') {
  const report = { ...consistencyReport('2026-09-12T04:00:00.000Z', input.products.length, []), valuation: valuationFromRows(input) };
  await act(async () => root.render(<I18nProvider locale={locale}><StockConsistencyWorkspace initialReport={report} /></I18nProvider>));
  return report;
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.check.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('shows value differences even when quantities match and links details to the ledger', async () => {
  await mount(); const panel = get('[aria-labelledby=valuation-title]');
  expect(panel.textContent).toContain('Products with valuation differences: 1.'); expect(container.textContent).toContain('Stock records match.');
  expect(panel.textContent).toContain('1,240.00'); expect(panel.textContent).toContain('1,200.00'); expect(panel.textContent).toContain('40.00');
  await click(get('[aria-label="View valuation difference for Glass"]'));
  expect(get('[role=dialog]').textContent).toContain('Expected value'); expect(get('[role=dialog] a[href="/stock/movements?product=p"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('displays missing history as unverified and does not claim an exact expected total', async () => {
  const input = data(); input.movements = []; await mount(input);
  expect(get('[aria-labelledby=valuation-title]').textContent).toContain('could not be verified');
  expect(container.textContent).not.toContain('Inventory valuation matches.');
  await click(get('[aria-label="View valuation difference for Glass"]')); expect(get('[role=dialog]').textContent).toContain('receipt history needed');
  await act(async () => get('[role=dialog]').parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); expect(document.querySelector('[role=dialog]')).toBeNull();
});
it('keeps the previous valuation on failed reruns and replaces it only on success', async () => {
  const previous = await mount(); const run = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === 'Run check again')!;
  mocks.check.mockResolvedValueOnce({ error: 'consistency.failed' }); await click(run);
  expect(get('[role=alert]').textContent).toContain('previous successful result'); expect(container.textContent).toContain('1,240.00');
  const input = data(); input.products[0]!.avgCostPrice = 3000;
  mocks.check.mockResolvedValueOnce({ report: { ...previous, checkedAt: '2026-09-12T05:00:00.000Z', valuation: valuationFromRows(input) } }); await click(run);
  expect(container.textContent).toContain('Inventory valuation matches.'); expect(container.textContent).not.toContain('1,240.00');
});
it('renders Bengali valuation labels', async () => {
  await mount(data(), 'bn'); expect(container.textContent).toContain('স্টকের মূল্য যাচাই'); expect(container.textContent).toContain('প্রত্যাশিত মূল্য');
});
