'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Supplier } from '@/domain/types';
import type { ProductDTO } from '@/lib/dto';
import { toTaka } from '@/lib/money';
import { receiveStockAction, type StockActionState } from '@/actions/stock';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { ScannerInput } from '@/components/search/ScannerInput';
import { useI18n } from '@/components/i18n/I18nProvider';

export function StockInForm({
  products,
  suppliers,
  initialProductId,
}: {
  products: ProductDTO[];
  suppliers: Supplier[];
  initialProductId?: string;
}) {
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    receiveStockAction,
    {},
  );
  const { t, message } = useI18n();

  const [productId, setProductId] = useState(initialProductId ?? '');
  const [serialText, setSerialText] = useState('');
  const [serialScan, setSerialScan] = useState('');
  const [cost, setCost] = useState('');
  const [key, setKey] = useState('');
  const [scanError, setScanError] = useState('');
  const [serialScanError, setSerialScanError] = useState('');
  const serialScanRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const isSerial = product?.trackingType === 'SERIAL';

  // A fresh idempotency key per submission. Generated in an effect so the server
  // render and the client render agree (no hydration mismatch), and rotated after
  // every success so the next receipt isn't swallowed as a replay.
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.ok) {
      setKey(crypto.randomUUID());
      setSerialText('');
      setSerialScan('');
      setSerialScanError('');
    }
  }, [state.ok]);

  useEffect(() => {
    if (isSerial) serialScanRef.current?.focus();
  }, [isSerial, productId]);

  // Prefill cost from the product's default, but let the operator override it —
  // the real cost is whatever the supplier charged THIS time, and it's what gets
  // written onto each unit.
  useEffect(() => {
    if (product) {
      setCost(
        product.defaultCostPrice === undefined ? '' : String(toTaka(product.defaultCostPrice)),
      );
    }
  }, [product]);

  const serials = serialText
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seenSerials = new Set<string>();
  const dupes = serials.filter((serial) => {
    const key = serial.toLocaleLowerCase();
    if (seenSerials.has(key)) return true;
    seenSerials.add(key);
    return false;
  });
  const uniqueSerialCount = seenSerials.size;

  function appendScannedSerial(value: string) {
    const scanned = value.trim();
    if (!scanned) return;
    if (serials.some((serial) => serial.toLocaleLowerCase() === scanned.toLocaleLowerCase())) {
      setSerialScanError(`${scanned} is already in this receipt.`);
      setSerialScan('');
      return;
    }
    setSerialText((current) => {
      const existing = current.trimEnd();
      return existing ? `${existing}\n${scanned}` : scanned;
    });
    setSerialScan('');
    setSerialScanError('');
  }

  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} id={formId}>
      <input type="hidden" name="idempotencyKey" value={key} />

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(state.error)}
        </div>
      )}
      {state.ok && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-ok/20 bg-ok-wash px-3 py-2 text-[13px] text-ok">
          <span>{message(state.ok)}</span>
          {state.labelReceiptId && (
            <Link
              href={`/stock/labels?receipt=${encodeURIComponent(state.labelReceiptId)}`}
              className="rounded-[3px] border border-ok/30 bg-card px-3 py-1.5 text-[12px] font-medium text-ok hover:bg-ok-wash"
            >
              {t('stock.printLabels')}
            </Link>
          )}
        </div>
      )}

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">{t('stock.whatArrived')}</p>
        <div className="mb-4 max-w-md">
          <Field
            label={<HelpTerm description={t('term.productCodeHelp')}>{t('stock.scanProduct')}</HelpTerm>}
            hint={t('stock.scanOptional')}
          >
            <ScannerInput
              placeholder={t('stock.scanEnter')}
              onScan={(value) => {
                const normalized = value.toLowerCase();
                const match = products.find((item) => item.barcode?.toLowerCase() === normalized)
                  ?? products.find((item) => item.sku.toLowerCase() === normalized);
                if (!match) { setScanError('No active product matches that barcode or product code (SKU).'); return; }
                setProductId(match.id); setScanError('');
              }}
            />
          </Field>
          {scanError && <p className="mt-1 text-[12px] text-out">{scanError}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.product')} error={err('productId')}>
            <Select
              name="productId"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="" disabled>
                {t('stock.chooseProduct')}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('common.supplier')}>
            <Select name="supplierId" defaultValue="">
              <option value="">{t('common.notRecorded')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t('stock.costPerUnit')}
            error={err('unitCost')}
            hint={t('stock.costHelp')}
          >
            <MonoInput
              name="unitCost"
              inputMode="decimal"
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="42000"
            />
          </Field>

          <Field label={t('stock.reason')}>
            <Select name="reason" defaultValue="PURCHASE">
              <option value="PURCHASE">{t('stock.purchaseSupplier')}</option>
              <option value="INITIAL_STOCK">{t('stock.openingBalance')}</option>
              <option value="CUSTOMER_RETURN">{t('stock.customerReturn')}</option>
            </Select>
          </Field>

          <Field label={t('common.reference')} hint={t('stock.referenceHint')}>
            <MonoInput name="reference" placeholder="CHL-1001" />
          </Field>

          <Field label={t('common.note')}>
            <Input name="note" />
          </Field>
        </div>
      </Card>

      {product && (
        <Card className="mb-4 p-5">
          {isSerial ? (
            <>
              <p className="eyebrow mb-1">{t('stock.deviceNumbers')}</p>
              <p className="mb-3 text-[12px] text-graphite">
                {t('stock.deviceListHelp')}
              </p>

              <div className="mb-4 max-w-md">
                <Field
                  label={<HelpTerm description={t('term.trackingHelp')}>{t('stock.scanDevice')}</HelpTerm>}
                  hint={t('stock.scanDeviceHint')}
                >
                  <ScannerInput
                    ref={serialScanRef}
                    value={serialScan}
                    onValueChange={setSerialScan}
                    onScan={appendScannedSerial}
                    placeholder={t('stock.scanDevice')}
                    autoComplete="off"
                  />
                </Field>
                {serialScanError && (
                  <p className="mt-1 text-[12px] text-out" role="alert">
                    {serialScanError}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-graphite">
                  {t('stock.imeiHint')}
                </p>
              </div>

              <Textarea
                name="serialNumbers"
                value={serialText}
                onChange={(e) => {
                  setSerialText(e.target.value);
                  setSerialScanError('');
                }}
                rows={6}
                className="tnum min-h-32"
                placeholder={'352099001761481\n352099001761482\n352099001761483'}
                required
              />

              <div className="mt-2 flex items-center gap-3 text-[12px]">
                <span className="tnum text-graphite">
                  {t('stock.uniqueUnits', {
                    count: uniqueSerialCount,
                    kind: t(uniqueSerialCount === 1 ? 'stock.unit' : 'stock.units'),
                  })}
                </span>
                {dupes.length > 0 && (
                  <span className="text-out">
                    {dupes.length} duplicate{dupes.length > 1 ? 's' : ''} in this list:{' '}
                    <span className="tnum">{[...new Set(dupes)].join(', ')}</span>
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={t('stock.warrantyMonths')} hint={t('stock.warrantyHint')}>
                  <MonoInput name="warrantyMonths" inputMode="numeric" defaultValue={12} />
                </Field>
                <Field label={t('stock.location')}>
                  <Input name="location" placeholder="Shelf A1" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow mb-1">{t('common.quantity')}</p>
              <p className="mb-3 text-[12px] text-graphite">
                {t('stock.bulkHelp', { product: product.name })}
              </p>
              <div className="max-w-40">
                <Field label={t('stock.unitsReceived')} error={err('quantity')}>
                  <MonoInput
                    name="quantity"
                    inputMode="numeric"
                    required
                    min={1}
                    type="number"
                    placeholder="100"
                  />
                </Field>
              </div>
            </>
          )}
        </Card>
      )}

      <Button
        type="submit"
        disabled={pending || !product || (isSerial && (uniqueSerialCount === 0 || dupes.length > 0))}
      >
        {pending
          ? t('stock.receiving')
          : isSerial && uniqueSerialCount > 0
            ? t('stock.receiveCount', {
                count: uniqueSerialCount,
                kind: t(uniqueSerialCount === 1 ? 'stock.unit' : 'stock.units'),
              })
            : t('stock.receiveTitle')}
      </Button>
    </form>
  );
}
