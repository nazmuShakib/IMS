'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Customer, TradeInCartDraft } from '@/domain/types';
import { UsedDeviceIntakeForm, type IntakeProductOption } from '@/components/stock/UsedDeviceIntakeForm';
import { ReceiptDialog } from '@/components/stock/ReceiptDialog';
import { Button } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

export function TradeInPanel({ cartId, draft, products, customer, context, onSaved, onClose }: {
  cartId: string; draft: TradeInCartDraft | null; products: IntakeProductOption[]; customer: Customer | null;
  context: { isEmi: boolean; total: number; downPayment: number };
  onSaved: (draft: TradeInCartDraft) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const discardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (discard) discardRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [discard]);
  const close = () => { if (!busy) { if (dirty) { setDiscard(true); discardRef.current?.scrollIntoView?.({ block: 'nearest' }); } else onClose(); } };
  return createPortal(<ReceiptDialog panel title={t(draft ? 'checkout.editTradeIn' : 'checkout.prepareTradeIn')} headerAside={<span className="whitespace-nowrap text-sm font-medium text-graphite">{formatTotal(context.total)}</span>}
    headerActions={<button type="button" aria-label={t('common.close')} title={t('common.close')} disabled={busy} onClick={close} className="inline-flex size-9 shrink-0 items-center justify-center rounded-[3px] text-out hover:bg-out-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-out disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" size={20} /></button>}
    busy={busy} onClose={close}>
    {discard && <div ref={discardRef} role="alert" className="m-4 scroll-mt-20 rounded-lg border border-rule bg-plate p-4"><p className="font-medium">{t('used.discardTitle')}</p><p className="mt-1 text-sm">{t('used.discardHelp')}</p><div className="mt-3 flex gap-2"><Button type="button" variant="ghost" onClick={() => setDiscard(false)}>{t('used.keepEditing')}</Button><Button type="button" variant="danger" onClick={onClose}>{t('used.discardChanges')}</Button></div></div>}
    <div className="p-3 sm:p-5"><UsedDeviceIntakeForm mode="trade-in" cartId={cartId} initialDraft={draft} products={products} customer={customer} checkoutContext={context} onSaved={onSaved} onBusyChange={setBusy} onDirtyChange={setDirty} /></div>
  </ReceiptDialog>, document.body);
}
import { formatBDT as formatTotal } from '@/lib/money';
