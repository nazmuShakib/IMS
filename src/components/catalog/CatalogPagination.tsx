'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { PageRequest } from '@/lib/catalog-query';

const pageStyle = 'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';
const arrowStyle = `${pageStyle} bg-plate text-graphite hover:bg-rule hover:text-signal`;

export interface PageMeta extends PageRequest { totalCount: number; pageCount: number }
export function pageNumbers(page: number, count: number): Array<number | '…'> {
  const pages = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, count])].filter(p => p > 0 && p <= count).sort((a, b) => a - b);
  return pages.flatMap((p, i) => i && p - pages[i - 1]! > 1 ? ['…' as const, p] : [p]);
}
export function CatalogPagination({ meta, pending = false, onChange, label }: { label?: string; meta: PageMeta; pending?: boolean; onChange: (page: PageRequest) => void }) {
  const { t } = useI18n();
  const { page, pageSize, pageCount, totalCount } = meta;
  return <nav aria-label={label ?? t('catalog.pagination')} className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
    <p className="tnum text-[12px] text-graphite" role="status" aria-live="polite">{t('catalog.pageRange', { from: totalCount ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, totalCount), total: totalCount })}</p>
    <div className="flex items-center gap-1.5">
      <button type="button" className={arrowStyle} disabled={pending || page <= 1 || !totalCount} onClick={() => onChange({ page: page - 1, pageSize })}>
        <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" /><span className="sr-only">{t('invoices.previous')}</span>
      </button>
      <span className="px-1 text-[12px] sm:hidden">{t('catalog.pageNumber', { page, total: pageCount })}</span>
      <div className="hidden items-center gap-1 sm:flex">{pageNumbers(page, pageCount).map((p, i) => p === '…'
        ? <span key={`gap-${i}`} className="px-1 text-[12px] text-graphite" aria-hidden="true">…</span>
        : <button key={p} type="button" className={`${pageStyle} ${p === page ? 'bg-signal text-white hover:bg-signal/90' : 'text-ink hover:bg-signal-wash'}`} aria-label={t('catalog.goPage', { page: p })} aria-current={p === page ? 'page' : undefined} aria-disabled={p === page || undefined} disabled={pending || !totalCount} onClick={() => { if (p !== page) onChange({ page: p, pageSize }); }}>{p}</button>)}</div>
      <button type="button" className={arrowStyle} disabled={pending || page >= pageCount || !totalCount} onClick={() => onChange({ page: page + 1, pageSize })}>
        <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" /><span className="sr-only">{t('invoices.next')}</span>
      </button>
      <label className="relative ml-2 shrink-0">
        <span className="sr-only">{t('catalog.perPage')}</span>
        <select className="h-7 appearance-none rounded-full border-0 bg-plate py-0 pl-3 pr-7 text-[12px] font-medium text-ink outline-none transition-colors hover:bg-rule focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" value={pageSize} disabled={pending} onChange={e => onChange({ page: 1, pageSize: Number(e.target.value) })}>{[25, 50, 100].map(n => <option key={n} value={n}>{t('catalog.pageSizeOption', { count: n })}</option>)}</select>
        <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-graphite" />
      </label>
    </div>
  </nav>;
}
export function CatalogResults({ children, pending, version, loadingLabel = "Loading products…" }: { loadingLabel?: string; children: ReactNode; pending: boolean; version: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('.contextual-scroll-area').forEach(el => { el.scrollTop = 0; el.scrollLeft = 0; });
  }, [version]);
  return <div ref={ref} className="relative" aria-busy={pending}>
    <div inert={pending || undefined}>{children}</div>
    {pending && <div className="absolute inset-0 z-20 flex items-center justify-center bg-card"><LoadingScreen label={loadingLabel} compact /></div>}
  </div>;
}
