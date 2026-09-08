'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { recordLabelPrintAction, resolveLabelIdentifierAction } from '@/actions/labels';
import { LabelProductCombobox } from '@/components/labels/LabelProductCombobox';
import { ProductLabel, LabelPrintOutput } from '@/components/labels/ProductLabel';
import { ScannerInput } from '@/components/search/ScannerInput';
import { LoadingScreen } from '@/components/shell/LoadingScreen';
import { Button, Card, EmptyState, Field, Input, Select, TableViewport } from '@/components/ui';
import type { Role, UnitStatus } from '@/domain/types';
import { hasPermission } from '@/lib/permissions';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';
import type { MessageKey } from '@/lib/i18n/messages';
import { labelBarcodeFit, labelCopiesSchema, labelFieldErrors, labelPrintSchema, type LabelFieldErrors, type LabelPrintState, type LabelProductOption, type LabelUnitOption } from '@/lib/label-print';
export type { LabelProductOption, LabelUnitOption } from '@/lib/label-print';

type Props = {
  products: LabelProductOption[]; product: LabelProductOption | null; units: LabelUnitOption[];
  initialUnitIds: string[]; initialCopies: number; role: Role; resultVersion: string;
  selectionContext: string; selectionError?: string; receiptCount?: number; receiptId?: string;
};

