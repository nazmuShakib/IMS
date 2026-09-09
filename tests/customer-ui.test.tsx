// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerRegister } from '@/components/customers/CustomerRegister';
import { CreateCustomerForm } from '@/components/customers/CreateCustomerForm';
import CustomersError from '@/app/(dashboard)/customers/error';
import { I18nProvider } from '@/components/i18n/I18nProvider';
const mocks = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/actions/checkout', () => ({ createCustomerAction: mocks.create }));
let root: Root; let container: HTMLDivElement;
const node = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const button = (text: string) => [...container.querySelectorAll('button')].find(el => el.textContent === text)!;
const click = async (el: HTMLElement) => { await act(async () => el.click()); };
async function change(selector: string, value: string) {
  const el = node<HTMLInputElement>(selector);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function mount(element: React.ReactNode, locale: 'en' | 'bn' = 'en') { await act(async () => root.render(<I18nProvider locale={locale}>{element}</I18nProvider>)); }
const props = { confirmedQuery: '', customers: [{ id: 'c1', name: 'Ali', phone: '01712345678', isActive: false }], meta: { page: 1, pageSize: 25, pageCount: 5, totalCount: 125 } };
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; mocks.push.mockReset(); mocks.create.mockReset(); window.history.replaceState(null, '', '/customers'); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('submits only explicitly, avoids duplicate navigation, and preserves draft search on paging and refresh', async () => {
  await mount(<CustomerRegister {...props} />);
  await click(button('Search')); expect(mocks.push).not.toHaveBeenCalled();
  await change('[name="q"]', 'Draft'); expect(mocks.push).not.toHaveBeenCalled();
  await click(button('Next')); expect(mocks.push).toHaveBeenLastCalledWith('/customers?page=2', { scroll: false });
  await mount(<CustomerRegister {...props} meta={{ ...props.meta, page: 2 }} />);
  expect(node<HTMLInputElement>('[name="q"]').value).toBe('Draft');
  await mount(<CustomerRegister {...props} meta={{ ...props.meta, page: 2 }} customers={[...props.customers]} />);
  expect(node<HTMLInputElement>('[name="q"]').value).toBe('Draft');
  await click(button('Search')); expect(mocks.push).toHaveBeenLastCalledWith('/customers?q=Draft', { scroll: false });
});
it('clears search with page size retained and restores input on browser traversal', async () => {
  await mount(<CustomerRegister {...props} confirmedQuery="Ali" meta={{ ...props.meta, page: 2, pageSize: 50 }} />);
  await click(button('Clear search')); expect(mocks.push).toHaveBeenLastCalledWith('/customers?pageSize=50', { scroll: false });
  await act(async () => { window.history.replaceState(null, '', '/customers?q=Restored&page=2'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(node<HTMLInputElement>('[name="q"]').value).toBe('Restored');
});
it('preserves return context and exposes descriptive history links and inactive labels', async () => {
  await mount(<CustomerRegister {...props} confirmedQuery="Ali" meta={{ ...props.meta, page: 2 }} />);
  expect(node('a[aria-label="View history for Ali"]').getAttribute('href')).toContain('returnTo=%2Fcustomers%3Fq%3DAli%26page%3D2');
  expect(container.textContent).toContain('Inactive'); expect(container.textContent).toContain('125 matching customers');
});
it('focuses, traps, and restores dialog focus and reports client validation', async () => {
  await mount(<CustomerRegister {...props} />); const trigger = button('Add customer'); trigger.focus(); await click(trigger);
  expect(document.activeElement).toBe(node('[name="name"]'));
  await click(button('Create customer')); expect(mocks.create).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(node('[name="name"]'));
  expect(node('[name="name"]').getAttribute('aria-describedby')).toBe(node('[role="dialog"] [id$="name-error"]').id);
  await act(async () => { node('[name="name"]').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(button('Cancel'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(node('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it('freezes the form and dismissal during save, then offers a persistent link without changing the filter', async () => {
  let resolve!: (value: object) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  await mount(<CustomerRegister {...props} confirmedQuery="Unrelated" />); await click(button('Add customer'));
  await change('[name="name"]', 'New customer'); await change('[name="phone"]', '01712345678'); await click(button('Create customer'));
  expect(node('fieldset').hasAttribute('disabled')).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(node('[role="dialog"]')).not.toBeNull();
  await act(async () => resolve({ ok: 'New customer created.', customerId: 'new-id' }));
  expect(node('[role="dialog"]')).toBeNull(); expect(container.textContent).toContain('Customer created.');
  expect(node<HTMLInputElement>('[name="q"]').value).toBe('Unrelated');
  expect(node('a[href^="/customers/new-id"]')).not.toBeNull();
  await click(node('[aria-label="Dismiss notification"]')); expect(container.textContent).not.toContain('Customer created.');
});
it('retains duplicate-phone rejection and checkout selection callback', async () => {
  mocks.create.mockResolvedValueOnce({ error: 'That phone number already belongs to Ali.' });
  const created = vi.fn(); await mount(<CreateCustomerForm submitLabel="Create & select" onCreated={created} />);
  await change('[name="name"]', 'New'); await change('[name="phone"]', '01712345678'); await click(button('Create & select'));
  expect(node<HTMLInputElement>('[name="name"]').value).toBe('New'); expect(node('[role="alert"]').textContent).toContain('already belongs'); expect(created).not.toHaveBeenCalled();
  mocks.create.mockResolvedValueOnce({ ok: 'New created.', customerId: 'c2' }); await click(button('Create & select'));
  expect(created).toHaveBeenCalledExactlyOnceWith('c2'); expect(node<HTMLInputElement>('[name="name"]').value).toBe('');
});
it('localizes the directory and retry recovery', async () => {
  await mount(<CustomerRegister {...props} />, 'bn'); expect(container.textContent).toContain('ক্রেতা যোগ করুন'); expect(container.textContent).toContain('নিষ্ক্রিয়');
  const reset = vi.fn(); await mount(<CustomersError error={new Error('secret')} reset={reset} />, 'bn');
  expect(container.textContent).not.toContain('secret'); await click(button('আবার চেষ্টা করুন')); expect(reset).toHaveBeenCalledOnce(); expect(node('a').getAttribute('href')).toBe('/customers');
});
it('retains mounted results and disables interactions during navigation', async () => {
  let resolve!: () => void; mocks.push.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  await mount(<CustomerRegister {...props} />); await change('[name="q"]', 'Ali'); await click(button('Search'));
  expect(container.textContent).toContain('View history'); expect(node('[aria-busy="true"]')).not.toBeNull();
  expect(node('[inert]')).not.toBeNull(); expect(node<HTMLInputElement>('[name="q"]').disabled).toBe(true);
  await act(async () => resolve()); expect(node('[inert]')).toBeNull();
});
it('focuses rejected server fields and hides stale feedback on editing', async () => {
  mocks.create.mockResolvedValueOnce({ fieldErrors: { phone: 'Mobile unavailable.' } });
  await mount(<CreateCustomerForm />); await change('[name="name"]', 'New'); await change('[name="phone"]', '01712345678'); await click(button('Create customer'));
  expect(document.activeElement).toBe(node('[name="phone"]')); expect(container.textContent).toContain('Mobile unavailable.');
  await change('[name="phone"]', '01812345678'); expect(container.textContent).not.toContain('Mobile unavailable.');
});
