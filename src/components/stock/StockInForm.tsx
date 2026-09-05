'use client';

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, PackagePlus, ScanLine, Trash2 } from 'lucide-react';
import type { Supplier } from '@/domain/types';
import type { ProductDTO } from '@/lib/dto';
import { formatBDT, toTaka } from '@/lib/money';
import { MAX_RECEIPT_SERIALS, parseReceiptCost, receiptFieldsSchema, receiptFieldErrors, receiptFormInput, serialBatchSchema, serialKey, splitReceiptSerials, type StockReceipt } from '@/lib/stock-receipt';
import { preflightStockSerials, receiveStockAction, type StockActionState, type StockSerialConflict } from '@/actions/stock';
import { Button, Card, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { usePageScanner } from '@/components/search/usePageScanner';
import { useI18n } from '@/components/i18n/I18nProvider';
import { StockProductCombobox } from './StockProductCombobox';
import { ReceiptDialog } from './ReceiptDialog';

interface ReceiptDraft {
  productId: string; supplierId: string; unitCost: string; quantity: string;
  serialNumbers: string; reason: 'PURCHASE' | 'INITIAL_STOCK'; reference: string; note: string;
  warrantyDuration: string; warrantyUnit: 'DAYS' | 'MONTHS'; unitCondition: 'NEW' | 'REFURBISHED'; location: string;
}

export function StockInForm({ products, suppliers, initialProductId, initialSupplierId, initialReference, lockInitialReference = false }: {
  products: ProductDTO[]; suppliers: Supplier[]; initialProductId?: string; initialSupplierId?: string;
  initialReference?: string; lockInitialReference?: boolean;
}) {
  const { t, message } = useI18n();
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(receiveStockAction, {});
  const initialProduct = products.find((item) => item.id === initialProductId);
  const defaultCost = (item?: ProductDTO) => item?.defaultCostPrice == null ? '' : String(toTaka(item.defaultCostPrice));
  const [draft, setDraft] = useState<ReceiptDraft>(() => ({
    productId: initialProduct?.id ?? '', supplierId: initialSupplierId ?? '', unitCost: defaultCost(initialProduct),
    quantity: '', serialNumbers: '', reason: 'PURCHASE', reference: initialReference ?? '', note: '',
    warrantyDuration: '12', warrantyUnit: 'MONTHS', unitCondition: 'NEW', location: '',
  }));
  const [key, setKey] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [serialConflicts, setSerialConflicts] = useState<StockSerialConflict[]>([]);
  const [preflightPending, setPreflightPending] = useState(false);
  const [confirmation, setConfirmation] = useState<StockReceipt | null>(null);
  const [switchProduct, setSwitchProduct] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const confirmationDataRef = useRef<FormData | null>(null);
  const modalOpenerRef = useRef<HTMLElement | null>(null);
  const lastReceiptId = useRef<string | null>(null);
  const submissionRef = useRef(false);
  const preflightRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const product = products.find((item) => item.id === draft.productId);
  const isSerial = product?.trackingType === 'SERIAL';
  const serials = useMemo(() => splitReceiptSerials(draft.serialNumbers), [draft.serialNumbers]);
  const uniqueSerialCount = new Set(serials.map(serialKey)).size;
  const hasDuplicates = uniqueSerialCount !== serials.length;
  const count = isSerial ? uniqueSerialCount : Number(draft.quantity || 0);
  const unitCost = parseReceiptCost(draft.unitCost);
  const total = unitCost * count;
  const validTotal = Number.isSafeInteger(total) && total >= 0 && Number.isInteger(count) && count >= 0;
  const locked = pending || preflightPending || Boolean(confirmation) || switchProduct !== null || receiptOpen;

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    submissionRef.current = false;
    if (state.receipt && state.receipt.id !== lastReceiptId.current) {
      lastReceiptId.current = state.receipt.id;
      setKey(crypto.randomUUID());
      setDraft((current) => ({ ...current, serialNumbers: '', quantity: '' }));
      setScanFeedback(null); setErrors({}); setFormError(''); setSerialConflicts([]);
      setConfirmation(null); confirmationDataRef.current = null; setReceiptOpen(true);
    } else if (state.error || state.fieldErrors) {
      setFormError(state.error ?? ''); setErrors(state.fieldErrors ?? {});
      if (state.fieldErrors) { setConfirmation(null); confirmationDataRef.current = null; }
    }
  }, [state]);
  useEffect(() => { if (receiptOpen) successRef.current?.focus(); }, [receiptOpen]);
  useEffect(() => {
    if (!Object.keys(errors).length || confirmation) return;
    const first = Object.keys(errors)[0];
    const target = formRef.current?.querySelector<HTMLElement>(`[data-receipt-field="${first}"]`);
    let ancestor = target?.parentElement;
    while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement; }
    target?.focus();
  }, [errors, confirmation]);

  function update<K extends keyof ReceiptDraft>(field: K, value: ReceiptDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setFormError('');
    if (field === 'serialNumbers') { setSerialConflicts([]); setScanFeedback(null); }
  }
  function changeProduct(id: string) {
    const next = products.find((item) => item.id === id);
    setDraft((current) => ({ ...current, productId: id, unitCost: defaultCost(next), quantity: '', serialNumbers: '',
      warrantyDuration: '12', warrantyUnit: 'MONTHS', unitCondition: 'NEW', location: '' }));
    setSwitchProduct(null); setErrors({}); setFormError(''); setSerialConflicts([]);
    setScanFeedback(next ? { error: false, text: t('stock.productSelected', { product: next.name }) } : null);
  }
  function chooseProduct(id: string) {
    if (locked || id === draftRef.current.productId) return;
    if (draftRef.current.serialNumbers.trim() || draftRef.current.quantity.trim()) {
      modalOpenerRef.current = document.activeElement as HTMLElement | null;
      setSwitchProduct(id);
    }
    else changeProduct(id);
  }
  function appendScannedSerial(value: string) {
    const currentSerials = splitReceiptSerials(draftRef.current.serialNumbers);
    const scanned = value.trim();
    if (currentSerials.some((serial) => serialKey(serial) === serialKey(scanned))) {
      setScanFeedback({ error: true, text: t('stock.serialAlreadyAdded', { serial: scanned }) });
    } else if (!serialBatchSchema.safeParse([...currentSerials, scanned]).success) {
      setScanFeedback({ error: true, text: t('stock.invalidSerials', { max: MAX_RECEIPT_SERIALS }) });
    } else {
      const serialNumbers = [...currentSerials, scanned].join('\n');
      // Scanner bursts can arrive before React commits the preceding scan.
      draftRef.current = { ...draftRef.current, serialNumbers };
      setDraft((current) => ({ ...current, serialNumbers }));
      setErrors((current) => { const next = { ...current }; delete next.serialNumbers; return next; });
      setSerialConflicts([]);
      setScanFeedback({ error: false, text: t('stock.serialAdded', { serial: scanned }) });
    }
  }
  function handleScan(value: string) {
    if (locked || preflightRef.current || submissionRef.current) return;
    const identifier = serialKey(value);
    if (!identifier) return;
    const match = products.find((item) => item.isActive && item.barcode && serialKey(item.barcode) === identifier)
      ?? products.find((item) => item.isActive && serialKey(item.sku) === identifier);
    if (match) {
      chooseProduct(match.id);
      if (match.id === draft.productId) setScanFeedback({ error: false, text: t('stock.productSelected', { product: match.name }) });
    } else if (isSerial) appendScannedSerial(value);
    else { setScanFeedback({ error: true, text: t('stock.scanNeedsProduct') }); }
  }
  usePageScanner({ disabled: locked, onScan: handleScan });

  function errorText(field: string) {
    if (!errors[field]) return undefined;
    const keys = {
      productId: 'stock.chooseProduct', supplierId: 'stock.invalidSupplier', unitCost: 'stock.invalidCost',
      serialNumbers: 'stock.invalidSerials', quantity: 'stock.invalidQuantity', warrantyDuration: 'stock.invalidWarranty',
      warrantyUnit: 'stock.invalidWarranty', unitCondition: 'stock.invalidCondition', reference: 'stock.invalidReference',
      note: 'stock.invalidNote', location: 'stock.invalidLocation', reason: 'stock.invalidReason',
    } as const;
    return field in keys ? t(keys[field as keyof typeof keys], { max: MAX_RECEIPT_SERIALS }) : message(errors[field]!);
  }
  function control(field: keyof ReceiptDraft) {
    return { name: field, id: `receive-${field}`, 'data-receipt-field': field,
      'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `receive-${field}-error` : undefined };
  }
  function field(fieldName: keyof ReceiptDraft, label: string, children: ReactNode, hint?: string) {
    return <div><label htmlFor={`receive-${fieldName}`} className="eyebrow mb-1.5 block">{label}</label>{children}
      {errors[fieldName] ? <p id={`receive-${fieldName}-error`} className="mt-1.5 text-xs text-out">{errorText(fieldName)}</p>
        : hint ? <p className="mt-1.5 text-xs leading-relaxed text-graphite">{hint}</p> : null}</div>;
  }

  async function reviewReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || preflightRef.current || submissionRef.current) return;
    if (!product) { setErrors({ productId: 'Choose a product' }); return; }
    const data = new FormData(event.currentTarget);
    modalOpenerRef.current = document.activeElement as HTMLElement | null;
    const parsed = receiptFieldsSchema.safeParse(receiptFormInput(data, product.trackingType));
    if (!parsed.success) { setErrors(receiptFieldErrors(parsed.error)); return; }
    setErrors({}); setFormError(''); setSerialConflicts([]);
    if (isSerial) {
      preflightRef.current = true; setPreflightPending(true);
      try {
        const result = await preflightStockSerials({ productId: product.id, serialNumbers: parsed.data.serialNumbers! });
        if (result.error) { setFormError(result.error); return; }
        if (result.conflicts?.length) { setSerialConflicts(result.conflicts); return; }
      } catch { setFormError(t('stock.serialCheckFailed')); return; }
      finally { preflightRef.current = false; setPreflightPending(false); }
    }
    const input = parsed.data;
    confirmationDataRef.current = data;
    const receiptCount = input.serialNumbers?.length ?? input.quantity!;
    setConfirmation({ id: '', productId: product.id, productName: product.name, sku: product.sku, trackingType: product.trackingType,
      count: receiptCount, unitCost: input.unitCost, totalCost: input.unitCost * receiptCount,
      supplierId: input.supplierId ?? null, reason: input.reason, reference: input.reference ?? null, note: input.note ?? null,
      location: input.location ?? null, serials: input.serialNumbers ?? [], warrantyMonths: input.warrantyMonths ?? null,
      warrantyDays: input.warrantyDays ?? null, unitCondition: input.unitCondition });
  }
  function confirmReceipt() {
    const data = confirmationDataRef.current;
    if (!data || submissionRef.current) return;
    submissionRef.current = true; setFormError('');
    startTransition(() => formAction(data));
  }
  function closeConfirmation() { if (!pending) { setConfirmation(null); confirmationDataRef.current = null; } }
  function receiptDetails(receipt: StockReceipt) {
    const supplierName = suppliers.find((item) => item.id === receipt.supplierId)?.name;
    return <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
      <div className="sm:col-span-2"><dt className="text-xs text-graphite">{t('common.product')}</dt><dd className="mt-1 text-[15px] font-semibold">{receipt.productName}</dd><dd className="tnum mt-1 text-xs text-graphite">{receipt.sku}</dd></div>
      <div><dt className="text-xs text-graphite">{t('stock.receivedQuantity')}</dt><dd className="tnum mt-1 font-semibold">{receipt.count}</dd></div>
      <div><dt className="text-xs text-graphite">{t('stock.totalReceivedCost')}</dt><dd className="tnum mt-1 font-semibold">{formatBDT(receipt.totalCost)}</dd></div>
      <div><dt className="text-xs text-graphite">{t('stock.costPerUnitSummary')}</dt><dd className="tnum mt-1">{formatBDT(receipt.unitCost)}</dd></div>
      <div><dt className="text-xs text-graphite">{t('common.supplier')}</dt><dd className="mt-1">{supplierName ?? t('common.notRecorded')}</dd></div>
      <div><dt className="text-xs text-graphite">{t('stock.reason')}</dt><dd className="mt-1">{t(receipt.reason === 'PURCHASE' ? 'stock.purchaseSupplier' : receipt.reason === 'INITIAL_STOCK' ? 'stock.openingBalance' : 'stock.customerReturn')}</dd></div>
      {receipt.trackingType === 'SERIAL' && <><div><dt className="text-xs text-graphite">{t('stock.unitCondition')}</dt><dd className="mt-1">{t(receipt.unitCondition === 'NEW' ? 'used.newStock' : 'used.refurbished')}</dd></div>
        <div><dt className="text-xs text-graphite">{t('stock.warrantyDuration')}</dt><dd className="mt-1">{receipt.warrantyDays != null ? `${receipt.warrantyDays} ${t('used.warrantyDays')}` : receipt.warrantyMonths != null ? `${receipt.warrantyMonths} ${t('used.warrantyMonths')}` : t('common.notRecorded')}</dd></div></>}
      {(['reference', 'location', 'note'] as const).map((name) => receipt[name] ? <div key={name}><dt className="text-xs text-graphite">{t(name === 'reference' ? 'common.reference' : name === 'location' ? 'stock.location' : 'stock.receiptNote')}</dt><dd className="mt-1 break-words">{receipt[name]}</dd></div> : null)}
      {receipt.serials.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-graphite">{t('stock.deviceNumbers')}</dt><dd className="tnum mt-2 max-h-32 overflow-y-auto rounded-[3px] bg-plate/60 p-3 text-xs">{receipt.serials.map((serial) => <div key={serial}>{serial}</div>)}</dd></div>}
    </dl>;
  }

  const receiptLabelHref = state.labelReceiptId ? `/stock/labels?receipt=${encodeURIComponent(state.labelReceiptId)}` : `/stock/labels?product=${encodeURIComponent(draft.productId)}`;
  if (receiptOpen && state.receipt) return <Card className="mx-auto max-w-2xl p-5">
    <CheckCircle2 className="mb-4 size-8 text-ok" aria-hidden="true" />
    <h2 ref={successRef} tabIndex={-1} className="text-xl font-semibold outline-none">{t('stock.receiptTitle')}</h2>
    <p className="mt-2 text-[13px] text-graphite" role="status">{t('stock.receiptHelp')}</p>
    <div className="my-6 border-y border-rule py-4">{receiptDetails(state.receipt)}</div>
    <div className="flex flex-wrap gap-3"><Link href={receiptLabelHref} className="inline-flex h-9 items-center justify-center rounded-[3px] bg-signal px-3.5 text-[13px] font-medium text-white">{t('stock.printLabels')}</Link>
      <Button type="button" variant="ghost" className="h-9 rounded-[3px]" onClick={() => setReceiptOpen(false)}>{t('stock.receiveAnother')}</Button></div>
  </Card>;

  return <form ref={formRef} onSubmit={reviewReceipt} noValidate aria-busy={pending || preflightPending} className="stock-receive">
    <input type="hidden" name="idempotencyKey" value={key} />
    {(formError || Object.keys(errors).length > 0) && <div role="alert" className="mb-4 rounded-[3px] border border-out/20 bg-out-wash p-4 text-[13px] text-out">
      {formError ? message(formError) : t('stock.reviewErrors')}
      {Object.keys(errors).length > 0 && <ul className="mt-2 list-inside list-disc">{Object.keys(errors).map((name) => <li key={name}>{errorText(name)}</li>)}</ul>}
    </div>}
    <fieldset disabled={locked} className="min-w-0">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><PackagePlus className="size-4 text-signal" aria-hidden="true" />{t('stock.whatArrived')}</h2>
            <StockProductCombobox products={products} value={draft.productId} disabled={locked} error={errorText('productId')} onChange={chooseProduct} />
            <div role="status" aria-live="polite" aria-atomic="true" className={`mt-2 text-xs ${scanFeedback?.error ? 'text-out' : 'text-ok'}`}>{scanFeedback?.text}</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field('supplierId', t('common.supplier'), <Select {...control('supplierId')} value={draft.supplierId} onChange={(event) => update('supplierId', event.target.value)} className="h-9 rounded-[3px]"><option value="">{t('common.notRecorded')}</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>)}
              {field('unitCost', t('stock.costPerUnit'), <MonoInput {...control('unitCost')} value={draft.unitCost} onChange={(event) => update('unitCost', event.target.value)} inputMode="decimal" placeholder="0.00" className="h-9 rounded-[3px]" />, t('stock.costHelp'))}
            </div>
          </Card>

          {product && <Card className="p-4">
            {isSerial ? <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">{t('stock.deviceNumbers')}</h2><span className="tnum rounded-full bg-plate px-3 py-1 text-xs">{t('stock.uniqueUnits', { count: uniqueSerialCount, kind: t(uniqueSerialCount === 1 ? 'stock.unit' : 'stock.units') })}</span></div>
              <p className="mb-4 text-xs leading-relaxed text-graphite">{t('stock.imeiHint')}</p>
              <input type="hidden" name="serialNumbers" value={draft.serialNumbers} />
              {serials.length > 0 ? <ul className="max-h-64 divide-y divide-rule overflow-y-auto rounded-[3px] border border-rule">{serials.map((serial, index) => <li key={`${serial}-${index}`} className="flex items-center gap-3 px-3 py-1"><span className="tnum text-xs text-graphite">{index + 1}</span><span className="tnum min-w-0 flex-1 break-all text-[13px]">{serial}</span><button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-[3px] text-graphite hover:bg-out-wash hover:text-out" aria-label={t('stock.removeSerial', { serial })} onClick={() => update('serialNumbers', serials.filter((_, row) => row !== index).join('\n'))}><Trash2 className="size-4" aria-hidden="true" /></button></li>)}</ul>
                : <div className="rounded-[3px] border border-dashed border-rule bg-plate/30 px-3 py-4 text-center text-[13px] text-graphite"><ScanLine className="mx-auto mb-2 size-6" aria-hidden="true" />{t('stock.startScanning')}</div>}
              {hasDuplicates && <p role="alert" className="mt-2 text-xs text-out">{t('stock.duplicateSerials')}</p>}
              <details className="mt-4"><summary className="min-h-8 cursor-pointer text-[13px] font-medium text-signal">{t('stock.pasteSerials')}</summary>
                {field('serialNumbers', t('stock.deviceNumbers'), <Textarea id="receive-serialNumbers" data-receipt-field="serialNumbers" aria-invalid={Boolean(errors.serialNumbers)} aria-describedby={errors.serialNumbers ? 'receive-serialNumbers-error' : undefined} value={draft.serialNumbers} onChange={(event) => update('serialNumbers', event.target.value)} rows={5} className="tnum rounded-[3px] text-[13px]" placeholder={'352099001761481\n352099001761482'} />, t('stock.deviceListHelp'))}
              </details>
              {serialConflicts.length > 0 && <div role="alert" className="mt-4 rounded-[3px] border border-out/20 bg-out-wash p-4 text-[13px] text-out"><p className="font-medium">{t('stock.serialConflictsTitle', { count: serialConflicts.length })}</p><p className="mt-1 text-xs">{t('stock.serialConflictsHelp')}</p><ul className="tnum mt-3 space-y-2">{serialConflicts.map((conflict) => <li key={conflict.serialNo} className="flex flex-wrap justify-between gap-2"><span>{conflict.serialNo}</span><span>{t(({ IN_STOCK: 'stock.unitStatusInStock', RESERVED: 'stock.unitStatusReserved', SOLD: 'stock.unitStatusSold', RETURNED: 'stock.unitStatusReturned', DAMAGED: 'stock.unitStatusDamaged', LOST: 'stock.unitStatusLost', VOID: 'stock.unitStatusVoid' } as const)[conflict.status])}</span></li>)}</ul></div>}
              <details open className="mt-4 border-t border-rule pt-3"><summary className="min-h-8 cursor-pointer text-[13px] font-medium">{t('stock.deviceDetails')}</summary><div className="grid gap-4 sm:grid-cols-2">
                {field('unitCondition', t('stock.unitCondition'), <Select {...control('unitCondition')} value={draft.unitCondition} onChange={(event) => update('unitCondition', event.target.value as ReceiptDraft['unitCondition'])} className="h-9 rounded-[3px]"><option value="NEW">{t('used.newStock')}</option><option value="REFURBISHED">{t('used.refurbished')}</option></Select>)}
                {field('warrantyDuration', t('stock.warrantyDuration'), <div className="flex gap-2"><MonoInput {...control('warrantyDuration')} type="number" min={0} max={draft.warrantyUnit === 'DAYS' ? 3650 : 120} value={draft.warrantyDuration} onChange={(event) => update('warrantyDuration', event.target.value)} className="h-9 min-w-0 rounded-[3px]" /><Select {...control('warrantyUnit')} aria-label={t('stock.warrantyUnitLabel')} value={draft.warrantyUnit} onChange={(event) => update('warrantyUnit', event.target.value as ReceiptDraft['warrantyUnit'])} className="h-9 max-w-28 rounded-[3px]"><option value="DAYS">{t('used.warrantyDays')}</option><option value="MONTHS">{t('used.warrantyMonths')}</option></Select></div>, t('stock.warrantyHint'))}
                {field('location', t('stock.location'), <Input {...control('location')} value={draft.location} onChange={(event) => update('location', event.target.value)} maxLength={100} className="h-9 rounded-[3px]" />)}
              </div></details>
            </> : <><h2 className="mb-2 text-[15px] font-semibold">{t('common.quantity')}</h2><p className="mb-4 text-xs text-graphite">{t('stock.bulkHelp', { product: product.name })}</p><div className="max-w-56">{field('quantity', t('stock.unitsReceived'), <MonoInput {...control('quantity')} type="number" min={1} step={1} inputMode="numeric" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} placeholder="0" className="h-9 rounded-[3px] text-[13px]" />)}</div></>}
          </Card>}
          <Card className="px-4 py-3"><details open={Boolean(initialReference)}><summary className="min-h-8 cursor-pointer text-[13px] font-medium">{t('stock.deliveryDetails')}</summary><div className="grid gap-4 pt-2 sm:grid-cols-2">
            {field('reason', t('stock.reason'), <Select {...control('reason')} value={draft.reason} onChange={(event) => update('reason', event.target.value as ReceiptDraft['reason'])} className="h-9 rounded-[3px]"><option value="PURCHASE">{t('stock.purchaseSupplier')}</option><option value="INITIAL_STOCK">{t('stock.openingBalance')}</option></Select>)}
            {field('reference', t('common.reference'), <MonoInput {...control('reference')} value={draft.reference} onChange={(event) => update('reference', event.target.value)} readOnly={lockInitialReference} maxLength={100} className="h-9 rounded-[3px]" />, t('stock.referenceHint'))}
            <div className="sm:col-span-2">{field('note', t('stock.receiptNote'), <Textarea {...control('note')} value={draft.note} onChange={(event) => update('note', event.target.value)} maxLength={1000} rows={2} className="rounded-[3px]" />, t('stock.receiptNoteHint'))}</div>
          </div></details></Card>
        </div>
        <Card className="p-4 lg:sticky lg:top-6">
          <h2 className="text-[15px] font-semibold">{t('stock.receiptSummary')}</h2>
          <p className="mt-2 break-words text-[13px] text-graphite">{product?.name ?? t('stock.chooseProduct')}</p>
          <dl className="my-4 space-y-3 border-y border-rule py-4 text-[13px]"><div className="flex justify-between gap-4"><dt className="text-graphite">{t('common.quantity')}</dt><dd className="tnum font-medium">{Number.isInteger(count) && count >= 0 ? count : '—'}</dd></div><div className="flex justify-between gap-4"><dt className="text-graphite">{t('stock.costPerUnitSummary')}</dt><dd className="tnum">{Number.isSafeInteger(unitCost) ? formatBDT(unitCost) : '—'}</dd></div></dl>
          <div className="mb-4"><p className="text-xs text-graphite">{t('stock.totalReceivedCost')}</p><p className="tnum mt-2 break-words text-xl font-semibold" aria-live="polite">{validTotal ? formatBDT(total) : '—'}</p></div>
          <Button type="submit" disabled={!key || !product || locked} className="h-9 w-full gap-2 rounded-[3px]">{preflightPending ? t('stock.checkingDeviceNumbers') : t('stock.reviewReceipt')}<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Button>
          <p className="mt-3 text-xs leading-relaxed text-graphite">{t('stock.reviewHint')}</p>
        </Card>
      </div>
    </fieldset>
    {switchProduct !== null && <ReceiptDialog title={t('stock.changeProductTitle')} description={t('stock.changeProductHelp')} returnFocus={modalOpenerRef.current} onClose={() => setSwitchProduct(null)}>
      <div className="flex flex-wrap justify-end gap-3 p-5"><Button type="button" variant="ghost" className="h-9 rounded-[3px]" onClick={() => setSwitchProduct(null)} autoFocus>{t('common.cancel')}</Button><Button type="button" className="h-9 rounded-[3px]" onClick={() => changeProduct(switchProduct)}>{t('stock.changeProductConfirm')}</Button></div>
    </ReceiptDialog>}
    {confirmation && <ReceiptDialog title={t('stock.confirmReceiveTitle')} description={t('stock.confirmReceiveHelp')} busy={pending} returnFocus={modalOpenerRef.current} onClose={closeConfirmation}>
      {pending && <div role="status" aria-live="polite" className="mx-4 mt-4 flex items-center gap-3 rounded-[3px] bg-signal/5 p-3 text-[13px]"><span className="size-5 shrink-0 animate-spin rounded-full border-2 border-rule border-t-signal" aria-hidden="true" /><span>{t('stock.receiving')}<span className="mt-1 block text-xs text-graphite">{t('stock.receivingHelp')}</span></span></div>}
      {formError && <div role="alert" className="mx-4 mt-4 rounded-[3px] bg-out-wash p-3 text-[13px] text-out">{message(formError)}</div>}
      <div className="p-4">{receiptDetails(confirmation)}</div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-rule p-5"><Button type="button" variant="ghost" onClick={closeConfirmation} disabled={pending} className="h-9 rounded-[3px]" autoFocus>{t('stock.backToReceipt')}</Button><Button type="button" onClick={confirmReceipt} disabled={pending} className="h-9 rounded-[3px]">{pending ? t('stock.receiving') : t('stock.yesReceive')}</Button></div>
    </ReceiptDialog>}
  </form>;
}
