'use client';

import { useActionState, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  setBrandActive,
  setCategoryActive,
  updateBrand,
  updateCategory,
  type ActionState,
} from '@/actions/catalog';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import {
  filterTaxonomyItems,
  type TaxonomyListItem,
  type TaxonomyOrder,
  type TaxonomyStatusFilter,
  type TaxonomyUsageFilter,
} from '@/lib/catalog-taxonomy';

type TaxonomyKind = 'brand' | 'category';

export function TaxonomyManager({
  kind,
  items,
  canManage,
}: {
  kind: TaxonomyKind;
  items: TaxonomyListItem[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TaxonomyStatusFilter>('active');
  const [usage, setUsage] = useState<TaxonomyUsageFilter>('all');
  const [order, setOrder] = useState<TaxonomyOrder>('newest');
  const filtered = useMemo(
    () => filterTaxonomyItems(items, { query, status, usage, order }),
    [items, query, status, usage, order],
  );

  const reset = () => {
    setQuery('');
    setStatus('active');
    setUsage('all');
    setOrder('newest');
  };

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label={t('common.search')}>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(kind === 'brand' ? 'catalog.searchBrands' : 'catalog.searchCategories')}
            />
          </Field>
          <Field label={t('common.status')}>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as TaxonomyStatusFilter)}
            >
              <option value="active">{t('catalog.activeOnly')}</option>
              <option value="removed">{t('catalog.removedOnly')}</option>
              <option value="all">{t('catalog.allStatuses')}</option>
            </Select>
          </Field>
          <Field label={t('catalog.usage')}>
            <Select
              value={usage}
              onChange={(event) => setUsage(event.target.value as TaxonomyUsageFilter)}
            >
              <option value="all">{t('catalog.allUsage')}</option>
              <option value="used">{t('catalog.withProducts')}</option>
              <option value="unused">{t('catalog.withoutProducts')}</option>
            </Select>
          </Field>
          <Field label={t('catalog.orderBy')}>
            <Select
              value={order}
              onChange={(event) => setOrder(event.target.value as TaxonomyOrder)}
            >
              <option value="newest">{t('catalog.newestCreated')}</option>
              <option value="oldest">{t('catalog.oldestCreated')}</option>
              <option value="products-desc">{t('catalog.mostProducts')}</option>
              <option value="products-asc">{t('catalog.fewestProducts')}</option>
              <option value="name-asc">{t('catalog.nameAscending')}</option>
              <option value="name-desc">{t('catalog.nameDescending')}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="tnum text-[12px] text-graphite">
            {t('catalog.filteredCount', { shown: filtered.length, total: items.length })}
          </p>
          <Button type="button" variant="ghost" onClick={reset}>
            {t('common.reset')}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div
          role="region"
          tabIndex={0}
          aria-label={t(kind === 'brand' ? 'nav.brands' : 'nav.categories')}
          className="max-h-[min(62dvh,40rem)] overflow-y-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal"
        >
          {filtered.length === 0 ? (
            <EmptyState
              title={t(
                items.length === 0
                  ? kind === 'brand'
                    ? 'catalog.noBrands'
                    : 'catalog.noCategories'
                  : 'catalog.noFilterMatch',
              )}
            />
          ) : (
            <ul>
              {filtered.map((item) => (
                <TaxonomyRow key={item.id} kind={kind} item={item} canManage={canManage} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

function TaxonomyRow({
  kind,
  item,
  canManage,
}: {
  kind: TaxonomyKind;
  item: TaxonomyListItem;
  canManage: boolean;
}) {
  const { t } = useI18n();

  return (
    <li
      className={`flex flex-col gap-3 border-b border-rule-soft px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between ${
        item.isActive ? '' : 'bg-plate/40'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">{item.name}</span>
          <span
            className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              item.isActive
                ? 'border-ok/25 bg-ok-wash text-ok'
                : 'border-graphite/25 bg-plate text-graphite'
            }`}
          >
            {item.isActive ? t('common.active') : t('catalog.removed')}
          </span>
        </div>
        {kind === 'category' && (
          <p className="tnum mt-0.5 break-all text-[11px] text-graphite">{item.slug}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="tnum mr-1 text-[12px] text-graphite">
          {t('catalog.productCount', {
            count: item.productCount,
            kind: t(item.productCount === 1 ? 'catalog.productSingle' : 'catalog.productPlural'),
          })}
        </span>
        {canManage && <TaxonomyActions kind={kind} item={item} />}
      </div>
    </li>
  );
}

function TaxonomyActions({ kind, item }: { kind: TaxonomyKind; item: TaxonomyListItem }) {
  const { t, message } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const editAction = kind === 'brand' ? updateBrand : updateCategory;
  const statusAction = kind === 'brand' ? setBrandActive : setCategoryActive;
  const [editState, submitEdit, editingPending] = useActionState<ActionState, FormData>(editAction, {});
  const [statusState, submitStatus, statusPending] = useActionState<ActionState, FormData>(statusAction, {});

  useEffect(() => {
    if (!editingPending && editState.ok) setEditing(false);
  }, [editState.ok, editingPending]);
  useEffect(() => {
    if (statusState.ok) setConfirmingStatus(false);
  }, [statusState.ok]);
  useEffect(() => {
    if (!editing && !confirmingStatus) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || editingPending || statusPending) return;
      setEditing(false);
      setConfirmingStatus(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [editing, confirmingStatus, editingPending, statusPending]);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
        {t('common.edit')}
      </Button>
      <Button
        type="button"
        variant={item.isActive ? 'danger' : 'ghost'}
        onClick={() => setConfirmingStatus(true)}
      >
        {item.isActive ? t('catalog.remove') : t('catalog.restore')}
      </Button>

      {editing && (
        <ModalShell
          title={t(kind === 'brand' ? 'catalog.editBrand' : 'catalog.editCategory')}
          description={t('catalog.editTaxonomyHelp')}
          pending={editingPending}
          onClose={() => setEditing(false)}
        >
          <form action={submitEdit}>
            <input type="hidden" name="id" value={item.id} />
            {editState.error && <ActionError value={message(editState.error)} />}
            <Field label={t('common.name')} error={editState.fieldErrors?.name}>
              <Input name="name" required defaultValue={item.name} autoFocus />
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={editingPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={editingPending}>
                {editingPending ? t('common.saving') : t('common.saveChanges')}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}

      {confirmingStatus && (
        <ModalShell
          title={t(item.isActive ? 'catalog.confirmRemove' : 'catalog.confirmRestore')}
          description={t(item.isActive ? 'catalog.removeTaxonomyHelp' : 'catalog.restoreTaxonomyHelp')}
          pending={statusPending}
          onClose={() => setConfirmingStatus(false)}
        >
          <form action={submitStatus}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value={item.isActive ? 'false' : 'true'} />
            {statusState.error && <ActionError value={message(statusState.error)} />}
            <p className="text-[14px] font-medium">{item.name}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmingStatus(false)} disabled={statusPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant={item.isActive ? 'danger' : 'primary'} disabled={statusPending}>
                {statusPending
                  ? t('common.saving')
                  : t(item.isActive ? 'catalog.remove' : 'catalog.restore')}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

function ActionError({ value }: { value: string }) {
  return (
    <p className="mb-3 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
      {value}
    </p>
  );
}

function ModalShell({
  title,
  description,
  pending,
  onClose,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl"
      >
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mb-5 mt-1 text-[12px] text-graphite">{description}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}
