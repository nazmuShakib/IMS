'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';
import { checkStockAction } from '@/actions/reconciliation';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, Field, Input, PageHeader, TableViewport } from '@/components/ui';
import { CatalogPagination } from '@/components/catalog/CatalogPagination';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { paginate } from '@/lib/catalog-query';
import type { StockConsistencyReport, StockDifference } from '@/lib/reconciliation';
import { ValuationConsistency } from './ValuationConsistency';
import { movementStamp } from './MovementDetails';

const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;

export function StockConsistencyWorkspace({ initialReport }: { initialReport: StockConsistencyReport | null }) {
  const { t, locale } = useI18n();
  const [report, setReport] = useState(initialReport), [failed, setFailed] = useState(!initialReport);
  const [pending, setPending] = useState(false), running = useRef(false);
  const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('');
  const [request, setRequest] = useState({ page: 1, pageSize: 25 });
  const [selected, setSelected] = useState<StockDifference | null>(null);
  useEffect(() => { setReport(initialReport); setFailed(!initialReport); setSelected(null); }, [initialReport]);

  async function run() {
    if (running.current) return;
    running.current = true; setPending(true); setFailed(false);
    try {
      const result = await checkStockAction();
      if (result.report) { setReport(result.report); setSelected(null); }
      else setFailed(true);
    } catch { setFailed(true); }
    finally { running.current = false; setPending(false); }
  }
  const query = appliedSearch.trim().toLocaleLowerCase();
  const page = paginate((report?.rows ?? []).filter(row => !query || [row.name, row.sku].some(value => value.toLocaleLowerCase().includes(query))), request);
  const detailButton = (row: StockDifference) => <Button variant="ghost" disabled={pending} aria-label={t('consistency.detailsFor', { item: row.name })} onClick={() => setSelected(row)}>{t('ledger.details')}</Button>;
  const columns = ['common.product', 'consistency.recorded', 'consistency.ledger', 'consistency.difference', 'ledger.details'] as const;

  return <>
    <PageHeader title={t('nav.reconciliation')} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-[13px] text-graphite">{t('consistency.scope')}</p>
      <Button onClick={run} disabled={pending}>{t('consistency.run')}</Button>
    </div>
    <div aria-live="polite" role="status">{pending && <p className="mb-3 text-[13px] text-signal">{t('consistency.checking')}</p>}</div>
    {failed && <p role="alert" className="mb-4 rounded-[3px] border border-out/30 bg-out-wash p-3 text-[13px] text-out">{t('consistency.failed')}{report && <> {t('consistency.previous')}</>}</p>}
    <div aria-busy={pending}>
      {report && <>
        {report.valuation && <ValuationConsistency report={report.valuation} checkedAt={report.checkedAt} pending={pending} />}
        <h2 className="mb-3 text-[16px] font-semibold">{t('valuation.quantityTitle')}</h2>
        <Card className="mb-4 p-4">
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {([
              ['consistency.checked', report.productsChecked], ['consistency.matching', report.productsMatching],
              ['consistency.differences', report.productsWithDifferences], ['consistency.checkedAt', movementStamp(report.checkedAt, locale)],
            ] as const).map(([label, value]) => <div key={label}><dt className="text-[12px] text-graphite">{t(label)}</dt><dd className="mt-1 text-[15px] font-medium tnum">{value}</dd></div>)}
          </dl>
          <p className={`mt-4 border-t border-rule pt-3 text-[13px] ${report.productsWithDifferences ? 'text-out' : 'text-ok'}`}>
            {t(!report.productsChecked ? 'consistency.empty' : report.productsWithDifferences ? 'consistency.mismatch' : 'consistency.healthy', { count: report.productsWithDifferences })}
          </p>
        </Card>
        {report.productsWithDifferences > 0 && <Card>
          <form className="border-b border-rule p-4" onSubmit={event => { event.preventDefault(); if (!pending) { setAppliedSearch(search); setRequest(previous => ({ ...previous, page: 1 })); } }}>
            <fieldset disabled={pending} className="flex min-w-0 flex-wrap items-end gap-3">
              <div className="w-full sm:max-w-sm"><Field label={t('consistency.search')} inputId="consistency-search"><Input id="consistency-search" type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field></div>
              <Button type="submit">{t('common.applyFilters')}</Button>
              <Button type="button" variant="ghost" onClick={() => { setSearch(''); setAppliedSearch(''); setRequest(previous => ({ ...previous, page: 1 })); }}>{t('common.reset')}</Button>
            </fieldset>
          </form>
          {!page.rows.length ? <p className="px-4 py-10 text-center text-[13px] text-graphite">{t('consistency.noMatches')}</p> : <>
            <div className="hidden md:block"><TableViewport><table className="w-full min-w-[720px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-rule">{columns.map((key, index) => <th key={key} scope="col" className={`eyebrow px-4 py-3 ${index > 0 && index < 4 ? 'text-right' : 'text-left'}`}>{t(key)}</th>)}</tr></thead>
              <tbody>{page.rows.map(row => <tr key={row.productId} className="border-b border-rule-soft last:border-0 hover:bg-plate/40">
                <td className="px-4 py-3"><Link href={`/products/${row.productId}`} className="font-medium hover:text-signal">{row.name}</Link><p className="mt-1 text-[11px] text-graphite">{row.sku}</p></td>
                <td className="px-4 py-3 text-right tnum">{row.onHand}</td><td className="px-4 py-3 text-right tnum">{row.ledgerSum}</td>
                <td className="px-4 py-3 text-right font-medium text-out tnum">{signed(row.drift)}</td><td className="px-4 py-3">{detailButton(row)}</td>
              </tr>)}</tbody>
            </table></TableViewport></div>
            <div className="divide-y divide-rule-soft md:hidden">{page.rows.map(row => <article key={row.productId} className="space-y-3 p-4">
              <div><Link href={`/products/${row.productId}`} className="font-medium hover:text-signal">{row.name}</Link><p className="text-[12px] text-graphite">{row.sku}</p></div>
              <dl className="grid grid-cols-3 gap-2 text-[12px]">{([
                ['consistency.recorded', row.onHand], ['consistency.ledger', row.ledgerSum], ['consistency.difference', signed(row.drift)],
              ] as const).map(([key, value]) => <div key={key}><dt className="text-graphite">{t(key)}</dt><dd className={`mt-1 font-medium tnum ${key === 'consistency.difference' ? 'text-out' : ''}`}>{value}</dd></div>)}</dl>
              {detailButton(row)}
            </article>)}</div>
          </>}
          <CatalogPagination label={t('consistency.pages')} meta={page} pending={pending} onChange={setRequest} />
        </Card>}
      </>}
    </div>
    {selected && report && <StockDifferenceDetails row={selected} checkedAt={report.checkedAt} onClose={() => setSelected(null)} />}
  </>;
}

