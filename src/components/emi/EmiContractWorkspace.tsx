'use client';

import Link from 'next/link';
import { InstallmentSchedule } from './InstallmentSchedule';
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { recordEmiPaymentAction, settleEmiEarlyAction, type EmiActionState } from '@/actions/emi';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import type { EmiContract, EmiEarlySettlement, EmiInstallment, EmiPayment, PaymentMethod, Role } from '@/domain/types';
import { formatBDT, parseBDT } from '@/lib/money';
import { formatDhakaDateTime } from '@/lib/time';
import { emiEarlySettlementSchema, emiPaymentSchema } from '@/schemas';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';

const methods: PaymentMethod[] = ['CASH', 'CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'MIXED', 'OTHER'];

function moneyInput(paisa: number): string {
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}

export function EmiContractWorkspace({ contract, installments, payments, earlySettlement, allocationsByPayment, role }: { contract: EmiContract; installments: EmiInstallment[]; payments: EmiPayment[]; earlySettlement: EmiEarlySettlement | null; allocationsByPayment: Record<string, Array<{ sequence: number; amount: number }>>; role: Role }) {
  const { t, message } = useI18n();
  const [paymentState, paymentAction, paymentPending] = useActionState<EmiActionState, FormData>(recordEmiPaymentAction, {});
  const [settleState, settleAction, settlePending] = useActionState<EmiActionState, FormData>(settleEmiEarlyAction, {});
  const openInstallments = installments.filter((row) => row.amountPaid < row.amountDue);
  const firstOpenAmount = openInstallments[0] ? openInstallments[0].amountDue - openInstallments[0].amountPaid : 0;
  const [confirmation, setConfirmation] = useState<{ kind: 'payment' | 'settlement'; data: FormData; amount: number; discount: number; method: string } | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (confirmation) confirmDialog.current?.showModal();
    else confirmDialog.current?.close();
  }, [confirmation]);
  useEffect(() => { if (!paymentPending && !settlePending) submitting.current = false; }, [paymentPending, settlePending]);
  const [paymentKey, setPaymentKey] = useState(''); const [settleKey, setSettleKey] = useState('');
  const [paymentPlan, setPaymentPlan] = useState(openInstallments.length ? '1' : 'custom');
  const [paymentValues, setPaymentValues] = useState({ amount: firstOpenAmount ? moneyInput(firstOpenAmount) : '', paymentMethod: 'CASH', reference: '', note: '' });
  const [settleValues, setSettleValues] = useState({ discountAmount: '', paymentMethod: 'CASH', reason: '', reference: '' });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});
  const [settleErrors, setSettleErrors] = useState<Record<string, string>>({});
  const [dismissedReceiptIds, setDismissedReceiptIds] = useState<Set<string>>(() => new Set());
  const [clearedPaymentErrors, setClearedPaymentErrors] = useState<Set<string>>(() => new Set());
  const [clearedSettleErrors, setClearedSettleErrors] = useState<Set<string>>(() => new Set());
  const installmentSignature = openInstallments.map((row) => `${row.id}:${row.amountDue - row.amountPaid}`).join('|');
  useEffect(() => { setPaymentKey(crypto.randomUUID()); setSettleKey(crypto.randomUUID()); }, []);
  useEffect(() => {
    if (paymentPlan === 'custom') return;
    const count = Math.min(Number(paymentPlan), openInstallments.length);
    const amount = openInstallments.slice(0, count).reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0);
    setPaymentValues((current) => ({ ...current, amount: amount ? moneyInput(amount) : '' }));
  }, [installmentSignature, paymentPlan]);
  useEffect(() => {
    if (!paymentState.receiptId) return;
    setPaymentKey(crypto.randomUUID());
    setPaymentPlan('1');
    setPaymentValues((current) => ({ ...current, reference: '', note: '' }));
  }, [paymentState.receiptId]);
  const paid = payments.filter((row) => row.status === 'ACTIVE').reduce((sum, row) => sum + row.amount, 0);
  const historicalOutstanding = installments.reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0);
  const outstanding = contract.status === 'VOIDED' ? 0 : historicalOutstanding;
  const canCollect = role === 'ADMIN' || role === 'MANAGER';
  const open = contract.status === 'ACTIVE' || contract.status === 'OVERDUE';
  let enteredPayment = 0;
  try { enteredPayment = paymentValues.amount ? parseBDT(paymentValues.amount) : 0; } catch { enteredPayment = 0; }
  let settlementDiscount = 0;
  try { settlementDiscount = settleValues.discountAmount ? parseBDT(settleValues.discountAmount) : 0; } catch { /* Validation supplies the error. */ }
  let previewRemaining = enteredPayment;
  const paymentAllocation = openInstallments.flatMap((row) => {
    if (previewRemaining <= 0) return [];
    const balance = row.amountDue - row.amountPaid;
    const allocated = Math.min(balance, previewRemaining);
    previewRemaining -= allocated;
    return allocated > 0 ? [{ sequence: row.sequence, amount: allocated }] : [];
  });
  const paymentError = (field: string) => { const error = paymentErrors[field] ?? (!clearedPaymentErrors.has(field) ? paymentState.fieldErrors?.[field] : undefined); return error ? message(error) : undefined; };
  const settleError = (field: string) => { const error = settleErrors[field] ?? (!clearedSettleErrors.has(field) ? settleState.fieldErrors?.[field] : undefined); return error ? message(error) : undefined; };
  function updatePayment(field: keyof typeof paymentValues, value: string) {
    const nextValues = { ...paymentValues, [field]: value };
    setPaymentValues(nextValues);
    const parsed = emiPaymentSchema.safeParse({ contractId: contract.id, idempotencyKey: paymentKey, ...nextValues });
    const issue = parsed.success ? undefined : parsed.error.issues.find((item) => item.path[0] === field)?.message;
    let contextual: string | undefined;
    if (field === 'amount') {
      try { if (parseBDT(value) > outstanding) contextual = t('emi.paymentExceedsOutstanding'); } catch { /* Zod supplies the format error. */ }
    }
    const message = issue ?? contextual;
    setPaymentErrors((current) => { const next = { ...current }; if (message) next[field] = message; else delete next[field]; return next; });
    if (!message) setClearedPaymentErrors((current) => new Set(current).add(field));
  }
  function updateSettlement(field: keyof typeof settleValues, value: string) {
    const nextValues = { ...settleValues, [field]: value };
    setSettleValues(nextValues);
    const parsed = emiEarlySettlementSchema.safeParse({ contractId: contract.id, idempotencyKey: settleKey, ...nextValues });
    const issue = parsed.success ? undefined : parsed.error.issues.find((item) => item.path[0] === field)?.message;
    let contextual: string | undefined;
    if (field === 'discountAmount') {
      try { if (parseBDT(value) >= outstanding) contextual = t('emi.discountBelowOutstanding'); } catch { /* Zod supplies the format error. */ }
    }
    const message = issue ?? contextual;
    setSettleErrors((current) => { const next = { ...current }; if (message) next[field] = message; else delete next[field]; return next; });
    if (!message) setClearedSettleErrors((current) => new Set(current).add(field));
  }
  function choosePaymentPlan(value: string) {
    setPaymentPlan(value);
    if (value === 'custom') {
      setPaymentValues((current) => ({ ...current, amount: '' }));
      setPaymentErrors((current) => { const next = { ...current }; delete next.amount; return next; });
      setClearedPaymentErrors((current) => new Set(current).add('amount'));
      return;
    }
    const count = Math.min(Number(value), openInstallments.length);
    const amount = openInstallments.slice(0, count).reduce((sum, row) => sum + row.amountDue - row.amountPaid, 0);
    updatePayment('amount', moneyInput(amount));
  }
  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emiPaymentSchema.safeParse({ contractId: contract.id, idempotencyKey: paymentKey, ...paymentValues });
    if (!parsed.success) { setPaymentErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; }
    if (parsed.data.amount > outstanding) { setPaymentErrors({ amount: t('emi.paymentExceedsOutstanding') }); return; }
    if (paymentPending || settlePending || submitting.current) return;
    setPaymentErrors({}); setConfirmation({ kind: 'payment', data: new FormData(event.currentTarget), amount: parsed.data.amount, discount: 0, method: parsed.data.paymentMethod });
  }
  function submitSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emiEarlySettlementSchema.safeParse({ contractId: contract.id, idempotencyKey: settleKey, ...settleValues });
    if (!parsed.success) { setSettleErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; }
    if (parsed.data.discountAmount >= outstanding) { setSettleErrors({ discountAmount: t('emi.discountBelowOutstanding') }); return; }
    if (paymentPending || settlePending || submitting.current) return;
    setSettleErrors({}); setConfirmation({ kind: 'settlement', data: new FormData(event.currentTarget), amount: outstanding - parsed.data.discountAmount, discount: parsed.data.discountAmount, method: parsed.data.paymentMethod });
  }
  function confirmSubmission() {
    if (!confirmation || submitting.current) return;
    submitting.current = true;
    const { kind, data } = confirmation;
    setConfirmation(null);
    startTransition(() => { if (kind === 'payment') paymentAction(data); else settleAction(data); });
  }
  return <div className="space-y-4">
    <dialog ref={confirmDialog} onCancel={() => setConfirmation(null)} onClose={() => setConfirmation(null)} aria-labelledby="emi-confirm-title" className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-xl border border-rule bg-card p-0 text-ink shadow-xl backdrop:bg-black/45">
      {confirmation && <div className="p-5">
        <h2 id="emi-confirm-title" className="text-lg font-semibold">{t(confirmation.kind === 'payment' ? 'emi.confirmPayment' : 'emi.confirmSettlement')}</h2>
        <p className="mt-2 text-sm text-graphite">{t('emi.confirmHelp')}</p>
        <dl className="my-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt>{t('emi.contract')}</dt><dd className="font-medium">{contract.contractNumber}</dd></div>
          {confirmation.kind === 'settlement' && <div className="flex justify-between gap-3"><dt>{t('emi.earlySettlementDiscount')}</dt><dd className="tnum">{formatBDT(confirmation.discount)}</dd></div>}
          <div className="flex justify-between gap-3"><dt>{t('emi.amountReceived')}</dt><dd className="tnum font-semibold">{formatBDT(confirmation.amount)}</dd></div>
          <div className="flex justify-between gap-3"><dt>{t('emi.paymentMethod')}</dt><dd>{domainLabel(t, confirmation.method as PaymentMethod)}</dd></div>
          <div className="flex justify-between gap-3"><dt>{t('emi.outstanding')}</dt><dd className="tnum">{formatBDT(outstanding - confirmation.amount - confirmation.discount)}</dd></div>
        </dl>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" autoFocus onClick={() => setConfirmation(null)}>{t('common.cancel')}</Button><Button type="button" disabled={paymentPending || settlePending} onClick={confirmSubmission}>{t(confirmation.kind === 'payment' ? 'emi.confirmPayment' : 'emi.confirmSettlement')}</Button></div>
      </div>}
    </dialog>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="!rounded-xl p-4"><p className="eyebrow">{t('emi.totalCard')}</p><p className="tnum mt-1 text-[19px] font-semibold">{formatBDT(contract.emiTotal)}</p></Card>
      <Card className="!rounded-xl p-4"><p className="eyebrow">{t('emi.paidTowardInstallments')}</p><p className="tnum mt-1 text-[19px] font-semibold text-ok">{formatBDT(paid)}</p></Card>
      <Card className="!rounded-xl p-4"><p className="eyebrow">{t('emi.outstanding')}</p><p className="tnum mt-1 text-[19px] font-semibold text-out">{formatBDT(outstanding)}</p></Card>
      <Card className="!rounded-xl p-4"><p className="eyebrow">{t('emi.upfrontCredit')}</p><p className="tnum mt-1 text-[19px] font-semibold">{formatBDT(contract.downPayment + contract.tradeInCredit)}</p></Card>
    </div>

    {earlySettlement && <Card className="!rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t('emi.earlySettlementSummary')}</h2>
        <Badge tone="ok">{t('emi.settled')}</Badge>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="eyebrow">{t('emi.dueBeforeDiscount')}</dt><dd className="tnum mt-1 font-semibold">{formatBDT(earlySettlement.outstandingBefore)}</dd></div>
        <div><dt className="eyebrow">{t('emi.earlySettlementDiscount')}</dt><dd className="tnum mt-1 font-semibold text-ok">-{formatBDT(earlySettlement.discountAmount)}</dd></div>
        <div><dt className="eyebrow">{t('emi.finalSettlementAmount')}</dt><dd className="tnum mt-1 font-semibold">{formatBDT(earlySettlement.finalAmount)}</dd></div>
        <div><dt className="eyebrow">{t('emi.approvedBy')}</dt><dd className="mt-1 font-medium">{earlySettlement.approvedByName}</dd><dd className="text-[12px] text-graphite">{formatDhakaDateTime(earlySettlement.approvedAt)}</dd></div>
        <div className="sm:col-span-2 lg:col-span-4"><dt className="eyebrow">{t('emi.approvalReason')}</dt><dd className="mt-1 text-[13px]">{earlySettlement.reason}</dd></div>
      </dl>
    </Card>}

    <InstallmentSchedule contract={contract} installments={installments} settlement={earlySettlement} />

    {canCollect && open && <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="!rounded-xl p-4"><h2 className="mb-1 font-semibold">{t('emi.recordPayment')}</h2><p className="mb-3 text-[12px] text-graphite">{t('emi.oldestFirstHelp')}</p><form noValidate onSubmit={submitPayment} className="space-y-3">
        <input type="hidden" name="contractId" value={contract.id}/><input type="hidden" name="idempotencyKey" value={paymentKey}/>
        <Field label={t('emi.installmentsBeingPaid')}>
          <Select value={paymentPlan} onChange={(event) => choosePaymentPlan(event.target.value)}>
            {openInstallments.map((row, index) => {
              const selected = openInstallments.slice(0, index + 1);
              const amount = selected.reduce((sum, item) => sum + item.amountDue - item.amountPaid, 0);
              const first = selected[0]!.sequence; const last = selected.at(-1)!.sequence;
              return <option key={row.id} value={index + 1}>{t(index ? 'emi.nextInstallments' : 'emi.nextInstallment', { count: index + 1 })} · #{first}{last !== first ? `–#${last}` : ''} · {formatBDT(amount)}</option>;
            })}
            <option value="custom">{t('emi.customPayment')}</option>
          </Select>
        </Field>
        <Field label={t('emi.amountReceived')} error={paymentError('amount')}><Input name="amount" inputMode="numeric" step="1" readOnly={paymentPlan !== 'custom'} className={paymentPlan !== 'custom' ? 'bg-plate' : undefined} value={paymentValues.amount} onChange={(event) => updatePayment('amount', event.target.value)} placeholder={t('emi.wholeTakaPlaceholder')}/></Field>
        {paymentAllocation.length > 0 && <div className="rounded-[3px] border border-rule bg-plate/60 px-3 py-2 text-[12px]"><span className="font-medium">{t('emi.allocationPreview')}</span> {paymentAllocation.map((item) => `#${item.sequence} ${formatBDT(item.amount)}`).join(' · ')}</div>}
        <Field label={t('emi.paymentMethod')} error={paymentError('paymentMethod')}><Select name="paymentMethod" value={paymentValues.paymentMethod} onChange={(event) => updatePayment('paymentMethod', event.target.value)}>{methods.map((method) => <option key={method} value={method}>{domainLabel(t, method)}</option>)}</Select></Field>
        <Field label={t('common.reference')} error={paymentError('reference')}><Input name="reference" maxLength={120} value={paymentValues.reference} onChange={(event) => updatePayment('reference', event.target.value)}/></Field><Field label={t('common.note')} error={paymentError('note')}><Textarea name="note" rows={2} value={paymentValues.note} onChange={(event) => updatePayment('note', event.target.value)}/></Field>
        <Button disabled={paymentPending || settlePending || !paymentKey}>{paymentPending ? t('emi.recording') : t('emi.recordPaymentButton')}</Button>
        {paymentState.error && <p className="text-[12px] text-out">{message(paymentState.error)}</p>}
      </form></Card>
      <Card className="!rounded-xl p-4"><h2 className="mb-1 font-semibold">{t('emi.earlySettlement')}</h2><p className="mb-3 text-[12px] text-graphite">{t('emi.earlySettlementHelp')}</p><form noValidate onSubmit={submitSettlement} className="space-y-3">
        <input type="hidden" name="contractId" value={contract.id}/><input type="hidden" name="idempotencyKey" value={settleKey}/>
        <div className="mb-3 rounded-lg border border-rule bg-plate/50 p-3 text-[13px]"><p className="flex justify-between gap-3"><span>{t('emi.dueBeforeDiscount')}</span><strong className="tnum">{formatBDT(outstanding)}</strong></p><p className="mt-2 flex justify-between gap-3"><span>{t('emi.finalSettlementAmount')}</span><strong className="tnum">{formatBDT(Math.max(0, outstanding - settlementDiscount))}</strong></p></div><Field label={t('emi.approvedDiscount')} error={settleError('discountAmount')}><Input name="discountAmount" inputMode="numeric" step="1" value={settleValues.discountAmount} onChange={(event) => updateSettlement('discountAmount', event.target.value)} placeholder="0"/></Field>
        <Field label={t('emi.paymentMethod')} error={settleError('paymentMethod')}><Select name="paymentMethod" value={settleValues.paymentMethod} onChange={(event) => updateSettlement('paymentMethod', event.target.value)}>{methods.map((method) => <option key={method} value={method}>{domainLabel(t, method)}</option>)}</Select></Field>
        <Field label={t('emi.approvalReason')} error={settleError('reason')}><Textarea name="reason" rows={2} value={settleValues.reason} onChange={(event) => updateSettlement('reason', event.target.value)}/></Field><Field label={t('common.reference')} error={settleError('reference')}><Input name="reference" value={settleValues.reference} onChange={(event) => updateSettlement('reference', event.target.value)}/></Field>
        <Button disabled={settlePending || paymentPending || !settleKey}>{settlePending ? t('emi.settling') : t('emi.approveSettle')}</Button>
        {settleState.error && <p className="text-[12px] text-out">{message(settleState.error)}</p>}
      </form></Card>
    </div>}

    <Card className="overflow-auto"><div className="border-b border-rule px-4 py-3"><h2 className="font-semibold">{t('emi.paymentReceipts')}</h2></div>
      {payments.length === 0 ? <p className="p-6 text-center text-graphite">{t('emi.noPayments')}</p> : <table className="w-full min-w-[780px] text-[13px]"><thead><tr className="border-b border-rule"><th className="eyebrow px-3 py-2.5 text-center">{t('emi.receipt')}</th><th className="eyebrow px-3 py-2.5 text-center">{t('common.date')}</th><th className="eyebrow px-3 py-2.5 text-center">{t('emi.appliedTo')}</th><th className="eyebrow px-3 py-2.5 text-center">{t('emi.amount')}</th><th className="eyebrow px-3 py-2.5 text-center">{t('emi.method')}</th><th className="eyebrow px-3 py-2.5 text-center">{t('emi.recordedBy')}</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className={`border-b border-rule-soft transition-colors last:border-0 hover:bg-plate/40 ${payment.status === 'REVERSED' ? 'text-graphite' : ''}`}><td className="px-3 py-2.5 text-center"><Link className="text-signal hover:underline" href={`/emi/${contract.id}/receipts/${payment.id}`}>{payment.receiptNumber}</Link></td><td className="px-3 py-2.5 text-center">{formatDhakaDateTime(payment.paidAt)}</td><td className="px-3 py-2.5 text-center">{(allocationsByPayment[payment.id] ?? []).map((row) => `#${row.sequence}`).join(', ') || '—'}</td><td className="tnum px-3 py-2.5 text-center">{formatBDT(payment.amount)}</td><td className="px-3 py-2.5 text-center">{domainLabel(t, payment.paymentMethod)}</td><td className="px-3 py-2.5 text-center">{payment.recordedByName}</td></tr>)}</tbody></table>}
    </Card>
    {paymentState.receiptId && !dismissedReceiptIds.has(paymentState.receiptId) && <ReceiptSuccessModal contractId={contract.id} receiptId={paymentState.receiptId} receiptNumber={paymentState.receiptNumber} title={t('emi.paymentRecorded')} message={t('emi.paymentRecordedHelp')} onClose={() => setDismissedReceiptIds((current) => new Set(current).add(paymentState.receiptId!))} />}
    {settleState.receiptId && !dismissedReceiptIds.has(settleState.receiptId) && <ReceiptSuccessModal contractId={contract.id} receiptId={settleState.receiptId} receiptNumber={settleState.receiptNumber} title={t('emi.settled')} message={t('emi.settledHelp')} onClose={() => setDismissedReceiptIds((current) => new Set(current).add(settleState.receiptId!))} />}
  </div>;
}

