'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Supplier } from '@/domain/types';
import type { ProductDTO } from '@/lib/dto';
import { toTaka } from '@/lib/money';
import { receiveStockAction, type StockActionState } from '@/actions/stock';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { ScannerInput } from '@/components/search/ScannerInput';

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
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-ok/20 bg-ok-wash px-3 py-2 text-[13px] text-ok">
          <span>{state.ok}</span>
          {state.labelReceiptId && (
            <Link
              href={`/stock/labels?receipt=${encodeURIComponent(state.labelReceiptId)}`}
              className="rounded-[3px] border border-ok/30 bg-card px-3 py-1.5 text-[12px] font-medium text-ok hover:bg-ok-wash"
            >
              Print labels
            </Link>
          )}
        </div>
      )}

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">What arrived</p>
        <div className="mb-4 max-w-md">
          <Field
            label={<HelpTerm description="The product code (SKU) is your shop's unique code for a product.">Scan product barcode or product code (SKU)</HelpTerm>}
            hint="Optional — manual selection remains available"
          >
            <ScannerInput
              placeholder="Scan, then press Enter"
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
          <Field label="Product" error={err('productId')}>
            <Select
              name="productId"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="" disabled>
                Choose a product
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Supplier">
            <Select name="supplierId" defaultValue="">
              <option value="">Not recorded</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Cost per unit (৳)"
            error={err('unitCost')}
            hint="What you paid this time. Written onto every unit received."
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

          <Field label="Reason">
            <Select name="reason" defaultValue="PURCHASE">
              <option value="PURCHASE">Purchase from supplier</option>
              <option value="INITIAL_STOCK">Opening balance</option>
              <option value="CUSTOMER_RETURN">Customer return</option>
            </Select>
          </Field>

          <Field label="Reference" hint="Challan or invoice number">
            <MonoInput name="reference" placeholder="CHL-1001" />
          </Field>

          <Field label="Note">
            <Input name="note" />
          </Field>
        </div>
      </Card>

      {product && (
        <Card className="mb-4 p-5">
          {isSerial ? (
            <>
              <p className="eyebrow mb-1">Device numbers / IMEIs</p>
              <p className="mb-3 text-[12px] text-graphite">
                One per line, or comma separated — paste straight from the delivery note.
                Each one becomes a unit you can look up, sell and warranty individually.
              </p>

              <div className="mb-4 max-w-md">
                <Field
                  label={<HelpTerm description="The unique serial number or IMEI printed on an individual device.">Scan device number / IMEI</HelpTerm>}
                  hint="Each scan is appended below. Configure the scanner to send Enter after the code."
                >
                  <ScannerInput
                    ref={serialScanRef}
                    value={serialScan}
                    onValueChange={setSerialScan}
                    onScan={appendScannedSerial}
                    placeholder="Scan device number or IMEI, then press Enter"
                    autoComplete="off"
                  />
                </Field>
                {serialScanError && (
                  <p className="mt-1 text-[12px] text-out" role="alert">
                    {serialScanError}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-graphite">
                  Use one identifier per physical unit—normally IMEI 1 for a dual-SIM phone.
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
                  {uniqueSerialCount} unique {uniqueSerialCount === 1 ? 'unit' : 'units'} to receive
                </span>
                {dupes.length > 0 && (
                  <span className="text-out">
                    {dupes.length} duplicate{dupes.length > 1 ? 's' : ''} in this list:{' '}
                    <span className="tnum">{[...new Set(dupes)].join(', ')}</span>
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Warranty (months)" hint="Counts from the day it sells, not today">
                  <MonoInput name="warrantyMonths" inputMode="numeric" defaultValue={12} />
                </Field>
                <Field label="Location">
                  <Input name="location" placeholder="Shelf A1" />
                </Field>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow mb-1">Quantity</p>
              <p className="mb-3 text-[12px] text-graphite">
                {product.name} is bulk-counted. Receiving updates its weighted-average cost.
              </p>
              <div className="max-w-40">
                <Field label="Units received" error={err('quantity')}>
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
          ? 'Receiving…'
          : isSerial && uniqueSerialCount > 0
            ? `Receive ${uniqueSerialCount} ${uniqueSerialCount === 1 ? 'unit' : 'units'}`
            : 'Receive stock'}
      </Button>
    </form>
  );
}
