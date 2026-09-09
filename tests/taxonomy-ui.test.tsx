// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { TaxonomyManager } from '@/components/catalog/TaxonomyManager';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { TAXONOMY_DEFAULTS, type TaxonomyPageRow } from '@/lib/catalog-taxonomy';
const mocks = vi.hoisted(() => ({ edit: vi.fn(), status: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/catalog', () => ({ updateCategory: mocks.edit, updateBrand: mocks.edit, setCategoryActive: mocks.status, setBrandActive: mocks.status }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
let root: Root; let host: HTMLDivElement;
const node = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const button = (name: string) => [...document.querySelectorAll('button')].find(el => el.textContent === name)!;
async function click(el: HTMLElement) { await act(async () => el.click()); }
async function change(selector: string, value: string) { const el = node<HTMLInputElement>(selector); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function mount(element: React.ReactNode, locale: 'en' | 'bn' = 'en') { await act(async () => root.render(<I18nProvider locale={locale}>{element}</I18nProvider>)); }
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; window.history.replaceState(null, '', '/categories'); vi.clearAllMocks(); mocks.edit.mockResolvedValue({ fieldErrors: { name: 'This name already exists.' } }); mocks.status.mockResolvedValue({ ok: 'Category removed.' }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const item: TaxonomyPageRow = { id: 'c1', name: 'Phones', slug: 'phones', isActive: true, productCount: 3, activeProductCount: 0, activeChildCount: 0, parentId: null, parentName: null, createdAt: '2026-01-01' };
const props = { kind: 'category' as const, items: [item], canManage: true, confirmedFilters: TAXONOMY_DEFAULTS, meta: { page: 1, pageSize: 25, pageCount: 4, totalCount: 81 }, catalogCount: 90, resultVersion: '1' };
it.each(['category', 'brand'] as const)('preserves rejected %s creation, validates names and clears only after success', async taxonomyKind => {
  await mount(<QuickCreateForm taxonomyKind={taxonomyKind} action={mocks.edit} fields={[{ name: 'name', label: 'Name', required: true }]} submitLabel="Add" />);
  await change('[name=name]', 'Entered'); await click(button('Add'));
  expect(node<HTMLInputElement>('[name=name]').value).toBe('Entered'); expect(node('[name=name]').getAttribute('aria-invalid')).toBe('true');
  await change('[name=name]', '   '); await click(button('Add')); expect(mocks.edit).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('Enter a name.');
  mocks.edit.mockResolvedValue({ ok: 'Category created.', savedName: 'মোবাইল' }); await change('[name=name]', 'মোবাইল'); await click(button('Add'));
  expect(node<HTMLInputElement>('[name=name]').value).toBe(''); expect(host.textContent).toContain('মোবাইল');
});
it('preserves supplier fields on failure without applying taxonomy name limits', async () => {
  await mount(<QuickCreateForm action={mocks.edit} fields={[{ name: 'name', label: 'Name' }, { name: 'phone', label: 'Phone' }]} submitLabel="Add" />);
  await change('[name=name]', 'Supplier'); await change('[name=phone]', '01712345678'); await click(button('Add'));
  expect(node<HTMLInputElement>('[name=phone]').value).toBe('01712345678'); expect(node('[name=name]').hasAttribute('maxlength')).toBe(false);
});
it('freezes create input while saving and links to removed duplicates', async () => {
  let resolve!: (value: any) => void; mocks.edit.mockImplementation(() => new Promise(done => { resolve = done; }));
  await mount(<QuickCreateForm taxonomyKind="brand" action={mocks.edit} fields={[{ name: 'name', label: 'Name' }]} submitLabel="Add" />);
  await change('[name=name]', 'Old'); await click(button('Add')); expect(node('fieldset').disabled).toBe(true);
  await act(async () => resolve({ fieldErrors: { name: 'This name belongs to a removed record. Restore it instead.' }, existing: { id: 'b1', name: 'Old', isActive: false } }));
  expect(node('a').getAttribute('href')).toBe('/brands?status=removed&query=Old');
});
it('retains rejected edits, traps/restores focus, and drops stale errors on reopening', async () => {
  await mount(<TaxonomyManager {...props} />); const trigger = node<HTMLButtonElement>('[aria-label="Edit Phones"]'); trigger.focus(); await click(trigger);
  expect(document.activeElement).toBe(node('[name=name]')); await change('[name=name]', 'Changed'); await click(button('Save changes'));
  expect(node<HTMLInputElement>('[name=name]').value).toBe('Changed');
  button('Save changes').focus(); await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(node('[name=name]')); await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBe(trigger); await click(trigger); expect(node<HTMLInputElement>('[name=name]').value).toBe('Phones'); expect(node('[role=dialog]').textContent).not.toContain('This name already exists.');
});
it('focuses Cancel, explains active dependencies, and does not submit blocked removal', async () => {
  await mount(<TaxonomyManager {...props} items={[{ ...item, activeProductCount: 2, activeChildCount: 1 }]} />); await click(node('[aria-label="Remove Phones"]'));
  expect(document.activeElement).toBe(button('Cancel')); expect(button('Remove').disabled).toBe(true); expect(node('[role=dialog]').textContent).toContain('2 active products');
  expect(node('[role=dialog] a').getAttribute('href')).toContain('status=active'); await click(button('Remove')); expect(mocks.status).not.toHaveBeenCalled();
});
it('announces removal after its row disappears and preserves archived product links', async () => {
  await mount(<TaxonomyManager {...props} />); expect(node('li a').getAttribute('href')).toContain('status=all'); await click(node('[aria-label="Remove Phones"]')); await click(button('Remove'));
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(host.textContent).toContain('Category removed. Phones');
  await mount(<TaxonomyManager {...props} items={[]} resultVersion="2" />); expect(host.textContent).toContain('Category removed. Phones');
});
it('uses applied URL filters for pagination, retains drafts and canonicalizes clamped pages', async () => {
  await mount(<TaxonomyManager {...props} />); await change('[type=search]', 'Draft'); await click(button('Next')); expect(location.search).toBe('?page=2'); expect(node('fieldset').disabled).toBe(true); expect(host.textContent).toContain('Loading categories…');
  await mount(<TaxonomyManager {...props} meta={{ ...props.meta, page: 2 }} resultVersion="2" />); expect(node<HTMLInputElement>('[type=search]').value).toBe('Draft'); await click(button('Apply filters')); expect(location.search).toBe('?query=Draft');
  await mount(<TaxonomyManager {...props} confirmedFilters={{ ...TAXONOMY_DEFAULTS, query: 'Draft' }} resultVersion="3" />); await click(button('Reset')); expect(location.search).toBe('');
});
it('keeps STAFF read-only and translates controls and validation', async () => {
  await mount(<TaxonomyManager {...props} canManage={false} />, 'bn'); expect(document.querySelector('[aria-label="Edit Phones"]')).toBeNull(); expect(host.textContent).toContain('ফিল্টার প্রয়োগ করুন'); expect(node('select').options.length).toBe(3);
});

it.each([['category', 1], ['category', 2], ['brand', 1], ['brand', 2]] as const)('does not refresh or lose drafts when clicking the current %s page %s', async (kind, page) => {
  await mount(<TaxonomyManager {...props} kind={kind} meta={{ ...props.meta, page }} />);
  await change('[type=search]', 'Unsubmitted draft');
  const url = location.href; const historyLength = history.length;
  const current = node<HTMLButtonElement>('button[aria-current=page]');
  expect(current.getAttribute('aria-disabled')).toBe('true');
  await click(current);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(location.href).toBe(url); expect(history.length).toBe(historyLength);
  expect(node<HTMLInputElement>('[type=search]').value).toBe('Unsubmitted draft');
  expect(node<HTMLFieldSetElement>('fieldset').disabled).toBe(false);
  expect(node('[aria-busy]').getAttribute('aria-busy')).toBe('false');
  await click(node(`button[aria-label="Go to page ${page === 1 ? 2 : 1}"]`));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
