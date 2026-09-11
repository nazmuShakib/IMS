'use client';

import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { reverseMovementAction, type CorrectionActionState } from '@/actions/stock';
import { Button, Field, Textarea } from '@/components/ui';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { useI18n } from '@/components/i18n/I18nProvider';
import { correctionSchema } from '@/schemas';
import { MOVEMENT_LABELS, type MovementRow } from '@/lib/movement-query';
import type { MessageKey } from '@/lib/i18n/messages';

const fields = correctionSchema.pick({ note: true });

/** Kept at workspace level so a page refresh cannot remove the outcome popup. */
export function MovementReversalDialog({ row, onClose }: { row: MovementRow; onClose: () => void }) {
  const { t, message } = useI18n(), router = useRouter();
  const [note, setNote] = useState(''), [pending, setPending] = useState(false);
  const [state, setState] = useState<CorrectionActionState>({});
  const submitted = useRef(false), key = useRef<string | null>(null), frozenNote = useRef<string | null>(null);
  const locked = pending || state.outcome === 'unconfirmed';
  const ref = useModalDialog(true, () => { if (!locked) onClose(); }, '[data-dialog-cancel]');
  const errorText = (value: string) => value.startsWith('ledger.') ? t(value as MessageKey) : message(value);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitted.current || state.receipt) return;
    const parsed = fields.safeParse({ note: frozenNote.current ?? note });
    if (!parsed.success) {
      setState({ outcome: 'rejected', fieldErrors: { note: parsed.error.issues[0]!.message } });
      ref.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }
    submitted.current = true; setPending(true);
    key.current ??= crypto.randomUUID();
    frozenNote.current = parsed.data.note;
    const data = new FormData();
    data.set('movementId', row.id); data.set('note', parsed.data.note); data.set('idempotencyKey', key.current);
    let result: CorrectionActionState;
    try { result = await reverseMovementAction({}, data); }
    catch { result = { outcome: 'unconfirmed', error: 'ledger.unconfirmed' }; }
    setState(result); setPending(false); submitted.current = false;
    if (result.outcome === 'rejected') { frozenNote.current = null; key.current = null; }
    if (result.receipt) {
      try { router.refresh(); } catch { /* The committed receipt remains visible. */ }
      requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-result-close]')?.focus());
    }
  }

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4">
    <div ref={ref} role={state.receipt ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="movement-reversal-title" aria-describedby="movement-reversal-help" tabIndex={-1} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[3px] border border-rule bg-card p-5 shadow-xl">
      <h2 id="movement-reversal-title" className="text-lg font-semibold">{t(state.receipt ? 'ledger.success' : 'ledger.confirmTitle')}</h2>
      <p id="movement-reversal-help" className="mt-2 text-[13px] text-graphite">{t(state.receipt ? 'ledger.successHelp' : 'ledger.confirmHelp')}</p>
      <p className="mt-4 font-medium">{row.productName || row.sku}</p>
      <p className="text-[13px] text-graphite">{t(MOVEMENT_LABELS[row.reason])}{row.serial ? ` · ${row.serial}` : ''}</p>
      <p className="my-3 text-[13px]">{t('ledger.stockChange')}: <strong className={row.quantity > 0 ? 'text-out' : 'text-ok'}>{row.quantity < 0 ? '+' : ''}{-row.quantity}</strong></p>
      {state.receipt ? <>
        <p role="status" className="break-all text-[12px] text-ok">{t('ledger.identifier')}: {state.receipt.id}</p>
        <div className="mt-5 flex gap-2"><Button data-result-close onClick={onClose}>{t('common.close')}</Button><Link href={`/products/${state.receipt.productId}`} className="rounded-[3px] border border-rule px-3 py-2 text-[13px] hover:bg-plate">{t('ledger.viewProduct')}</Link></div>
      </> : <form onSubmit={submit} noValidate aria-busy={pending}>
        <Field label={t('common.note')} inputId="movement-reversal-note" errorId="movement-reversal-note-error" error={state.fieldErrors?.note ? errorText(state.fieldErrors.note) : undefined}>
          <Textarea id="movement-reversal-note" name="note" value={note} disabled={locked} aria-invalid={Boolean(state.fieldErrors?.note)} aria-describedby={state.fieldErrors?.note ? 'movement-reversal-note-error' : undefined} onChange={event => {
            setNote(event.target.value);
            if (state.fieldErrors?.note && fields.safeParse({ note: event.target.value }).success) setState(previous => ({ ...previous, fieldErrors: undefined }));
          }} />
        </Field>
        {state.error && <p role="alert" className="mt-3 text-[13px] text-out">{errorText(state.error)}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" data-dialog-cancel disabled={locked} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="danger" disabled={pending}>{t(pending ? 'ledger.reversing' : state.outcome === 'unconfirmed' ? 'ledger.retry' : 'ledger.confirmReverse')}</Button>
        </div>
      </form>}
    </div>
  </div>, document.body);
}