function ReceiptSuccessModal({ contractId, receiptId, receiptNumber, title, message, onClose }: { contractId: string; receiptId: string; receiptNumber?: string; title: string; message: string; onClose: () => void }) {
  const { t } = useI18n();
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-labelledby="emi-receipt-success-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <Card className="w-full max-w-lg shadow-xl">
      <div className="flex items-start justify-between border-b border-rule p-5">
        <div className="flex items-center gap-3"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ok-wash text-ok"><Check className="size-5" /></span><div><h2 id="emi-receipt-success-title" className="text-[20px] font-semibold">{title}</h2><p className="mt-1 text-[13px] text-graphite">{message}</p></div></div>
        <button type="button" className="inline-flex size-9 items-center justify-center rounded-[3px] border border-rule text-graphite transition-colors hover:border-out hover:bg-out-wash hover:text-out" onClick={onClose} aria-label={t('common.close')}><X className="size-5" /></button>
      </div>
      <div className="p-5"><p className="eyebrow">{t('emi.receiptNumber')}</p><p className="tnum mt-1 rounded-[3px] bg-plate px-3 py-2 text-[16px] font-semibold">{receiptNumber ?? t('emi.receiptCreated')}</p></div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule p-4"><Button type="button" variant="ghost" onClick={onClose}>{t('common.close')}</Button><Link href={`/emi/${contractId}/receipts/${receiptId}`} className="inline-flex h-9 items-center rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white transition-colors hover:border-blue-800 hover:bg-blue-800">{t('emi.viewPrintReceipt')}</Link></div>
    </Card>
  </div>;
}
