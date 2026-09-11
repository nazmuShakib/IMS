'use client';

import { createPortal } from 'react-dom';
import Link from 'next/link';
import { RotateCcw, X } from 'lucide-react';
import { Badge, Button, Money } from '@/components/ui';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { useI18n } from '@/components/i18n/I18nProvider';
import { MOVEMENT_LABELS, type MovementRow, type MovementSummary } from '@/lib/movement-query';
import type { Locale } from '@/lib/i18n/config';

export function movementStamp(value: string, locale: Locale, showYear = true) {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: showYear ? 'numeric' : undefined, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
}
export function MovementDetails({ row, onClose, onReverse }: { row: MovementRow; onClose: () => void; onReverse: () => void }) {
  const { t, locale } = useI18n(), ref = useModalDialog(true, onClose);
  const details = (entry: MovementSummary, recordedBy?: string, reversed = false) => <dl className="grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2">
    <div className="sm:col-span-2"><dt className="text-graphite">{t('ledger.identifier')}</dt><dd className="break-all font-mono text-[12px]">{entry.id}</dd></div>
    {reversed && <div className="sm:col-span-2"><dt className="mb-1 text-graphite">{t('common.status')}</dt><dd><Badge tone="low"><span className="inline-flex items-center gap-1"><RotateCcw size={12} aria-hidden="true" />{t('ledger.reversed')}</span></Badge></dd></div>}
    <div><dt className="mb-1 text-graphite">{t('ledger.movement')}</dt><dd><Badge>{t(MOVEMENT_LABELS[entry.reason])}</Badge></dd></div>
    <div><dt className="text-graphite">{t('ledger.stockChange')}</dt><dd className={entry.quantity > 0 ? 'text-ok' : 'text-out'}>{entry.quantity > 0 ? '+' : ''}{entry.quantity} · {t(entry.quantity > 0 ? 'ledger.stockIn' : 'ledger.stockOut')}</dd></div>
    <div><dt className="text-graphite">{t('ledger.recordedAt')}</dt><dd>{movementStamp(entry.createdAt, locale)}</dd></div>
    {entry.occurredAt !== entry.createdAt && <div><dt className="text-graphite">{t('ledger.actualTime')}</dt><dd>{movementStamp(entry.occurredAt, locale)}</dd></div>}
    {entry.unitCost !== undefined && <div><dt className="text-graphite">{t('ledger.unitCost')}</dt><dd><Money value={entry.unitCost} /></dd></div>}
    <div><dt className="text-graphite">{t('ledger.unitPrice')}</dt><dd><Money value={entry.unitPrice} /></dd></div>
    {entry.reference && <div><dt className="text-graphite">{t('common.reference')}</dt><dd className="break-words">{entry.reference}</dd></div>}
    {recordedBy && <div><dt className="text-graphite">{t('ledger.recordedBy')}</dt><dd>{recordedBy}</dd></div>}
    {entry.note && <div className="sm:col-span-2"><dt className="text-graphite">{t('common.note')}</dt><dd className="whitespace-pre-wrap break-words">{entry.note}</dd></div>}
  </dl>;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="movement-details-title" tabIndex={-1} className="max-h-[90dvh] w-full max-w-xl sm:max-w-2xl lg:max-w-3xl overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="movement-details-title" className="text-lg font-semibold">{t('ledger.details')}</h2><Link href={`/products/${row.productId}`} className="text-signal hover:underline">{row.productName || row.sku}</Link><p className="text-[12px] text-graphite">{row.sku}{row.serial ? ` · ${row.serial}` : ''}</p></div><button type="button" aria-label={t('common.close')} onClick={onClose} className="shrink-0 rounded p-2 hover:bg-plate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"><X size={20} aria-hidden="true" /></button></div>
      {details(row, row.actorName ?? t(row.actorId ? 'ledger.unknownUser' : 'ledger.system'), Boolean(row.correction))}
      {row.original && <section className="mt-4 rounded-[3px] border border-rule bg-plate/40 p-3"><h3 className="mb-3 font-medium">{t('ledger.original')}</h3>{details(row.original, undefined, true)}</section>}
      {row.correction && <section className="mt-4 rounded-[3px] border border-rule bg-plate/40 p-3"><h3 className="mb-3 font-medium">{t('ledger.correctionEntry')}</h3>{details(row.correction)}</section>}
      {row.action.kind !== 'blocked' && <div className="mt-5 border-t border-rule pt-4">
        {row.action.kind === 'reverse' ? <Button variant="danger" onClick={onReverse}>{t('ledger.reverse')}</Button>
          : <Link href={row.action.href} className={`inline-block rounded-[3px] border border-rule px-3 py-2 text-[13px] hover:bg-plate ${row.action.kind === 'invoice' && row.reason === 'SALE' && !row.correction ? 'text-out' : 'text-signal'}`}>{t(row.action.kind === 'invoice' ? row.reason === 'SALE' && !row.correction ? 'invoice.voidInvoice' : 'ledger.viewInvoice' : row.action.kind === 'supplierReturn' ? 'ledger.viewReturn' : 'ledger.viewWarranty')} · {row.action.label}</Link>}
      </div>}
    </div>
  </div>, document.body);
}
