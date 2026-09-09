'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Archive, Pencil, RotateCcw } from 'lucide-react';
import { setBrandActive, setCategoryActive, updateBrand, updateCategory, type ActionState } from '@/actions/catalog';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { CatalogPagination, CatalogResults, type PageMeta } from './CatalogPagination';
import { useCatalogNavigation } from './useCatalogNavigation';
import { TAXONOMY_DEFAULTS, type TaxonomyFilters, type TaxonomyPageRow } from '@/lib/catalog-taxonomy';
import { catalogUrl } from '@/lib/catalog-query';
import { taxonomyNameError } from '@/lib/taxonomy-form';

type Kind = 'brand' | 'category';
type Filters = TaxonomyFilters & { parent: string };
const productsUrl = (kind: Kind, id: string, active = false) => `/products?${kind}=${encodeURIComponent(id)}&status=${active ? 'active' : 'all'}`;
export function TaxonomyManager({ kind, items, canManage, confirmedFilters, meta, catalogCount, resultVersion }: {
  kind: Kind; items: TaxonomyPageRow[]; canManage: boolean; confirmedFilters: Filters;
  meta: PageMeta; catalogCount: number; resultVersion: string;
}) {
  const { t } = useI18n(); const path = kind === 'brand' ? '/brands' : '/categories';
  const { values, setValues, pending, navigate } = useCatalogNavigation(path, confirmedFilters, resultVersion);
  useEffect(() => { window.history.replaceState(null, '', catalogUrl(path, { ...confirmedFilters }, meta)); }, [path, confirmedFilters, meta.page, meta.pageSize, resultVersion]);
  const [selection, setSelection] = useState<{ item: TaxonomyPageRow; editing: boolean } | null>(null);
  const [notice, setNotice] = useState(''); const list = useRef<HTMLDivElement>(null);
  const bind = (key: keyof Filters) => ({ value: values[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues(current => ({ ...current, [key]: event.target.value })) });
  const applied = Object.entries(confirmedFilters).filter(([key, value]) => value !== TAXONOMY_DEFAULTS[key as keyof Filters]).length;
  return <>
    <Card className="mb-4 p-4">
      <form onSubmit={event => { event.preventDefault(); navigate(values, { page: 1, pageSize: meta.pageSize }); }}>
        <fieldset disabled={pending}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label={t('common.search')}><Input type="search" {...bind('query')} placeholder={t(kind === 'brand' ? 'catalog.searchBrands' : 'catalog.searchCategories')} /></Field>
            <Field label={t('common.status')}><Select {...bind('status')}><option value="active">{t('catalog.activeOnly')}</option><option value="removed">{t('catalog.removedOnly')}</option><option value="all">{t('catalog.allStatuses')}</option></Select></Field>
            <Field label={t('catalog.usage')}><Select {...bind('usage')}><option value="all">{t('catalog.allUsage')}</option><option value="used">{t('catalog.withProducts')}</option><option value="unused">{t('catalog.withoutProducts')}</option></Select></Field>
            <Field label={t('catalog.orderBy')}><Select {...bind('order')}>
              <option value="newest">{t('catalog.newestCreated')}</option><option value="oldest">{t('catalog.oldestCreated')}</option><option value="products-desc">{t('catalog.mostProducts')}</option><option value="products-asc">{t('catalog.fewestProducts')}</option><option value="name-asc">{t('catalog.nameAscending')}</option><option value="name-desc">{t('catalog.nameDescending')}</option>
            </Select></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-graphite">{t('catalog.appliedFilters', { count: applied })}{values.parent && <span className="ml-2">{t('taxonomy.childrenFilter')}</span>}</p>
            <div className="flex gap-2"><Button type="submit">{t('common.applyFilters')}</Button><Button type="button" variant="ghost" onClick={() => { setValues(TAXONOMY_DEFAULTS); navigate(TAXONOMY_DEFAULTS, { page: 1, pageSize: meta.pageSize }); }}>{t('common.reset')}</Button></div>
          </div>
        </fieldset>
      </form>
    </Card>
    {notice && <p role="status" className="mb-3 text-[13px] text-ok">{notice} <Link href={path} className="ml-2 text-signal underline">{t('taxonomy.showActive')}</Link></p>}
    <Card className="overflow-hidden">
      <CatalogResults pending={pending} version={resultVersion} loadingLabel={kind === 'brand' ? 'Loading brands…' : 'Loading categories…'}>
        <div ref={list} role="region" tabIndex={0} aria-label={t(kind === 'brand' ? 'nav.brands' : 'nav.categories')} className="contextual-scroll-area min-h-44 max-h-[min(62dvh,40rem)] overflow-y-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal">
          {!items.length ? <EmptyState title={t(catalogCount === 0 ? kind === 'brand' ? 'catalog.noBrands' : 'catalog.noCategories' : 'catalog.noFilterMatch')} /> : <ul>{items.map(item => <li key={item.id} className={`flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-3 last:border-0 hover:bg-signal-wash ${item.isActive ? '' : 'bg-plate/40'}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words text-[13px] font-medium [overflow-wrap:anywhere]">{item.name}</span>{!item.isActive && <span className="rounded-full bg-plate px-2 py-0.5 text-[11px] text-graphite">{t('catalog.removed')}</span>}</div>
              {item.parentName && <p className="mt-1 text-[11px] text-graphite">{t('taxonomy.parent', { name: item.parentName })}</p>}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                <Link href={productsUrl(kind, item.id)} className="text-signal underline underline-offset-2">{t('catalog.productCount', { count: item.productCount, kind: t(item.productCount === 1 ? 'catalog.productSingle' : 'catalog.productPlural') })}</Link>
                <span className="text-graphite">{t('taxonomy.activeProducts', { count: item.activeProductCount })}</span>
                {item.activeChildCount > 0 && <Link href={`/categories?parent=${encodeURIComponent(item.id)}`} className="text-signal underline">{t('taxonomy.activeChildren', { count: item.activeChildCount })}</Link>}
              </div>
            </div>
            {canManage && <div className="flex shrink-0 gap-2">
              <button type="button" className="inline-flex size-7 items-center justify-center rounded-[3px] border border-rule bg-card text-ink hover:bg-plate focus-visible:outline-2 focus-visible:outline-signal" aria-label={t('taxonomy.editNamed', { name: item.name })} title={t('common.edit')} onClick={() => setSelection({ item, editing: true })}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className={`inline-flex size-7 items-center justify-center rounded-[3px] border border-rule bg-card focus-visible:outline-2 focus-visible:outline-signal ${item.isActive ? 'text-out hover:bg-out-wash' : 'text-ink hover:bg-plate'}`} aria-label={t(item.isActive ? 'taxonomy.removeNamed' : 'taxonomy.restoreNamed', { name: item.name })} title={t(item.isActive ? 'catalog.remove' : 'catalog.restore')} onClick={() => setSelection({ item, editing: false })}>{item.isActive ? <Archive size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}</button>
            </div>}
          </li>)}</ul>}
        </div>
      </CatalogResults>
      <CatalogPagination meta={meta} label={t(kind === 'brand' ? 'nav.brands' : 'nav.categories')} pending={pending} onChange={page => navigate(confirmedFilters, page)} />
    </Card>
    {selection && <TaxonomyDialog kind={kind} {...selection} onClose={() => setSelection(null)} onSaved={text => { setNotice(text); setSelection(null); requestAnimationFrame(() => { if (document.activeElement === document.body) list.current?.focus(); }); }} />}
  </>;
}

function TaxonomyDialog({ kind, item, editing, onClose, onSaved }: { kind: Kind; item: TaxonomyPageRow; editing: boolean; onClose: () => void; onSaved: (text: string) => void }) {
  const { t, message } = useI18n(); const id = useId();
  const [name, setName] = useState(item.name); const [error, setError] = useState<string>();
  const action = editing ? kind === 'brand' ? updateBrand : updateCategory : kind === 'brand' ? setBrandActive : setCategoryActive;
  const [state, submit, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await action(prev, fd); setError(result.fieldErrors?.name);
    if (result.fieldErrors?.name) requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('input[name=name]')?.focus());
    return result;
  }, {});
  const dialog = useModalDialog(true, () => { if (!pending) onClose(); }, editing ? 'input[name="name"]' : '[data-dialog-cancel]');
  useEffect(() => { if (!pending && state.ok) onSaved(`${message(state.ok)} ${state.savedName ?? item.name}`); }, [pending, state, onSaved, message, item.name]);
  const blocked = !editing && item.isActive && (item.activeProductCount > 0 || item.activeChildCount > 0);
  const title = t(editing ? kind === 'brand' ? 'catalog.editBrand' : 'catalog.editCategory' : item.isActive ? 'catalog.confirmRemove' : 'catalog.confirmRestore');
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} aria-busy={pending} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl">
      <h2 id={`${id}-title`} className="text-[16px] font-semibold">{title}</h2>
      <p id={`${id}-help`} className="mb-5 mt-1 text-[12px] text-graphite">{t(editing ? 'catalog.editTaxonomyHelp' : item.isActive ? 'catalog.removeTaxonomyHelp' : 'catalog.restoreTaxonomyHelp')}</p>
      <form action={submit} onSubmit={event => { if (editing) { const invalid = taxonomyNameError(name); if (invalid) { event.preventDefault(); setError(invalid); dialog.current?.querySelector<HTMLInputElement>('input[name=name]')?.focus(); } } }}>
        <input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={item.isActive ? 'false' : 'true'} />
        {state.error && <p role="alert" className="mb-3 text-[13px] text-out">{message(state.error)}</p>}
        {editing ? <Field inputId={`${id}-name`} label={t('common.name')} error={error && message(error)} errorId={`${id}-error`}><Input id={`${id}-name`} name="name" required maxLength={100} disabled={pending} value={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setName(event.target.value); if (error) setError(taxonomyNameError(event.target.value)); }} /></Field> : <p className="break-words text-[14px] font-medium">{item.name}</p>}
        {state.existing && !state.existing.isActive && <Link className="mt-3 inline-block text-[12px] text-signal underline" href={`/${kind === 'brand' ? 'brands' : 'categories'}?status=removed&query=${encodeURIComponent(state.existing.name)}`}>{t('taxonomy.showRemoved')}</Link>}
        {blocked && <div className="mt-3 space-y-2 text-[12px] text-graphite">
          {item.activeProductCount > 0 && <p>{t('taxonomy.productBlocker', { count: item.activeProductCount })} <Link href={productsUrl(kind, item.id, true)} className="text-signal underline">{t('taxonomy.viewProducts')}</Link></p>}
          {item.activeChildCount > 0 && <p>{t('taxonomy.childBlocker', { count: item.activeChildCount })} <Link href={`/categories?parent=${encodeURIComponent(item.id)}`} className="text-signal underline">{t('taxonomy.viewChildren')}</Link></p>}
        </div>}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" data-dialog-cancel variant="ghost" disabled={pending} onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" variant={!editing && item.isActive ? 'danger' : 'primary'} disabled={pending || blocked}>{t(pending ? 'common.saving' : editing ? 'common.saveChanges' : item.isActive ? 'catalog.remove' : 'catalog.restore')}</Button></div>
      </form>
    </div>
  </div>, document.body);
}
