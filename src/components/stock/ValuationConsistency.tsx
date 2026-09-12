'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Button, Card, Field, Input, Money, TableViewport } from '@/components/ui';
import { CatalogPagination } from '@/components/catalog/CatalogPagination';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { paginate } from '@/lib/catalog-query';
import type { ValuationDifference, ValuationReport } from '@/lib/valuation-consistency';
import { movementStamp } from './MovementDetails';

export function ValuationConsistency({ report, checkedAt, pending }: { report: ValuationReport; checkedAt: string; pending: boolean }) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState(''), [applied, setApplied] = useState(''), [request, setRequest] = useState({ page: 1, pageSize: 25 });
  const [selected, setSelected] = useState<ValuationDifference | null>(null);
  useEffect(() => { setSelected(null); }, [report]);
  const page = paginate(report.rows.filter(row => [row.name, row.sku].some(value => value.toLowerCase().includes(applied.toLowerCase().trim()))), request);
  const details = (row: ValuationDifference) => <Button variant="ghost" disabled={pending} onClick={() => setSelected(row)} aria-label={t('valuation.detailsFor', { item: row.name })}>{t('ledger.details')}</Button>;
  const amounts = (row: ValuationDifference) => <>
    <td className="px-4 py-3 text-right"><Money value={row.recordedValue} /></td>
    <td className="px-4 py-3 text-right"><Money value={row.expectedValue} /></td>
    <td className="px-4 py-3 text-right text-out"><Money value={row.difference} /></td>
  </>;
  return <section className="mb-6" aria-labelledby="valuation-title">
    <h2 id="valuation-title" className="mb-3 text-[16px] font-semibold">{t('valuation.title')}</h2>
    <Card className="mb-4 p-4">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-[12px] text-graphite">{t('valuation.units')}</dt><dd className="mt-1 text-[18px] font-medium tnum">{report.unitsInStock}</dd></div>
        {([['valuation.recorded', report.recordedValue], ['valuation.expected', report.expectedValue], ['valuation.difference', report.difference]] as const).map(([key, value]) => <div key={key}><dt className="text-[12px] text-graphite">{t(key)}</dt><dd className="mt-1 text-[18px] font-medium"><Money value={value} /></dd></div>)}
      </dl>
      <div className="mt-4 border-t border-rule pt-3 text-[13px]">
        {!report.productsChecked ? <p>{t('consistency.empty')}</p> : <>
          {report.productsWithDifferences > 0 && <p className="text-out">{t('valuation.mismatches', { count: report.productsWithDifferences })}</p>}
          {report.productsUnverified > 0 && <><p className="text-low">{t('valuation.unverifiedCount', { count: report.productsUnverified })}</p><p className="mt-1 text-graphite">{t('valuation.incomplete')}</p></>}
          {!report.productsWithDifferences && !report.productsUnverified && <p className="text-ok">{t('valuation.matches')}</p>}
        </>}
        <p className="mt-2 text-[12px] text-graphite">{t('valuation.scope')}</p>
        <p className="mt-1 text-[12px] text-graphite">{t('consistency.checkedAt')}: {movementStamp(checkedAt, locale)}</p>
      </div>
    </Card>
    {report.rows.length > 0 && <Card>
      <form className="border-b border-rule p-4" onSubmit={event => { event.preventDefault(); if (!pending) { setApplied(search); setRequest(previous => ({ ...previous, page: 1 })); } }}>
        <fieldset disabled={pending} className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="w-full sm:max-w-sm"><Field label={t('consistency.search')} inputId="valuation-search"><Input id="valuation-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field></div>
          <Button type="submit">{t('common.applyFilters')}</Button><Button type="button" variant="ghost" onClick={() => { setSearch(''); setApplied(''); setRequest(previous => ({ ...previous, page: 1 })); }}>{t('common.reset')}</Button>
        </fieldset>
      </form>
      {!page.rows.length ? <p className="px-4 py-10 text-center text-[13px] text-graphite">{t('consistency.noMatches')}</p> : <>
        <div className="hidden md:block"><TableViewport><table className="w-full min-w-[800px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">{(['common.product', 'valuation.recorded', 'valuation.expected', 'valuation.difference', 'ledger.details'] as const).map((key, index) => <th key={key} scope="col" className={`eyebrow px-4 py-3 ${index > 0 && index < 4 ? 'text-right' : 'text-left'}`}>{t(key)}</th>)}</tr></thead>
          <tbody>{page.rows.map(row => <tr key={row.productId} className="border-b border-rule-soft last:border-0 hover:bg-plate/40">
            <td className="px-4 py-3"><Link href={`/products/${row.productId}`} className="font-medium hover:text-signal">{row.name}</Link><p className="text-[11px] text-graphite">{row.sku}</p>{row.issue && <p className="mt-1 text-[12px] text-low">{t('valuation.unverified')}</p>}{row.units.length > 0 && row.difference === 0 && <p className="mt-1 max-w-64 text-[12px] text-low">{t('valuation.unitDifferences')}</p>}</td>
            {amounts(row)}<td className="px-4 py-3">{details(row)}</td>
          </tr>)}</tbody>
        </table></TableViewport></div>
        <div className="divide-y divide-rule-soft md:hidden">{page.rows.map(row => <article key={row.productId} className="space-y-3 p-4">
          <div><p className="font-medium">{row.name}</p><p className="text-[12px] text-graphite">{row.sku}</p></div>
          <dl className="grid gap-2 text-[12px]">{([['valuation.recorded', row.recordedValue], ['valuation.expected', row.expectedValue], ['valuation.difference', row.difference]] as const).map(([key, value]) => <div key={key} className="flex justify-between gap-2"><dt className="text-graphite">{t(key)}</dt><dd><Money value={value} /></dd></div>)}</dl>
          {row.issue && <p className="text-[12px] text-low">{t('valuation.unverified')}</p>}{details(row)}
        </article>)}</div>
      </>}
      <CatalogPagination label={t('valuation.pages')} meta={page} pending={pending} onChange={setRequest} />
    </Card>}
    {selected && <ValuationDetails row={selected} checkedAt={checkedAt} onClose={() => setSelected(null)} />}
  </section>;
}

