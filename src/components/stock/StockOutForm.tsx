'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductDTO } from '@/lib/dto';
import type { Supplier } from '@/domain/types';
import { lookupSerial, stockOutAction, type SerialLookup } from '@/actions/stock';
import { removalFieldsSchema, removalFieldErrors, removalSerialSchema, type RemovalReceipt, type RemovalActionState } from '@/lib/stock-removal';
import { Button, Card, Field, Input, MonoInput, Select, Badge } from '@/components/ui';
import { ScannerInput } from '@/components/search/ScannerInput';
import { StockProductCombobox } from './StockProductCombobox';
import { ReceiptDialog } from './ReceiptDialog';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/messages';

const REASONS = { DAMAGE: 'stock.damaged', LOSS: 'stock.lost', SHOP_USE: 'stock.shopUse', GIFT: 'stock.gift', RETURN_TO_SUPPLIER: 'stock.returnSupplier' } as const;
const RETURN_REASONS = { SLOW_MOVING: 'supplierReturns.slowMoving', EXCESS_STOCK: 'supplierReturns.excessStock', WRONG_ITEM: 'supplierReturns.wrongItem', DEFECTIVE: 'supplierReturns.defective', RECALL: 'supplierReturns.recall', OTHER: 'common.other' } as const;
const emptyFields = () => ({ productId: '', serialNo: '', quantity: '', reason: '', supplierId: '', returnReason: '', reference: '', note: '' });
type Fields = ReturnType<typeof emptyFields>;
type Review = { values: Record<string, string>; receipt: RemovalReceipt };
const linkStyle = 'inline-flex h-9 items-center justify-center rounded-[3px] border border-rule bg-card px-3.5 text-[13px] font-medium text-ink hover:bg-plate';