export function StockLabelStudio({ products, product, units, initialUnitIds, initialCopies, role, resultVersion, selectionContext, selectionError, receiptCount, receiptId }: Props) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const text = (key: string) => t(key as MessageKey);
  const id = useId();
  const canReprint = hasPermission(role, 'REPRINT_NON_STOCK_LABELS');
  const [selectedProductId, setSelectedProductId] = useState(product?.id ?? '');
  const [selected, setSelected] = useState(() => new Set(initialUnitIds));
  const [scannedUnits, setScannedUnits] = useState<LabelUnitOption[]>([]);
  const [copies, setCopies] = useState(String(initialCopies));
  const [layout, setLayout] = useState<'thermal' | 'a4'>('thermal');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'ALL'>(canReprint && initialUnitIds.length ? 'ALL' : 'IN_STOCK');
  const [unitQuery, setUnitQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [searching, setSearching] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [locked, setLocked] = useState(false);
  const [errors, setErrors] = useState<LabelFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [accepted, setAccepted] = useState<LabelPrintState | null>(null);
  const [state, formAction, pending] = useActionState<LabelPrintState, FormData>(async (previous, data) => {
    try { return await recordLabelPrintAction(previous, data); }
    catch { return { error: 'labels.prepareFailed' }; }
  }, {});
  const [, startPrint] = useTransition();
  const inFlight = useRef(false);
  const scanFlight = useRef(false);
  const handledState = useRef(state);
  const printed = useRef(new Set<string>());
  const contextRef = useRef(selectionContext);
  const resultRef = useRef(resultVersion);
  const scannerRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const focusError = useRef(false);
  const busy = locked || pending || Boolean(accepted?.job);

  useEffect(() => {
    scannerRef.current?.focus();
  }, []);

  useEffect(() => {
    // A refresh updates availability, not the operator's selection or print settings.
    const routeUpdated = resultRef.current !== resultVersion || contextRef.current !== selectionContext;
    if (resultRef.current !== resultVersion) { resultRef.current = resultVersion; setScannedUnits([]); }
    if (contextRef.current !== selectionContext) {
      contextRef.current = selectionContext;
      setSelected(new Set(initialUnitIds)); setScannedUnits([]); setUnitQuery(''); setOnlySelected(false); setShowMore(false);
      setStatusFilter(canReprint && initialUnitIds.length ? 'ALL' : 'IN_STOCK');
      setCopies(receiptId ? String(initialCopies) : '1');
      setErrors({}); setFormError(''); setScanError('');
    }
    if (routeUpdated) { setSelectedProductId(product?.id ?? ''); setNavigating(false); }
  }, [product?.id, selectionContext, resultVersion, initialUnitIds, initialCopies, receiptId, canReprint]);

  useEffect(() => {
    if (state === handledState.current) return;
    handledState.current = state;
    if (state.job && state.printNonce) setAccepted(state);
    else {
      inFlight.current = false; setLocked(false);
      focusError.current = true; setErrors(state.fieldErrors ?? {}); setFormError(state.error ?? 'labels.prepareFailed');
    }
  }, [state]);

  useEffect(() => {
    if (!accepted?.job || !accepted.printNonce) return;
    const nonce = accepted.printNonce;
    const finish = () => {
      setAccepted(null); setLocked(false); inFlight.current = false;
      setTimeout(() => formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus(), 0);
    };
    const fail = () => { setFormError('labels.prepareFailed'); finish(); };
    window.addEventListener('afterprint', finish);
    const frame = requestAnimationFrame(() => {
      if (printed.current.has(nonce)) return;
      printed.current.add(nonce);
      try { window.print(); } catch { fail(); }
    });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', finish); };
  }, [accepted]);

  useEffect(() => {
    if (!focusError.current) return;
    focusError.current = false;
    const first = Object.keys(errors)[0];
    const control = first === 'productId' ? scannerRef.current : first === 'unitIds'
      ? formRef.current?.querySelector<HTMLElement>('[data-unit-selection]')
      : formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
    (control ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
  }, [errors]);

  const allUnits = useMemo(() => {
    const merged = new Map(scannedUnits.map(unit => [unit.id, unit]));
    // Current server data takes precedence over a scan captured earlier.
    units.forEach(unit => merged.set(unit.id, unit));
    return [...merged.values()].filter(unit => canReprint || unit.status === 'IN_STOCK');
  }, [units, scannedUnits, canReprint]);
  const selectedUnits = allUnits.filter(unit => selected.has(unit.id));
  const visibleUnits = allUnits.filter(unit => (statusFilter === 'ALL' || unit.status === statusFilter)
    && unit.serialNo.toLowerCase().includes(unitQuery.trim().toLowerCase()) && (!onlySelected || selected.has(unit.id)));
  const hiddenCount = selected.size - visibleUnits.filter(unit => selected.has(unit.id)).length;
  const nonStockCount = selectedUnits.filter(unit => unit.status !== 'IN_STOCK').length;
  const parsedCopies = labelCopiesSchema.safeParse(copies);
  const maximumCopies = product?.trackingType === 'SERIAL' && selected.size ? Math.floor(500 / selected.size) : 500;
  function stepCopies(change: -1 | 1) {
    if (!parsedCopies.success) return;
    const next = parsedCopies.data + change;
    if (next < 1 || (change > 0 && next > maximumCopies)) return;
    setCopies(String(next)); edited();
  }
  const count = parsedCopies.success ? parsedCopies.data * (product?.trackingType === 'SERIAL' ? selected.size : 1) : 0;
  const copiesError = !parsedCopies.success ? 'labels.invalidCopies' : count > 500 ? 'labels.maxError' : errors.copies;
  const missingBarcode = product?.trackingType === 'QUANTITY' && !product.barcode;
  const fits = product?.trackingType === 'SERIAL' ? selectedUnits.map(unit => labelBarcodeFit(unit.serialNo)) : product?.barcode ? [labelBarcodeFit(product.barcode)] : [];
  const barcodeError = fits.find(fit => fit.error)?.error;
  const narrowBarcode = fits.some(fit => fit.warning);
  const stockError = product?.trackingType === 'QUANTITY' && !canReprint && product.quantityOnHand <= 0 ? 'labels.stockRequired' : undefined;
  const productError = errors.productId ?? (missingBarcode ? 'labels.productBarcodeRequired' : stockError) ?? (product?.trackingType === 'QUANTITY' ? barcodeError : undefined);
  const unitsError = errors.unitIds ?? (selected.size !== selectedUnits.length ? 'labels.invalidUnits' : product?.trackingType === 'SERIAL' ? barcodeError : undefined);
  const previews = product?.trackingType === 'SERIAL' ? selectedUnits.slice(0, showMore ? 12 : 3) : [];

  function edited() { setErrors({}); setFormError(''); }
  function navigate(productId: string, unitId?: string) {
    setSelectedProductId(productId); setNavigating(true); setScanError(''); setScanNotice('');
    if (productId !== product?.id) setCopies('1');
    const params = new URLSearchParams({ product: productId });
    if (unitId) params.set('unit', unitId);
    router.push(`/stock/labels?${params.toString()}`);
  }
  function chooseProduct(productId: string, unitId?: string) {
    if (inFlight.current) return;
    if (productId === product?.id) return;
    navigate(productId, unitId);
  }
  async function scan(value: string) {
    if (inFlight.current || scanFlight.current || navigating) return;
    scanFlight.current = true; setSearching(true); setScanError(''); setScanNotice('');
    try {
      const result = await resolveLabelIdentifierAction(value);
      if (result.error) { setScanError(result.error); return; }
      if (!result.productId) { setScanError('labels.scanNotFound'); return; }
      if (result.productId === product?.id) {
        if (result.unit) {
          const unit = result.unit;
          setScannedUnits(current => [...current.filter(item => item.id !== unit.id), unit]);
          setSelected(current => new Set(current).add(unit.id)); edited();
          setScanNotice(selected.has(unit.id) ? 'labels.scanAlreadySelected' : 'labels.scanAdded');
        } else setScanNotice('labels.productReady');
      } else chooseProduct(result.productId, result.unit?.id);
    } catch { setScanError('labels.scanFailed'); }
    finally {
      scanFlight.current = false; setSearching(false); setScanValue('');
    }
  }
  function submitPrint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || searching || navigating || selectionError || !product) return;
    const data = new FormData(event.currentTarget);
    const parsed = labelPrintSchema.safeParse({ productId: product.id, unitIds: [...selected], copies, layout });
    const next: LabelFieldErrors = parsed.success ? {} : labelFieldErrors(parsed.error);
    if (copiesError) next.copies = copiesError;
    if (productError) next.productId = productError;
    if (unitsError) next.unitIds = unitsError;
    if (product.trackingType === 'SERIAL' && !selected.size) next.unitIds = 'labels.selectRequired';
    if (Object.keys(next).length) { focusError.current = true; setErrors(next); setFormError('labels.fixErrors'); return; }
    setErrors({}); setFormError(''); inFlight.current = true; setLocked(true);
    startPrint(() => formAction(data));
  }
  const inlineError = (field: string, error?: string) => error ? <p id={`${id}-${field}-error`} className="mt-1 text-[12px] text-out">{text(error)}</p> : null;

  return <div className="stock-label-print-root" data-layout={accepted?.job?.layout} data-print-ready={Boolean(accepted?.job)} aria-busy={busy || navigating || searching}>
    <div className="label-screen-only">
      <Card className="mb-4 p-5">
        <fieldset disabled={busy || navigating || searching} className="grid min-w-0 gap-4 md:grid-cols-2">
          <Field label={t('labels.scan')} hint={t('labels.scanHint')}>
            <ScannerInput ref={scannerRef} value={scanValue} maxLength={120} placeholder={t('stock.scanEnter')} onScan={scan} onValueChange={value => { setScanValue(value); setScanError(''); }} aria-invalid={Boolean(scanError || productError)} aria-describedby={scanError ? `${id}-scan-error` : productError ? `${id}-productId-error` : undefined} />
          </Field>
          <Field label={t('common.product')}><LabelProductCombobox products={products} value={selectedProductId} onChange={chooseProduct} disabled={busy || navigating || searching} placeholder={t('labels.productSearchPlaceholder')} emptyMessage={t('labels.noProductMatch')} /></Field>
        </fieldset>
        {inlineError('scan', scanError)}
        <p role="status" className={`mt-2 text-[12px] ${scanNotice && !searching ? 'text-ok' : 'text-graphite'}`}>{searching ? t('search.searching') : scanNotice ? text(scanNotice) : ''}</p>
      </Card>
      {navigating ? <Card><LoadingScreen compact label={t('loading.productLabels')} /></Card> : selectionError ? <Card className="p-5"><p role="alert" className="text-out">{text(selectionError)}</p><Button className="mt-3" type="button" variant="ghost" onClick={() => product ? navigate(product.id) : router.push('/stock/labels')}>{t('labels.returnProduct')}</Button></Card> : !product ? <Card><EmptyState title={t('labels.chooseHelp')} /></Card> : <form ref={formRef} onSubmit={submitPrint} noValidate>
        <input type="hidden" name="productId" value={product.id} /><input type="hidden" name="unitIds" value={JSON.stringify([...selected])} />
        <fieldset disabled={busy || searching} className="min-w-0">
          <Card className="mb-4 p-5">
            <p className="text-[16px] font-semibold">{product.name}</p>
            <p className="tnum mt-1 text-[12px] font-medium text-ink">{product.sku} · {product.trackingType === 'SERIAL' ? t('products.serialTracking') : t('products.bulkTracking')} · {t('labels.available', { count: product.trackingType === 'SERIAL' ? allUnits.filter(unit => unit.status === 'IN_STOCK').length : product.quantityOnHand })}{!product.isActive ? ` · ${t('labels.inactive')}` : ''}</p>
            {receiptCount !== undefined && <p className={`mt-2 text-[12px] ${receiptCount > 500 ? 'text-out' : 'text-graphite'}`}>{t('labels.receiptCount', { count: receiptCount })}{receiptCount > 500 ? ` ${t('labels.receiptLimit')}` : ''}</p>}
            {inlineError('productId', productError)}
            {missingBarcode && hasPermission(role, 'MANAGE_CATALOG') && <Link href={`/products/${product.id}/edit`} className="mt-2 inline-block text-[13px] text-signal underline">{t('labels.editProduct')}</Link>}
            {product.trackingType === 'SERIAL' ? <div data-unit-selection tabIndex={-1} aria-invalid={Boolean(unitsError)} aria-describedby={unitsError ? `${id}-unitIds-error` : undefined} className="mt-4">
              <div className="grid items-start gap-4 lg:grid-cols-3">
                <Field label={t('labels.searchDevices')}><Input placeholder={t('labels.searchDevicesPlaceholder')} value={unitQuery} onChange={event => setUnitQuery(event.target.value)} /></Field>
                <Field label={t('labels.unitStatus')}><Select value={statusFilter} onChange={event => setStatusFilter(event.target.value as UnitStatus | 'ALL')}><option value="IN_STOCK">{t('common.inStock')}</option>{canReprint && <option value="ALL">{t('labels.allStatuses')}</option>}{canReprint && [...new Set(allUnits.map(unit => unit.status))].filter(status => status !== 'IN_STOCK').map(status => <option key={status} value={status}>{domainLabel(t, status)}</option>)}</Select></Field>
                <div className="text-[12px]"><p role="status">{t('labels.selectionCount', { count: selected.size, hidden: hiddenCount })}</p>{nonStockCount > 0 && <p className="mt-1 text-out">{t('labels.nonStockCount', { count: nonStockCount })}</p>}<label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={onlySelected} onChange={event => { setOnlySelected(event.target.checked); if (event.target.checked) { setUnitQuery(''); setStatusFilter(canReprint ? 'ALL' : 'IN_STOCK'); } }} />{t('labels.showSelected')}</label></div>
              </div>
              <div className="my-3 flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={() => { setSelected(current => new Set([...current, ...visibleUnits.map(unit => unit.id)])); edited(); }}>{t('labels.selectVisible')}</Button><Button type="button" variant="ghost" onClick={() => { setSelected(new Set()); edited(); }}>{t('labels.clearSelection')}</Button></div>
              <TableViewport className="max-h-64 border border-rule"><table className="w-full border-collapse text-[12px]"><thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left"><th className="w-10 px-3 py-2"><span className="sr-only">{t('labels.select')}</span></th><th className="eyebrow px-3 py-2">{t('term.deviceNumber')}</th><th className="eyebrow px-3 py-2">{t('common.status')}</th><th className="eyebrow px-3 py-2">{t('labels.received')}</th></tr></thead><tbody>{visibleUnits.map(unit => <tr key={unit.id} className={`border-b border-rule-soft last:border-0 ${selected.has(unit.id) ? 'bg-signal-wash' : ''}`}><td className="px-3 py-2"><input type="checkbox" aria-label={t('labels.selectDevice', { value: unit.serialNo })} checked={selected.has(unit.id)} onChange={() => { setSelected(current => { const next = new Set(current); if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id); return next; }); edited(); }} /></td><td className="tnum break-all px-3 py-2">{unit.serialNo}</td><td className="px-3 py-2">{domainLabel(t, unit.status)}</td><td className="tnum whitespace-nowrap px-3 py-2">{new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium' }).format(new Date(unit.receivedAt))}</td></tr>)}</tbody></table>{!visibleUnits.length && <p className="p-5 text-center text-[12px] text-graphite">{t(!allUnits.length ? 'labels.noEligibleUnits' : 'labels.noUnits')}</p>}</TableViewport>
              {inlineError('unitIds', unitsError)}
            </div> : !missingBarcode && <p className="mt-3 text-[12px] text-graphite">{t('labels.bulkHelp', { identifier: t('labels.productBarcode') })}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div><Field label={product.trackingType === 'SERIAL' ? t('labels.copies') : t('labels.number')}><div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem]">
                <button type="button" aria-label={t('labels.decreaseCount')} onClick={() => stepCopies(-1)} disabled={!parsedCopies.success || parsedCopies.data <= 1}
                  className="inline-flex h-9 items-center justify-center rounded-l-[3px] border border-r-0 border-rule bg-plate/50 text-[18px] leading-none text-ink transition-colors hover:bg-signal-wash hover:text-signal focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-40">−</button>
                <Input name="copies" inputMode="numeric" className="relative rounded-none px-1 text-center focus:z-10" value={copies} onChange={event => { setCopies(event.target.value); edited(); }} aria-invalid={Boolean(copiesError)} aria-describedby={copiesError ? `${id}-copies-error ${id}-copies-help` : `${id}-copies-help`} />
                <button type="button" aria-label={t('labels.increaseCount')} onClick={() => stepCopies(1)} disabled={!parsedCopies.success || parsedCopies.data >= maximumCopies}
                  className="inline-flex h-9 items-center justify-center rounded-r-[3px] border border-l-0 border-rule bg-plate/50 text-[18px] leading-none text-signal transition-colors hover:bg-signal-wash focus-visible:z-10 disabled:cursor-not-allowed disabled:opacity-40">+</button>
              </div></Field>{inlineError('copies', copiesError)}<p id={`${id}-copies-help`} className="mt-1 text-[11px] text-graphite">{product.trackingType === 'SERIAL' && selected.size ? t('labels.maxCopies', { count: Math.floor(500 / selected.size) }) : t('labels.rangeHelp')}</p></div>
              <div><Field label={t('labels.layout')}><Select name="layout" value={layout} onChange={event => { setLayout(event.target.value as 'thermal' | 'a4'); edited(); }} aria-invalid={Boolean(errors.layout)} aria-describedby={errors.layout ? `${id}-layout-error` : undefined}><option value="thermal">{t('labels.thermal')}</option><option value="a4">{t('labels.a4')}</option></Select></Field>{inlineError('layout', errors.layout)}</div>
              <div><div className="grid w-max"><p className="eyebrow mb-1.5">{t('labels.total')}</p><p role="status" className="border border-rule bg-card px-2.5 py-1 text-center text-[16px] font-semibold">{t('labels.count', { count, kind: t(count === 1 ? 'labels.label' : 'labels.labels') })}</p></div>{product.trackingType === 'SERIAL' && parsedCopies.success && <p className="mt-1 text-[12px] text-graphite">{t('labels.calculation', { devices: selected.size, copies: parsedCopies.data, count })}</p>}</div>
            </div>
            {layout === 'a4' && <p className="mt-3 text-[12px] text-graphite">{t('labels.a4Help')}</p>}
          </Card>
          <Card className="mb-4 p-5"><p className="eyebrow mb-3">{t('labels.preview')}</p>
            <div className="label-preview-grid">{product.trackingType === 'SERIAL' ? previews.map(unit => <ProductLabel key={unit.id} product={product} serialNo={unit.serialNo} />) : !missingBarcode && <ProductLabel product={product} />}</div>
            {product.trackingType === 'SERIAL' && !previews.length && <p className="text-[12px] text-graphite">{t('labels.selectRequired')}</p>}
            {product.trackingType === 'SERIAL' && selectedUnits.length > 3 && <div className="mt-3"><p className="mb-2 text-[12px] text-graphite">{t('labels.distinctPreview', { shown: previews.length, count: selectedUnits.length })}</p><Button type="button" variant="ghost" onClick={() => setShowMore(current => !current)}>{t(showMore ? 'labels.showLess' : 'labels.showMore')}</Button></div>}
            {narrowBarcode && <p className="mt-3 text-[12px] text-low">{t('labels.narrowBarcode')}</p>}
            {formError && <p role="alert" tabIndex={-1} className="mt-3 text-[13px] text-out">{text(formError)}</p>}
            <div className="mt-4"><Button type="submit" disabled={busy || searching}>{busy ? t('labels.preparing') : t('labels.printCount', { count, kind: t(count === 1 ? 'labels.label' : 'labels.labels') })}</Button></div>
            <p className="mt-2 text-[11px] text-graphite">{t(layout === 'thermal' ? 'labels.dialogHelp' : 'labels.a4DialogHelp')}</p>
          </Card>
        </fieldset>
      </form>}
    </div>
    {accepted?.job ? <LabelPrintOutput job={accepted.job} /> : <p hidden className="label-print-notice">{t('labels.usePrintButton')}</p>}
  </div>;
}
