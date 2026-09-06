'use client';

import { startTransition, useActionState, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { acceptUsedDeviceAction, saveTradeInDraftAction, type UsedDeviceActionState } from '@/actions/used-devices';
import { Button, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { formatBDT, toTaka } from '@/lib/money';
import { usedDeviceInspectionGroups as inspectionGroups } from '@/lib/used-device-inspection';
import { usedDeviceFieldsSchema, usedDeviceFormInput, usedDeviceFieldErrors, tradeInEmiError } from '@/lib/used-device-form';
import { cosmeticSummary } from '@/lib/cosmetic-condition';
import type { AcceptUsedDeviceInput } from '@/schemas';
import type { Customer, TradeInCartDraft } from '@/domain/types';
import { StockProductCombobox } from './StockProductCombobox';
import { CosmeticConditionFields } from './CosmeticConditionFields';
import { ReceiptDialog } from './ReceiptDialog';

export interface IntakeProductOption { id: string; sku: string; name: string; model?: string | null; barcode?: string | null }
type Props = {
  products: IntakeProductOption[];
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
} & ({ mode: 'purchase' } | {
  mode: 'trade-in'; cartId: string; initialDraft?: TradeInCartDraft | null;
  customer?: Customer | null;
  checkoutContext: { isEmi: boolean; total: number; downPayment: number };
  onSaved: (draft: TradeInCartDraft) => void;
});

export function UsedDeviceIntakeForm(props: Props) {
  const { products, mode } = props;
  const initial = props.mode === 'trade-in' ? props.initialDraft : null;
  const { t, message } = useI18n();
  const localize = (value: string) => value.startsWith('used.') ? t(value as MessageKey) : message(value);
  const [state, action, pending] = useActionState<UsedDeviceActionState, FormData>(mode === 'trade-in' ? saveTradeInDraftAction : acceptUsedDeviceAction, {});
  const [key, setKey] = useState('');
  const [productId, setProductId] = useState(initial?.productId ?? '');
  const [warrantyUnit, setWarrantyUnit] = useState(initial?.warrantyDays != null ? 'DAYS' : 'MONTHS');
  const [inspection, setInspection] = useState<Record<string, string>>(initial?.inspectionResults ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [review, setReview] = useState<AcceptUsedDeviceInput | null>(null);
  const [locked, setLocked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submission = useRef<FormData | null>(null);
  const inFlight = useRef(false);
  const focusErrors = useRef(false);
  const callbacks = useRef(props);
  const handledState = useRef<UsedDeviceActionState | null>(null);
  const id = useId();
  const busy = locked || pending;
  useEffect(() => { callbacks.current = props; });
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => { props.onBusyChange?.(busy); }, [busy, props.onBusyChange]);
  useEffect(() => {
    if (handledState.current === state) return;
    handledState.current = state;
    inFlight.current = false; setLocked(false);
    if (state.error) { focusErrors.current = true; setErrors(state.fieldErrors ?? {}); setFormError(state.error); if (state.fieldErrors) setReview(null); }
    if (state.receipt) { setReview(null); callbacks.current.onDirtyChange?.(false); }
    if (state.tradeInDraft && callbacks.current.mode === 'trade-in') {
      callbacks.current.onDirtyChange?.(false);
      callbacks.current.onSaved(state.tradeInDraft);
    }
  }, [state]);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let first: HTMLElement | null = null;
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[name]')) {
      const field = input.name.startsWith('inspection.') ? input.name.replace('inspection.', 'inspectionResults.') : input.name;
      const invalid = Boolean(errors[field]);
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid) {
        input.setAttribute('aria-describedby', `${id}-${field}-error`);
        for (let parent = input.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
        if (input.type !== 'hidden') first ??= input;
      } else input.removeAttribute('aria-describedby');
    }
    if (errors.productId) first = form.querySelector('[role="combobox"]');
    if (focusErrors.current) { first?.focus(); focusErrors.current = false; }
  }, [errors, id]);

  function changed(name?: string) {
    callbacks.current.onDirtyChange?.(true);
    if (name) setErrors(current => {
      const next = { ...current };
      delete next[name.replace('inspection.', 'inspectionResults.')];
      if (name === 'warrantyUnit') delete next.warrantyDuration;
      return next;
    });
    setFormError('');
  }
  function send() {
    if (inFlight.current || !submission.current) return;
    inFlight.current = true; setLocked(true); setFormError('');
    startTransition(() => action(submission.current!));
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !key) return;
    const data = new FormData(event.currentTarget);
    const result = usedDeviceFieldsSchema.safeParse(usedDeviceFormInput(data, mode));
    if (!result.success) { focusErrors.current = true; setErrors(usedDeviceFieldErrors(result.error)); setFormError('used.fixErrors'); return; }
    const emiError = tradeInEmiError(result.data.acquisitionValue, props.mode === 'trade-in' ? props.checkoutContext : undefined);
    if (emiError) { focusErrors.current = true; setErrors({ acquisitionValue: emiError }); setFormError('used.fixErrors'); return; }
    setErrors({}); setFormError(''); submission.current = data;
    if (mode === 'trade-in') send();
    else setReview(result.data);
  }
  function useCustomer() {
    if (props.mode !== 'trade-in' || !props.customer || !formRef.current) return;
    const type = { NID: 'National Identification Number', PASSPORT: 'Passport', BIRTH_CERTIFICATE: 'Birth Certificate Number' };
    const values = { sellerName: props.customer.name, sellerPhone: props.customer.phone ?? '',
      identificationType: props.customer.identificationType ? type[props.customer.identificationType] : '',
      identificationNumber: props.customer.identificationNumber ?? '' };
    for (const [name, value] of Object.entries(values)) {
      const input = formRef.current.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (input && !input.value.trim()) { input.value = value; changed(name); }
    }
  }
  function field(label: string, name: string, child: ReactNode, hint?: string) {
    return <label key={name} className="block min-w-0 text-sm"><span className="mb-1.5 block font-medium">{label}</span>{child}
      {errors[name] ? <span id={`${id}-${name}-error`} className="mt-1 block text-xs text-out">{localize(errors[name])}</span> : hint ? <span className="mt-1 block text-xs text-graphite">{hint}</span> : null}
    </label>;
  }
  const valueLabel = mode === 'trade-in' ? t('used.creditPrice') : t('used.purchasePrice');
  const gradeLabel = (grade: string) => t(grade === 'GRADE_A' ? 'used.gradeA' : grade === 'GRADE_B' ? 'used.gradeB' : grade === 'GRADE_C' ? 'used.gradeC' : 'used.refurbished');
  function inspectionFields(group: (typeof inspectionGroups)[number]) {
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.items.map(([name, label]) => field(t(label), `inspectionResults.${name}`,
      <Select name={`inspection.${name}`} defaultValue={initial?.inspectionResults[name] ?? 'NOT_TESTED'} onChange={event => setInspection(current => ({ ...current, [name]: event.target.value }))}>
        <option value="NOT_TESTED">{t('used.notTested')}</option><option value="WORKING">{t('used.working')}</option>
        <option value="DEFECTIVE">{t('used.issueFound')}</option><option value="NOT_APPLICABLE">{t('used.notApplicable')}</option>
      </Select>, name === 'frameAndBack' ? t('used.bodyHelp') : undefined))}</div>;
  }
  return <>
    <form ref={formRef} onSubmit={prepare} noValidate className="used-intake-form" onChange={event => changed((event.target as unknown as HTMLInputElement).name)}>
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="acquisitionType" value={mode === 'trade-in' ? 'TRADE_IN' : 'DIRECT_PURCHASE'} />
      {props.mode === 'trade-in' && <input type="hidden" name="cartId" value={props.cartId} />}
      <fieldset disabled={busy || Boolean(review) || Boolean(state.receipt)} className="min-w-0 space-y-5">
        <section className="intake-section">
          <h2>{t('used.phoneDetails')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StockProductCombobox products={products.map(product => ({ ...product, model: product.model ?? null, barcode: product.barcode ?? null, isActive: true, trackingType: 'SERIAL' }))} value={productId} disabled={busy} error={errors.productId ? localize(errors.productId) : undefined} onChange={value => { setProductId(value); changed('productId'); }} />
            {field(t('used.deviceNumber'), 'serialNo', <MonoInput name="serialNo" required maxLength={120} autoComplete="off" defaultValue={initial?.serialNo ?? ''} placeholder={t('used.deviceNumberPlaceholder')} />)}
            {field(t('used.batteryHealth'), 'batteryHealth', <MonoInput name="batteryHealth" type="number" min={0} max={100} step={1} defaultValue={initial?.batteryHealth ?? ''} placeholder={t('common.notRecorded')} />, t('used.batteryHealthHelp'))}
          </div>

        </section>
        <section className="intake-section">
          <h2>{t('used.condition')}</h2>
          <div className="mt-4 border-t border-rule pt-4"><h3 className="mb-3 font-medium">{t('used.appearance')}</h3><CosmeticConditionFields value={initial?.cosmeticCondition} errors={errors} errorIdPrefix={id} /></div>
          <div className="mt-5 border-t border-rule pt-4"><h3 className="mb-2 font-medium">{t('used.identityOwnership')}</h3><p className="mb-3 text-xs text-graphite">{t('used.inspectionHelp')}</p>{inspectionFields(inspectionGroups[0])}</div>
          {inspectionGroups.slice(1).map(group => <details open key={group.title} className="mt-3 rounded-lg border border-rule p-3"><summary className="cursor-pointer text-sm font-medium">{t(group.title)}<span className="ml-2 font-normal text-graphite">{t('used.inspectionCount', { issues: group.items.filter(([key]) => inspection[key] === 'DEFECTIVE').length, untested: group.items.filter(([key]) => !inspection[key] || inspection[key] === 'NOT_TESTED').length })}</span></summary><div className="mt-3">{inspectionFields(group)}</div></details>)}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field(t('used.faults'), 'knownDefects', <Textarea name="knownDefects" rows={3} maxLength={2000} defaultValue={initial?.knownDefects ?? ''} placeholder={t('used.knownDefectsPlaceholder')} />)}
            {field(t('used.accessories'), 'includedAccessories', <Textarea name="includedAccessories" maxLength={1000} rows={3} defaultValue={initial?.includedAccessories ?? ''} placeholder={t('used.accessoriesPlaceholder')} />)}
          </div>
        </section>
        <section className="intake-section">
          <h2>{t('used.sellerValue')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field(t('used.sellerName'), 'sellerName', <Input name="sellerName" required maxLength={150} defaultValue={initial?.sellerName ?? ''} autoComplete="name" />)}
            {field(t('used.sellerPhone'), 'sellerPhone', <MonoInput name="sellerPhone" type="tel" required maxLength={30} defaultValue={initial?.sellerPhone ?? ''} placeholder="01712345678" />)}
            {field(t('used.identificationType'), 'identificationType', <Select name="identificationType" defaultValue={initial?.identificationType ?? ''}><option value="">{t('common.notRecorded')}</option><option value="National Identification Number">{t('used.nationalIdentification')}</option><option value="Passport">{t('used.passport')}</option><option value="Birth Certificate Number">{t('used.birthCertificate')}</option>{initial?.identificationType && !['National Identification Number', 'Passport', 'Birth Certificate Number'].includes(initial.identificationType) && <option value={initial.identificationType}>{initial.identificationType}</option>}</Select>)}
            {field(t('used.identificationNumber'), 'identificationNumber', <Input name="identificationNumber" maxLength={150} defaultValue={initial?.identificationNumber ?? ''} />)}
          </div>
          {props.mode === 'trade-in' && props.customer && <div className="mt-3"><Button type="button" variant="ghost" onClick={useCustomer}>{t('used.useCustomer')}</Button><p className="mt-1 text-xs text-graphite">{t('used.copyHelp')}</p></div>}
          <div className="mt-4 grid gap-4 border-t border-rule pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {field(valueLabel, 'acquisitionValue', <MonoInput name="acquisitionValue" required inputMode="decimal" defaultValue={initial ? String(toTaka(initial.acquisitionValue)) : ''} />, props.mode === 'trade-in' && props.checkoutContext.isEmi ? t('used.emiHint', { total: formatBDT(props.checkoutContext.total) }) : undefined)}
          {field(t('used.resalePrice'), 'askingPrice', <MonoInput name="askingPrice" required inputMode="decimal" defaultValue={initial ? String(toTaka(initial.askingPrice)) : ''} />)}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] gap-2">
          {field(t('used.warrantyDuration'), 'warrantyDuration', <MonoInput name="warrantyDuration" type="number" min={0} max={warrantyUnit === 'DAYS' ? 3650 : 120} defaultValue={initial?.warrantyDays ?? initial?.warrantyMonths ?? ''} />)}
          {field(t('stock.warrantyUnitLabel'), 'warrantyUnit', <Select name="warrantyUnit" value={warrantyUnit} onChange={event => setWarrantyUnit(event.target.value)}><option value="DAYS">{t('used.warrantyDays')}</option><option value="MONTHS">{t('used.warrantyMonths')}</option></Select>)}
          </div>
        </div></section>
        <details open className="intake-section"><summary className="cursor-pointer font-medium">{t('used.additional')}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field(t('common.location'), 'location', <Input name="location" maxLength={100} defaultValue={initial?.location ?? ''} />)}
          {field(t('common.reference'), 'reference', <Input name="reference" maxLength={100} defaultValue={initial?.reference ?? ''} />)}
          {field(t('common.note'), 'note', <Textarea name="note" maxLength={1000} rows={2} defaultValue={initial?.note ?? ''} />)}
        </div></details>
        <section className="intake-section">
          <h2>{t('used.grade')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field(t('used.grade'), 'grade', <Select name="grade" required defaultValue={initial?.grade ?? ''}><option value="">{t('used.chooseGrade')}</option>{['GRADE_A', 'GRADE_B', 'GRADE_C', 'REFURBISHED'].map(grade => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}</Select>)}
          </div>
          <details open className="mt-4 rounded-[3px] border border-rule bg-plate/30 text-sm"><summary className="cursor-pointer p-4 font-medium">{t('used.gradeGuide')}</summary><dl className="grid gap-4 border-t border-rule p-4 sm:grid-cols-2">{(['A', 'B', 'C'] as const).map(grade => <div key={grade}><dt className="font-medium">{t(`used.grade${grade}`)}</dt><dd className="text-graphite">{t(`used.grade${grade}Definition`)}</dd></div>)}<div><dt className="font-medium">{t('used.refurbished')}</dt><dd className="text-graphite">{t('used.refurbishedDefinition')}</dd></div></dl></details>
        </section>
      </fieldset>
      <div className="mt-4 border-t border-rule bg-card p-4">
        {formError && !review && <p role="alert" className="mb-3 text-sm text-out">{localize(formError)}</p>}
        {Object.entries(errors).filter(([name]) => name === '_' || name === 'idempotencyKey').map(([name, error]) => <p key={name} id={`${id}-${name}-error`} className="mb-2 text-sm text-out">{localize(error)}</p>)}
        <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 shrink-0" disabled={busy || Boolean(review) || Boolean(state.receipt)} name="ownershipConfirmed" required defaultChecked={Boolean(initial)} /><span>{t('used.ownershipDeclaration')}</span></label>
        {errors.ownershipConfirmed && <p id={`${id}-ownershipConfirmed-error`} className="mt-1 text-xs text-out">{localize(errors.ownershipConfirmed)}</p>}
        <div className="mt-3 flex gap-2">{props.onCancel && <Button type="button" variant="ghost" disabled={busy} onClick={props.onCancel}>{t('common.cancel')}</Button>}<Button type="submit" disabled={busy || !key || !products.length || Boolean(state.receipt)}>{busy ? t('common.saving') : mode === 'trade-in' ? t('used.saveTradeIn') : t('used.reviewReceipt')}</Button></div>
      </div>
    </form>
    {review && <ReceiptDialog title={t('used.confirmTitle')} description={t('used.confirmHelp')} busy={busy} onClose={() => { if (!busy) setReview(null); }}>
      <div className="space-y-4 p-5 text-sm"><p className="font-semibold">{products.find(product => product.id === review.productId)?.name} · {review.serialNo}</p><p>{review.sellerName} · {review.sellerPhone}</p><p>{gradeLabel(review.grade)}{review.batteryHealth != null ? ` · ${review.batteryHealth}%` : ''}</p>
        {cosmeticSummary(review.cosmeticCondition, t) && <p>{cosmeticSummary(review.cosmeticCondition, t)}</p>}
        <p>{review.knownDefects}</p><div className="grid grid-cols-2 gap-3"><p>{valueLabel}<strong className="block text-lg">{formatBDT(review.acquisitionValue)}</strong></p><p>{t('used.resalePrice')}<strong className="block text-lg">{formatBDT(review.askingPrice)}</strong></p></div>
        <p>{t('used.warrantyDuration')}: {review.warrantyDays != null ? `${review.warrantyDays} ${t('used.warrantyDays')}` : review.warrantyMonths != null ? `${review.warrantyMonths} ${t('used.warrantyMonths')}` : t('common.notRecorded')}</p>
        <p>{t('used.inspectionCount', { issues: Object.values(review.inspectionResults).filter(value => value === 'DEFECTIVE').length, untested: Object.values(review.inspectionResults).filter(value => value === 'NOT_TESTED').length })}</p>
        <details open><summary className="cursor-pointer">{t('used.additional')}</summary><dl className="mt-3 grid grid-cols-2 gap-3">{([
          ['used.accessories', review.includedAccessories], ['used.identificationType', review.identificationType], ['used.identificationNumber', review.identificationNumber],
          ['common.location', review.location], ['common.reference', review.reference], ['common.note', review.note],
        ] as const).map(([label, value]) => <div key={label}><dt className="text-graphite">{t(label)}</dt><dd className="whitespace-pre-wrap">{value || t('common.notRecorded')}</dd></div>)}</dl></details>
        <details open><summary className="cursor-pointer">{t('used.inspectionChecklist')}</summary>{inspectionGroups.flatMap(group => group.items.map(([name, label]) => <p key={name} className={review.inspectionResults[name] === 'DEFECTIVE' ? 'text-out' : 'text-graphite'}>{t(label)}: {t(review.inspectionResults[name] === 'WORKING' ? 'used.working' : review.inspectionResults[name] === 'DEFECTIVE' ? 'used.issueFound' : review.inspectionResults[name] === 'NOT_APPLICABLE' ? 'used.notApplicable' : 'used.notTested')}</p>))}</details>
        {formError && <p role="alert" className="text-out">{localize(formError)}</p>}
      </div><div className="flex justify-end gap-2 border-t border-rule p-4"><Button type="button" variant="ghost" disabled={busy} onClick={() => setReview(null)}>{t('used.keepEditing')}</Button><Button type="button" disabled={busy} onClick={send}>{busy ? t('common.saving') : t('used.acceptIntoStock')}</Button></div>
    </ReceiptDialog>}
    {state.receipt && <ReceiptDialog title={t('used.acceptedTitle')} description={message(state.ok ?? '')} onClose={() => window.location.assign('/stock/used-intake')}><div className="flex flex-wrap gap-3 p-5"><a className="intake-link" href="/stock/used-intake">{t('used.receiveAnother')}</a><Link className="intake-link" href={`/products/${state.receipt.productId}`}>{t('used.viewProduct')}</Link><Link className="intake-link" href={`/stock/labels?product=${state.receipt.productId}&unit=${state.receipt.unitId}`}>{t('nav.printLabels')}</Link></div></ReceiptDialog>}
  </>;
}