function StockDifferenceDetails({ row, checkedAt, onClose }: { row: StockDifference; checkedAt: string; onClose: () => void }) {
  const { t, locale } = useI18n(), ref = useModalDialog(true, onClose, '[data-close]');
  const fields = [
    ['consistency.tracking', t(row.trackingType === 'SERIAL' ? 'consistency.serial' : 'consistency.quantity')],
    ['consistency.checkedAt', movementStamp(checkedAt, locale)], ['consistency.recorded', row.onHand],
    ['consistency.ledger', row.ledgerSum], ['consistency.difference', signed(row.drift)],
  ] as const;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="stock-difference-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl sm:max-w-2xl lg:max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 id="stock-difference-title" className="text-lg font-semibold">{t('consistency.details')}</h2><p className="mt-1 font-medium">{row.name}</p><p className="text-[12px] text-graphite">{row.sku}</p></div>
        <button type="button" data-close aria-label={t('common.close')} onClick={onClose} className="rounded p-2 hover:bg-plate focus-visible:ring-2 focus-visible:ring-signal"><X size={20} aria-hidden="true" /></button>
      </div>
      <dl className="grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2">{fields.map(([key, value]) => <div key={key}><dt className="text-graphite">{t(key)}</dt><dd className={`mt-1 ${key === 'consistency.difference' ? 'font-medium text-out' : ''}`}>{value}</dd></div>)}</dl>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4">
        <Link href={`/products/${row.productId}`} className="rounded-[3px] border border-rule px-3 py-2 text-[13px] text-signal hover:bg-plate">{t('consistency.viewProduct')}</Link>
        <Link href={`/stock/movements?product=${encodeURIComponent(row.productId)}`} className="rounded-[3px] border border-rule px-3 py-2 text-[13px] text-signal hover:bg-plate">{t('consistency.viewMovements')}</Link>
      </div>
    </div>
  </div>, document.body);
}