function ValuationDetails({ row, checkedAt, onClose }: { row: ValuationDifference; checkedAt: string; onClose: () => void }) {
  const { t, locale } = useI18n(), ref = useModalDialog(true, onClose, '[data-close]');
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="valuation-detail-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl sm:max-w-2xl lg:max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="valuation-detail-title" className="text-lg font-semibold">{t('valuation.title')}</h2><p className="mt-1 font-medium">{row.name}</p><p className="text-[12px] text-graphite">{row.sku}</p></div><button data-close aria-label={t('common.close')} onClick={onClose} className="rounded p-2 hover:bg-plate focus-visible:ring-2 focus-visible:ring-signal"><X size={20} aria-hidden="true" /></button></div>
      <dl className="grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2">
        {([['valuation.recorded', row.recordedValue], ['valuation.expected', row.expectedValue], ['valuation.difference', row.difference]] as const).map(([key, value]) => <div key={key}><dt className="text-graphite">{t(key)}</dt><dd className="mt-1"><Money value={value} /></dd></div>)}
        <div><dt className="text-graphite">{t('consistency.checkedAt')}</dt><dd className="mt-1">{movementStamp(checkedAt, locale)}</dd></div>
      </dl>
      {row.issue && <p className="mt-4 rounded border border-low/30 bg-low-wash p-3 text-[13px] text-low">{t(row.issue)}</p>}
      {row.units.length > 0 && <section className="mt-4"><h3 className="mb-2 font-medium">{t('valuation.unitDetails')}</h3><div className="space-y-3">{row.units.map(unit => <dl key={unit.unitId} className="grid gap-2 rounded border border-rule p-3 text-[12px] sm:grid-cols-3"><div className="sm:col-span-3"><dt className="text-graphite">{t('valuation.unit')}</dt><dd className="break-all">{unit.serial}</dd></div>{([['valuation.recorded', unit.recordedValue], ['valuation.expected', unit.expectedValue], ['valuation.difference', unit.difference]] as const).map(([key, value]) => <div key={key}><dt className="text-graphite">{t(key)}</dt><dd><Money value={value} /></dd></div>)}</dl>)}</div></section>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4"><Link href={`/products/${row.productId}`} className="rounded border border-rule px-3 py-2 text-[13px] text-signal hover:bg-plate">{t('consistency.viewProduct')}</Link><Link href={`/stock/movements?product=${encodeURIComponent(row.productId)}`} className="rounded border border-rule px-3 py-2 text-[13px] text-signal hover:bg-plate">{t('consistency.viewMovements')}</Link></div>
    </div>
  </div>, document.body);
}
