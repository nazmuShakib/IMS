// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ExpenseWorkspace } from '@/components/expenses/ExpenseWorkspace';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { expensePageFromRows, expenseUrl, parseExpenseQuery, type ExpenseQuery } from '@/lib/expense-query';
import { expenseCategories, expenseFixture, expenseFixtures } from './expense-fixtures';
const mocks = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn(), update: vi.fn(), void: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/actions/expenses', () => ({ createExpenseAction: mocks.create, updateExpenseAction: mocks.update, voidExpenseAction: mocks.void, createExpenseCategoryAction: mocks.createCategory, updateExpenseCategoryAction: mocks.updateCategory }));
let root: Root, container: HTMLDivElement;
const node = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const button = (name: string) => [...container.querySelectorAll('button')].find(b => b.textContent === name)!;
const click = async (el: HTMLElement) => act(async () => el.click());
async function change(selector: string, value: string) {
  const el = node<HTMLInputElement>(selector);
  await act(async () => { Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function mount(query = parseExpenseQuery({}), extra: Partial<React.ComponentProps<typeof ExpenseWorkspace>> = {}) {
  await act(async () => root.render(<I18nProvider locale="en"><ExpenseWorkspace role="ADMIN" query={query} result={expensePageFromRows(expenseFixtures(60), expenseCategories, query)} categories={expenseCategories} users={[{ id: 'user1', name: 'Manager' }]} {...extra} /></I18nProvider>));
}
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); mocks.create.mockResolvedValue({ error: 'Rejected' }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('submits explicitly, exports applied filters, and preserves drafts across pagination and refresh', async () => {
  const q = parseExpenseQuery({}); await mount(q); await click(button('Apply filters')); expect(mocks.push).not.toHaveBeenCalled();
  await change('[name=query]', 'draft'); expect(node<HTMLAnchorElement>('a[href*=csv]').href).not.toContain('draft');
  await click(button('Next')); expect(mocks.push).toHaveBeenLastCalledWith('/expenses?page=2', { scroll: false });
  await mount({ ...q, page: 2 }); expect(node<HTMLInputElement>('[name=query]').value).toBe('draft');
  await mount({ ...q, page: 2 }); expect(node<HTMLInputElement>('[name=query]').value).toBe('draft');
  await click(button('Apply filters')); expect(mocks.push).toHaveBeenLastCalledWith('/expenses?query=draft', { scroll: false });
});
it('restores applied filters on history changes and resets without dates while retaining page size', async () => {
  const q = parseExpenseQuery({ from: '2026-09-01', pageSize: '50' }); await mount(q); await change('[name=query]', 'draft');
  await mount({ ...q, from: '2026-08-01' }); expect(node<HTMLInputElement>('[name=query]').value).toBe(''); expect(node<HTMLInputElement>('[name=from]').value).toBe('2026-08-01');
  await mount(q); expect(node<HTMLInputElement>('[name=from]').value).toBe('2026-09-01'); await click(button('Reset')); expect(mocks.push).toHaveBeenLastCalledWith('/expenses?pageSize=50', { scroll: false });
});
it('keeps grouping applied until submission and renders three semantic summaries', async () => {
  await mount(); await change('[name=groupBy]', 'category'); expect(container.textContent).not.toContain('Expenses by category');
  await mount(parseExpenseQuery({ groupBy: 'category' })); expect(container.textContent).toContain('Expenses by category'); expect(container.textContent).toContain('Voided entries'); expect(container.textContent).not.toContain('Lowest expense');
});
it('focuses invalid inputs, retains rejected values, traps focus and restores the trigger', async () => {
  await mount(); const trigger = button('Add expense'); trigger.focus(); await click(trigger);
  expect(document.activeElement).toBe(node('[role=dialog] [name=expenseDate]'));
  await click(button('Save')); expect(document.activeElement).toBe(node('[role=dialog] [name=categoryId]')); expect(node('[role=dialog] [name=categoryId]').getAttribute('aria-describedby')).toBeTruthy();
  await change('[role=dialog] [name=categoryId]', 'rent'); await change('[role=dialog] [name=description]', 'Valid rent'); await change('[role=dialog] [name=amount]', '125.25');
  await click(button('Save')); expect(mocks.create).toHaveBeenCalledTimes(1); expect(node<HTMLInputElement>('[role=dialog] [name=description]').value).toBe('Valid rent'); expect(node('[role=alert]').textContent).toBe('Rejected');
  const close = node<HTMLButtonElement>('[role=dialog] button[aria-label=Close]'); close.focus(); await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))); expect(document.activeElement).toBe(button('Save'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(node('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it('blocks editing and dismissal during saving and announces success with expense number', async () => {
  let resolve!: (value: unknown) => void; mocks.create.mockReturnValue(new Promise(r => { resolve = r; }));
  await mount(); await click(button('Add expense')); await change('[role=dialog] [name=categoryId]', 'rent'); await change('[role=dialog] [name=description]', 'Valid rent'); await change('[role=dialog] [name=amount]', '50');
  await click(button('Save')); expect(node('[role=dialog] [name=description]').matches(':disabled')).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(node('[role=dialog]')).toBeTruthy(); expect(button('Cancel').matches(':disabled')).toBe(true);
  await act(async () => resolve({ ok: 'Saved', reference: 'EXP-2026-00999' })); expect(node('[role=dialog]')).toBeTruthy(); expect(node('[role=dialog]').textContent).toContain('EXP-2026-00999'); expect(container.querySelectorAll('header + [role=status]')).toHaveLength(0); await click(button('Close')); expect(node('[role=dialog]')).toBeNull();
});
it('shows voided notes in read-only details and keeps manager void controls unavailable', async () => {
  const q = parseExpenseQuery({}), row = expenseFixture({ status: 'VOIDED', voidReason: 'Duplicate', voidedById: 'user1', voidedAt: '2026-09-10T06:00:00.000Z' });
  await mount(q, { role: 'MANAGER', result: expensePageFromRows([row], expenseCategories, q) });
  await click(node('button[aria-label^="View details EXP"]')); expect(node('[role=dialog]').textContent).toContain('Keep this note'); expect(node('[role=dialog]').textContent).toContain('Duplicate'); expect(node('[role=dialog]').textContent).toContain('Manager'); expect(container.querySelector('[aria-label^="Void EXP"]')).toBeNull();
});
it('allows invalid URL filters to be reset even when their fallback query is all dates', async () => {
  await mount(parseExpenseQuery({}), { initialErrors: { from: 'Enter a valid calendar date.' }, invalidValues: { from: 'invalid' } }); await click(button('Reset')); expect(mocks.push).toHaveBeenLastCalledWith('/expenses', { scroll: false });
});
it('disables exports and keeps results mounted under the common loader during navigation', async () => {
  let resolve!: () => void; mocks.push.mockReturnValue(new Promise<void>(r => { resolve = r; })); await mount(); await change('[name=query]', 'rent'); await click(button('Apply filters'));
  expect(node('[aria-busy=true]')).toBeTruthy(); expect(node('table')).toBeTruthy(); expect(node('[aria-busy=true] [inert]')).toBeTruthy(); expect(node('a[aria-disabled=true]')).toBeTruthy(); expect(button('Add expense').disabled).toBe(true);
  await act(async () => resolve());
});
it('retains category rejection, blocks dismissal while saving, and submits reactivation explicitly', async () => {
  let resolve!: (state: unknown) => void; mocks.createCategory.mockReturnValue(new Promise(r => { resolve = r; }));
  mocks.updateCategory.mockResolvedValue({ ok: 'Saved', reference: 'Old category' });
  await mount(); await click(button('Manage expense categories'));
  await change('[role=dialog] [name=name]', 'Duplicate name'); await click(button('Add'));
  expect(node('[role=dialog] button[aria-label=Close]').matches(':disabled')).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(node('[role=dialog]')).toBeTruthy();
  await act(async () => resolve({ fieldErrors: { name: 'An expense category with this name already exists.' } }));
  expect(node<HTMLInputElement>('[role=dialog] [name=name]').value).toBe('Duplicate name'); expect(document.activeElement).toBe(node('[role=dialog] [name=name]'));
  await click(button('Reactivate')); const data = mocks.updateCategory.mock.calls[0]![1] as FormData; expect(data.get('categoryId')).toBe('old'); expect(data.get('isActive')).toBe('true');
});
it('does not shift focus to another invalid field while correcting input', async () => {
  await mount(); await click(button('Add expense')); await click(button('Save')); await change('[role=dialog] [name=categoryId]', 'rent');
  const description = node<HTMLInputElement>('[role=dialog] [name=description]'); description.focus(); await change('[role=dialog] [name=description]', 'First character'); expect(document.activeElement).toBe(description);
});
