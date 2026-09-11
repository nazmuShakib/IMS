'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Money, PageHeader, Select, SerialChip, TableViewport } from '@/components/ui';
import { CatalogPagination, CatalogResults } from '@/components/catalog/CatalogPagination';
import { useI18n } from '@/components/i18n/I18nProvider';
import { MOVEMENT_REASONS, type Role } from '@/domain/types';
import { canSeeCosts } from '@/lib/permissions';
import { MOVEMENT_DEFAULTS, MOVEMENT_LABELS, movementFilterErrors, movementUrl, type MovementFilters, type MovementPage, type MovementQuery, type MovementRow } from '@/lib/movement-query';
import type { MessageKey } from '@/lib/i18n/messages';
import { MovementDetails, movementStamp } from './MovementDetails';
import { MovementReversalDialog } from './ReverseButton';

const labels: Record<keyof MovementFilters, MessageKey> = {
  q: 'common.search', reason: 'stock.reason', from: 'ledger.recordedFrom', to: 'ledger.recordedTo', product: 'common.product', type: 'ledger.direction', actor: 'ledger.recordedBy', order: 'catalog.orderBy',
};
export function MovementWorkspace({ query, result, products, users, role, initialErrors = {}, invalidValues }: {
  query: MovementQuery; result: MovementPage; products: Array<{ id: string; name: string; sku: string }>; users: Array<{ id: string; name: string }>;
  role: Role; initialErrors?: Record<string, MessageKey>; invalidValues?: MovementFilters;
}) {
  const router = useRouter(), { t, locale } = useI18n();
  const [values, setValues] = useState<MovementFilters>(invalidValues ?? query);
  const [errors, setErrors] = useState(initialErrors), [navigationError, setNavigationError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<MovementRow | null>(null), [reversing, setReversing] = useState<MovementRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null), lastNavigation = useRef<string | null>(null);
  const version = JSON.stringify([query, result.page, result.pageSize, result.rows.map(row => [row.id, row.correction?.id]), invalidValues, initialErrors]);
  useEffect(() => {
    setValues(invalidValues ?? query); setErrors(initialErrors); setNavigationError(false); setSelected(null);
    // Confirmed route state restores fields on Back/Forward as well as Apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const showCosts = canSeeCosts(role);
  const invalid = Object.keys(initialErrors).length > 0 || Object.keys(errors).length > 0;
  const applied = (Object.keys(MOVEMENT_DEFAULTS) as (keyof MovementFilters)[]).filter(key => key !== 'order' && query[key]);

  function visit(href: string) {
    lastNavigation.current = href; setNavigationError(false);
    startTransition(async () => {
      try { await router.push(href, { scroll: false }); }
      catch { setNavigationError(true); }
    });
  }
  function navigate(next: MovementFilters, request = { page: 1, pageSize: result.pageSize }) {
    if (pending) return;
    const checked = movementFilterErrors(next); setErrors(checked);
    if (Object.keys(checked).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    visit(movementUrl(next, request));
  }
  function update(key: keyof MovementFilters, value: string) {
    const next = { ...values, [key]: value }; setValues(next);
    if (errors[key] || key === 'from' || key === 'to') {
      const current = movementFilterErrors(next);
      setErrors(previous => Object.fromEntries(Object.keys(previous).filter(field => current[field]).map(field => [field, current[field]!])));
    }
  }
  const clear = () => { setValues(MOVEMENT_DEFAULTS); setErrors({}); navigate(MOVEMENT_DEFAULTS, { page: 1, pageSize: 25 }); };
  function field(key: keyof MovementFilters, options?: Array<[string, string]>) {
    const error = errors[key], id = `movement-filter-${key}`;
    const attrs = { id, name: key, value: values[key], 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(key, event.target.value) };
    return <Field label={t(labels[key])} inputId={id} errorId={`${id}-error`} error={error ? t(error) : undefined}>
      {options ? <Select {...attrs}>{!options.some(([value]) => value === values[key]) && <option value={values[key]}>{values[key]}</option>}{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        : <Input {...attrs} type={key === 'from' || key === 'to' ? 'date' : 'search'} placeholder={key === 'q' ? t('ledger.searchPlaceholder') : undefined} />}
    </Field>;
  }
  function chipValue(key: keyof MovementFilters) {
    const value = query[key];
    if (key === 'reason') return t(MOVEMENT_LABELS[value as keyof typeof MOVEMENT_LABELS]);
    if (key === 'product') return products.find(row => row.id === value)?.name ?? value;
    if (key === 'actor') return users.find(row => row.id === value)?.name ?? value;
    if (key === 'type') return t(value === 'IN' ? 'ledger.stockIn' : value === 'OUT' ? 'ledger.stockOut' : 'ledger.adjustments');
    return value;
  }
  const quantity = (row: MovementRow) => <span className={`tnum font-medium ${row.quantity > 0 ? 'text-ok' : 'text-out'}`}>{row.quantity > 0 ? '+' : ''}{row.quantity}</span>;
  const reason = (row: MovementRow) => <><Badge tone={row.reason === 'CORRECTION' ? 'low' : row.quantity > 0 ? 'signal' : 'neutral'}>{t(MOVEMENT_LABELS[row.reason])}</Badge>{row.correction && <span className="mt-2 block"><Badge tone="low"><span className="inline-flex items-center gap-1"><RotateCcw size={12} aria-hidden="true" />{t('ledger.reversed')}</span></Badge></span>}</>;
  const stamp = (row: MovementRow) => <><time dateTime={row.createdAt}>{movementStamp(row.createdAt, locale, false)}</time>{row.occurredAt !== row.createdAt && <span className="mt-1 block text-[11px]">{t('ledger.actualTime')}: {movementStamp(row.occurredAt, locale, false)}</span>}</>;
  const detailsButton = (row: MovementRow) => <Button variant="ghost" aria-label={t('ledger.detailsFor', { item: row.productName || row.sku })} onClick={() => setSelected(row)}>{t('ledger.details')}</Button>;

  return <>
    <PageHeader title={t('nav.movementLedger')} />
    <Card className="mb-4 p-4">
      <form ref={formRef} noValidate onSubmit={event => { event.preventDefault(); navigate(values); }}>
        {invalid && <p role="alert" className="mb-3 text-[13px] text-out">{t('ledger.invalidFilters')}</p>}
        <fieldset disabled={pending} className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div className="xl:col-span-2">{field('q')}</div>{field('reason', [['', t('ledger.allReasons')], ...MOVEMENT_REASONS.map(value => [value, t(MOVEMENT_LABELS[value])] as [string, string])])}{field('from')}{field('to')}</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {field('product', [['', t('ledger.allProducts')], ...products.map(row => [row.id, `${row.sku} — ${row.name}`] as [string, string])])}
              {field('type', [['', t('ledger.allDirections')], ['IN', t('ledger.stockIn')], ['OUT', t('ledger.stockOut')], ['ADJUST', t('ledger.adjustments')]])}
              {field('actor', [['', t('ledger.allUsers')], ...users.map(row => [row.id, row.name] as [string, string])])}
            {field('order', [['newest', t('ledger.newestFirst')], ['oldest', t('ledger.oldestFirst')]])}
          </div>
          <div className="flex gap-2"><Button type="submit">{t('common.applyFilters')}</Button><Button type="button" variant="ghost" onClick={clear}>{t('common.reset')}</Button></div>
        </fieldset>
      </form>
      <p className="mt-3 text-[12px] text-graphite">{t('ledger.timeHelp')}</p>
    </Card>
    {applied.length > 0 && <div className="mb-4 flex flex-wrap gap-2" aria-label={t('catalog.appliedFilters', { count: applied.length })}>{applied.map(key => <button key={key} disabled={pending} onClick={() => { const next = { ...query, [key]: '' }; setValues(next); navigate(next); }} aria-label={t('ledger.removeFilter', { filter: t(labels[key]) })} className="rounded-full border border-rule bg-card px-3 py-1 text-[12px] text-graphite hover:bg-plate disabled:opacity-50">{t(labels[key])}: {chipValue(key)} <span aria-hidden="true">×</span></button>)}</div>}
    {navigationError && <p role="alert" className="mb-3 text-[13px] text-out">{t('ledger.loadFailed')} <Button variant="ghost" onClick={() => { if (lastNavigation.current) visit(lastNavigation.current); }}>{t('ledger.retryLoad')}</Button></p>}
    {!invalid && <CatalogResults pending={pending} version={version} loadingLabel={t('loading.filterMovements')}>
      <Card>
        {!result.rows.length ? <EmptyState title={t(result.ledgerCount === 0 ? 'ledger.noRecords' : 'ledger.noMatches')} action={applied.length > 0 ? <Button variant="ghost" onClick={clear}>{t('common.reset')}</Button> : undefined} /> : <>
          <div className="hidden md:block"><TableViewport><table className="w-full min-w-[850px] text-[13px]">
            <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">
              {(['ledger.recordedAt', 'common.product', 'ledger.movement', 'ledger.qty', ...(showCosts ? ['ledger.unitCost'] : []), 'ledger.unitPrice', 'ledger.recordedBy', 'ledger.details'] as MessageKey[]).map(key => <th key={key} scope="col" className={`eyebrow px-4 py-3 ${['ledger.qty', 'ledger.unitCost', 'ledger.unitPrice'].includes(key) ? 'text-right' : 'text-left'}`}>{t(key)}</th>)}
            </tr></thead>
            <tbody>{result.rows.map(row => <tr key={row.id} className="border-b border-rule-soft last:border-0 hover:bg-plate/40">
              <td className="max-w-48 px-4 py-3 text-[12px] text-graphite">{stamp(row)}</td>
              <td className="px-4 py-3"><Link href={`/products/${row.productId}`} className="font-medium hover:text-signal">{row.productName || '—'}</Link><p className="text-[11px] text-graphite">{row.sku}</p>{row.serial && <span className="mt-1 block"><SerialChip serial={row.serial} /></span>}{row.reference && <p className="mt-1 max-w-48 truncate text-[11px] text-graphite">{row.reference}</p>}</td>
              <td className="px-4 py-3">{reason(row)}{row.note && <p className="mt-1 max-w-48 truncate text-[11px] text-graphite">{row.note}</p>}</td>
              <td className="px-4 py-3 text-right">{quantity(row)}</td>
              {showCosts && <td className="whitespace-nowrap px-4 py-3 text-right"><Money value={row.unitCost ?? null} muted /></td>}
              <td className="whitespace-nowrap px-4 py-3 text-right"><Money value={row.unitPrice} /></td>
              <td className="px-4 py-3 text-[12px] text-graphite">{row.actorName ?? t(row.actorId ? 'ledger.unknownUser' : 'ledger.system')}</td>
              <td className="px-4 py-3">{detailsButton(row)}</td>
            </tr>)}</tbody>
          </table></TableViewport></div>
          <div className="divide-y divide-rule-soft md:hidden">{result.rows.map(row => <article key={row.id} className="space-y-3 p-4">
            <div className="flex justify-between gap-3"><div><Link href={`/products/${row.productId}`} className="font-medium hover:text-signal">{row.productName || row.sku}</Link><p className="text-[12px] text-graphite">{row.sku}</p></div>{quantity(row)}</div>
            {row.serial && <SerialChip serial={row.serial} />}<div>{reason(row)}</div>
            <p className="text-[12px] text-graphite">{stamp(row)}</p>
            <div className="flex items-center justify-between gap-3"><span className="text-[12px] text-graphite">{row.actorName ?? t(row.actorId ? 'ledger.unknownUser' : 'ledger.system')}</span>{detailsButton(row)}</div>
          </article>)}</div>
        </>}
        <CatalogPagination label={t('ledger.pagination')} meta={result} pending={pending} onChange={request => navigate(query, request)} />
      </Card>
    </CatalogResults>}
    {selected && <MovementDetails row={selected} onClose={() => setSelected(null)} onReverse={() => { setSelected(null); setReversing(selected); }} />}
    {reversing && <MovementReversalDialog row={reversing} onClose={() => setReversing(null)} />}
  </>;
}