export function StockOutForm({ bulkProducts, suppliers, initialSerial }: { bulkProducts: ProductDTO[]; suppliers: Supplier[]; initialSerial?: string }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<'serial' | 'bulk'>('serial');
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [serial, setSerial] = useState(initialSerial ?? '');
  const [found, setFound] = useState<SerialLookup>();
  const [looking, setLooking] = useState(false);
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RemovalActionState>({});
  const [review, setReview] = useState<Review>();
  const [available, setAvailable] = useState<number>();
  const scannerFormRef = useRef<HTMLFormElement>(null);
  const scannerRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const resultButtonRef = useRef<HTMLButtonElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const lookupSequence = useRef(0);
  const saving = useRef(false);
  const focusAfterReset = useRef(false);
  const busy = pending || looking;
  const frozen = busy || Boolean(review);
  const selected = bulkProducts.find(product => product.id === fields.productId);
  const count = available ?? selected?.quantityOnHand;
  const text = (value: string) => value.startsWith('removal.') ? t(value as MessageKey) : message(value);
  const reasonText = (value: string) => t(REASONS[value as keyof typeof REASONS] ?? 'stock.internalUse');
  const returnReasonText = (value: string) => t(RETURN_REASONS[value as keyof typeof RETURN_REASONS] ?? 'common.other');

  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => {
    if (review || pending) return;
    if (Object.keys(errors).length) {
      const control = rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      control?.focus(); control?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [errors, review, pending]);
  useEffect(() => { if (result.receipt) resultButtonRef.current?.focus(); }, [result.receipt]);
  useEffect(() => {
    if (!focusAfterReset.current) return;
    focusAfterReset.current = false;
    if (mode === 'serial') scannerRef.current?.focus();
    else rootRef.current?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus();
  }, [mode, result]);

  function reset(nextMode = mode) {
    lookupSequence.current++;
    setMode(nextMode); setFields(emptyFields()); setSerial(''); setFound(undefined); setErrors({}); setResult({});
    setReview(undefined); setAvailable(undefined); setKey(crypto.randomUUID()); setLooking(false);
    focusAfterReset.current = true;
  }
  function update(name: keyof Fields, value: string) {
    setFields(current => ({ ...current, [name]: value }));
    setErrors(current => { const next = { ...current }; delete next[name]; return next; });
    setResult({});
  }
  function chooseProduct(id: string) {
    setFields({ ...emptyFields(), productId: id }); setErrors({}); setResult({}); setAvailable(undefined); setKey(crypto.randomUUID());
  }
  async function findDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || looking || review) return;
    const parsed = removalSerialSchema.safeParse(serial);
    if (!parsed.success) { setErrors({ serialNo: parsed.error.issues[0]?.message ?? 'removal.invalid' }); return; }
    const sequence = ++lookupSequence.current;
    setLooking(true); setFound(undefined); setErrors({}); setResult({});
    const data = new FormData(); data.set('serialNo', parsed.data);
    try {
      const response = await lookupSerial({}, data);
      if (sequence !== lookupSequence.current) return;
      if (response.error) setErrors({ serialNo: response.error });
      if (response.found) {
        setFound(response.found);
        setFields({ ...emptyFields(), productId: response.found.productId, serialNo: response.found.unit.serialNo,
          supplierId: suppliers.some(supplier => supplier.id === response.found!.unit.supplierId) ? response.found.unit.supplierId! : '' });
        setKey(crypto.randomUUID());
      }
    } catch { if (sequence === lookupSequence.current) setErrors({ serialNo: 'removal.lookupFailed' }); }
    finally { if (sequence === lookupSequence.current) setLooking(false); }
  }
  function requestReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (frozen || saving.current) return;
    const values = { ...fields, mode, idempotencyKey: key };
    const parsed = removalFieldsSchema.safeParse(values);
    if (!parsed.success) { setErrors(removalFieldErrors(parsed.error)); return; }
    if (mode === 'serial' && (!found || found.unit.serialNo !== fields.serialNo)) { setErrors({ serialNo: 'removal.deviceUnavailable' }); return; }
    if (mode === 'bulk' && (!selected || parsed.data.quantity! > (count ?? 0))) { setErrors({ quantity: 'removal.insufficient' }); return; }
    if (parsed.data.supplierId && !suppliers.some(supplier => supplier.id === parsed.data.supplierId)) { setErrors({ supplierId: 'removal.supplierUnavailable' }); return; }
    setErrors({}); setResult({});
    setReview({ values, receipt: {
      movementId: '', productId: fields.productId, productName: found?.productName ?? selected!.name, sku: found?.sku ?? selected!.sku,
      serialNo: parsed.data.serialNo ?? null, quantity: parsed.data.quantity ?? 1, reason: parsed.data.reason,
      note: parsed.data.note, reference: parsed.data.reference,
      ...(parsed.data.supplierId ? { supplierReturn: { id: '', returnNumber: '', supplierName: suppliers.find(supplier => supplier.id === parsed.data.supplierId)!.name, returnReason: parsed.data.returnReason! } } : {}),
    } });
  }
  async function confirmRemoval() {
    if (!review || saving.current) return;
    saving.current = true; setPending(true); setResult({});
    const data = new FormData(); Object.entries(review.values).forEach(([name, value]) => data.set(name, value));
    try {
      const response = await stockOutAction({}, data);
      setResult(response);
      if (response.receipt) { setReview(undefined); setErrors({}); router.refresh(); }
      else if (response.outcome === 'rejected') {
        setReview(undefined); setErrors(response.fieldErrors ?? { _: response.error ?? 'removal.invalid' });
        if (response.available !== undefined) setAvailable(response.available);
        if (response.unavailableSerial) setFound(undefined);
        router.refresh();
      } else setResult({ ...response, outcome: 'unconfirmed', error: response.error ?? 'removal.unconfirmed' });
    } catch { setResult({ outcome: 'unconfirmed', error: 'removal.unconfirmed' }); }
    finally { saving.current = false; setPending(false); }
  }
  function error(name: string) { return errors[name] ? text(errors[name]) : undefined; }
  function control(name: keyof Fields) {
    return { name, value: fields[name], disabled: frozen, 'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `removal-${name}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(name, event.target.value) };
  }
  function fieldError(name: string) { return errors[name] ? <span id={`removal-${name}-error`}>{error(name)}</span> : undefined; }
  function summary(receipt: RemovalReceipt) {
    return <dl className="grid gap-4 sm:grid-cols-2 text-[13px]">
      <div className="sm:col-span-2 min-w-0"><dt className="eyebrow">{t('common.product')}</dt><dd className="mt-1 break-words font-medium">{receipt.productName}</dd><dd className="tnum mt-1 break-all text-ink">{receipt.sku}</dd></div>
      <div><dt className="eyebrow">{receipt.serialNo ? t('removal.device') : t('removal.quantity')}</dt><dd className="tnum mt-1 break-all">{receipt.serialNo ?? receipt.quantity}</dd></div>
      <div><dt className="eyebrow">{t('removal.reason')}</dt><dd className="mt-1">{reasonText(receipt.reason)}</dd></div>
      {receipt.supplierReturn && <><div><dt className="eyebrow">{t('common.supplier')}</dt><dd className="mt-1 break-words">{receipt.supplierReturn.supplierName}</dd></div><div><dt className="eyebrow">{t('supplierReturns.returnReason')}</dt><dd className="mt-1">{returnReasonText(receipt.supplierReturn.returnReason)}</dd></div>
        {receipt.supplierReturn.returnNumber && <div><dt className="eyebrow">{t('supplierReturns.returnNumber')}</dt><dd className="tnum mt-1">{receipt.supplierReturn.returnNumber}</dd></div>}</>}
      {receipt.reference && <div><dt className="eyebrow">{t('common.reference')}</dt><dd className="mt-1 break-all">{receipt.reference}</dd></div>}
      {receipt.note && <div className="sm:col-span-2"><dt className="eyebrow">{t('common.note')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{receipt.note}</dd></div>}
    </dl>;
  }

  return <div ref={rootRef} aria-busy={busy}>
    <div className="mb-4 inline-flex rounded-[3px] border border-rule bg-card p-0.5" role="group" aria-label={t('removal.mode')}>
      {(['serial', 'bulk'] as const).map(value => <button key={value} type="button" disabled={frozen} aria-pressed={mode === value} onClick={() => { if (value !== mode) reset(value); }}
        className={`rounded-[2px] px-3 py-1.5 text-[13px] transition-colors disabled:opacity-50 ${mode === value ? 'bg-ink font-medium text-white' : 'text-graphite hover:text-ink'}`}>{t(value === 'serial' ? 'stock.bySerial' : 'stock.byQuantity')}</button>)}
    </div>
    {result.receipt ? <Card className="p-5">
      <p role="status" className="mb-4 text-[14px] font-medium text-ok">{t('stock.removalSuccessTitle')}</p>
      {summary(result.receipt)}
      <div className="mt-5 flex flex-wrap gap-2"><button ref={resultButtonRef} type="button" className="inline-flex h-9 items-center justify-center rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white hover:bg-signal/90" onClick={() => reset()}>{t('removal.another')}</button><Link className={linkStyle} href="/stock/movements">{t('removal.movements')}</Link>
        {result.receipt.supplierReturn && <Link className={linkStyle} href="/suppliers/returns">{t('supplierReturns.viewReturn')}</Link>}</div>
    </Card> : <>
      {mode === 'serial' && <Card className="mb-4 p-5">
        <label htmlFor="removal-scanner" className="eyebrow mb-1 block">{t('stock.scanOrTypeDevice')}</label>
        <p className="mb-3 text-[12px] text-graphite">{t('stock.scannerHelp')}</p>
        <form ref={scannerFormRef} onSubmit={findDevice} className="flex gap-2" noValidate>
          <ScannerInput ref={scannerRef} id="removal-scanner" name="serialNo" value={serial} autoFocus disabled={pending || Boolean(review)} className="max-w-xs" placeholder="352099001761482"
            aria-invalid={Boolean(errors.serialNo)} aria-describedby={errors.serialNo ? 'removal-serialNo-error' : undefined}
            onValueChange={value => { lookupSequence.current++; setLooking(false); setSerial(value); setFound(undefined); setFields(emptyFields()); setErrors({}); setResult({}); }}
            onScan={() => scannerFormRef.current?.requestSubmit()} />
          <Button type="submit" variant="ghost" disabled={frozen}>{t(looking ? 'stock.finding' : 'stock.find')}</Button>
        </form>
        {errors.serialNo && <p id="removal-serialNo-error" role="alert" className="mt-2 text-[12px] text-out">{error('serialNo')}</p>}
      </Card>}
      {(mode === 'bulk' || found) && <form onSubmit={requestReview} noValidate>
        <Card className="mb-4 p-5">
          {found && <div className="mb-4 flex flex-wrap items-center gap-2"><strong className="text-[13px]">{found.productName}</strong><span className="tnum break-all text-[12px] text-ink">{found.sku} · {found.unit.serialNo}</span><Badge tone="ok">{t('removal.inStock')}</Badge>{!found.isActive && <Badge>{t('removal.archived')}</Badge>}</div>}
          {Object.keys(errors).length > 0 && <div role="alert" className="mb-4 text-[13px] text-out">{t('removal.checkFields')}{Object.entries(errors).filter(([name]) => !['productId','quantity','serialNo','reason','supplierId','returnReason','reference','note'].includes(name)).map(([name, value]) => <p key={name}>{text(value)}</p>)}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'bulk' && <>
              <div><StockProductCombobox products={bulkProducts} value={fields.productId} disabled={frozen} error={error('productId')} onChange={chooseProduct} includeArchived emptyMessage={t('stock.noBulk')} />
                {selected && <p className="mt-2 text-[12px] font-medium text-ink">{t('stock.onHandCount', { count: count ?? 0 })}{!selected.isActive && <> · <Badge>{t('removal.archived')}</Badge></>}</p>}</div>
              <Field label={t('removal.quantity')} error={fieldError('quantity')}><MonoInput {...control('quantity')} type="text" inputMode="numeric" placeholder="12" />
                {count === 0 && <p className="mt-1 text-[12px] text-out">{t('removal.noStock')}</p>}</Field>
            </>}
            <Field label={t('removal.reason')} error={fieldError('reason')}><Select {...control('reason')}><option value="">{t('removal.chooseReason')}</option>{Object.entries(REASONS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select></Field>
            {fields.reason === 'RETURN_TO_SUPPLIER' && <>
              <Field label={t('common.supplier')} error={fieldError('supplierId')}><Select {...control('supplierId')}><option value="">{t('supplierReturns.chooseSupplier')}</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select>
                {suppliers.length === 0 && <p className="mt-1 text-[12px] text-out">{t('removal.noSuppliers')}</p>}</Field>
              <Field label={t('supplierReturns.returnReason')} error={fieldError('returnReason')}><Select {...control('returnReason')}><option value="">{t('removal.chooseReturnReason')}</option>{Object.entries(RETURN_REASONS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select></Field>
            </>}
            <Field label={t('removal.reference')} error={fieldError('reference')}><MonoInput {...control('reference')} /></Field>
            <Field label={t('removal.note')} error={fieldError('note')}><Input {...control('note')} /></Field>
          </div>
        </Card>
        <button ref={reviewButtonRef} type="submit" disabled={frozen || !key || (mode === 'bulk' && count === 0)} className="inline-flex h-9 items-center justify-center rounded-[3px] border border-signal bg-signal px-3.5 text-[13px] font-medium text-white hover:bg-signal/90 disabled:opacity-50">{t('removal.review')}</button>
      </form>}
    </>}
    {review && <ReceiptDialog title={t('removal.review')} returnFocus={reviewButtonRef.current} busy={pending || result.outcome === 'unconfirmed'} onClose={() => setReview(undefined)}>
      <div className="p-5">{summary(review.receipt)}{result.error && <p role="alert" className="mt-4 text-[13px] text-out">{text(result.error)}</p>}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule p-4"><Button type="button" autoFocus variant="ghost" disabled={pending || result.outcome === 'unconfirmed'} onClick={() => setReview(undefined)}>{t('removal.back')}</Button>
        <button type="button" disabled={pending} className="inline-flex h-9 items-center justify-center rounded-[3px] border border-out bg-out px-3.5 text-[13px] font-medium text-white hover:bg-out/90 disabled:opacity-50" onClick={confirmRemoval}>{t(pending ? 'stock.recording' : result.outcome === 'unconfirmed' ? 'removal.retry' : 'stock.remove')}</button></div>
    </ReceiptDialog>}
  </div>;
}
