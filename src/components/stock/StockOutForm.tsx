'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProductDTO } from '@/lib/dto';
import { formatBDT, toTaka } from '@/lib/money';
import {
  lookupSerial,
  stockOutAction,
  type SerialLookup,
  type StockActionState,
} from '@/actions/stock';
import { Button, Card, Field, Input, MonoInput, Select, SerialChip } from '@/components/ui';

const REASONS = [
  ['SALE', 'Sold to a customer'],
  ['DAMAGE', 'Damaged / unsellable'],
  ['LOSS', 'Lost or stolen'],
  ['INTERNAL_USE', 'Shop use / demo / gift'],
  ['RETURN_TO_SUPPLIER', 'Returned to supplier'],
] as const;

/**
 * Two flows, because the shop has two:
 *
 *  - SERIAL: a device is on the counter. You type its IMEI, and the app tells you
 *    what it is and what it cost. You never have to find the product first.
 *  - BULK:   you pick the product and say how many.
 */
export function StockOutForm({
  bulkProducts,
  initialSerial,
}: {
  bulkProducts: ProductDTO[];
  initialSerial?: string;
}) {
  const [mode, setMode] = useState<'serial' | 'bulk'>('serial');

  return (
    <>
      <div className="mb-4 inline-flex rounded-[3px] border border-rule bg-card p-0.5">
        {(
          [
            ['serial', 'By serial / IMEI'],
            ['bulk', 'By quantity'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-[2px] px-3 py-1.5 text-[13px] transition-colors ${
              mode === m ? 'bg-ink font-medium text-white' : 'text-graphite hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'serial' ? (
        <SerialFlow initialSerial={initialSerial} />
      ) : (
        <BulkFlow products={bulkProducts} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SerialFlow({ initialSerial }: { initialSerial?: string }) {
  const [lookup, lookupAction, looking] = useActionState(lookupSerial, {});
  const [out, outAction, submitting] = useActionState<StockActionState, FormData>(
    stockOutAction,
    {},
  );
  const [key, setKey] = useState('');

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (out.ok) setKey(crypto.randomUUID());
  }, [out.ok]);

  const found = lookup.found;
  const done = Boolean(out.ok);

  return (
    <>
      {/* Step 1 — identify the device */}
      <Card className="mb-4 p-5">
        <p className="eyebrow mb-1">Scan or type the serial</p>
        <p className="mb-3 text-[12px] text-graphite">
          A barcode scanner types the number and presses Enter — this box already works with
          one.
        </p>

        <form action={lookupAction} className="flex gap-2">
          <MonoInput
            name="serialNo"
            defaultValue={initialSerial}
            placeholder="352099001761482"
            autoFocus
            className="max-w-xs"
          />
          <Button type="submit" variant="ghost" disabled={looking}>
            {looking ? 'Finding…' : 'Find'}
          </Button>
        </form>

        {lookup.error && <p className="mt-3 text-[13px] text-out">{lookup.error}</p>}
      </Card>

      {/* Step 2 — confirm and record */}
      {found && !done && <ConfirmUnit found={found} action={outAction} pending={submitting} idemKey={key} error={out.error} />}

      {out.ok && (
        <Card className="border-ok/30 bg-ok-wash p-5">
          <p className="text-[13px] font-medium text-ok">{out.ok}</p>
          <p className="mt-3 flex gap-2">
            <Button variant="ghost" type="button" onClick={() => window.location.reload()}>
              Next device
            </Button>
            <Link href="/stock/movements">
              <Button variant="ghost" type="button">
                See the ledger
              </Button>
            </Link>
          </p>
        </Card>
      )}
    </>
  );
}

function ConfirmUnit({
  found,
  action,
  pending,
  idemKey,
  error,
}: {
  found: SerialLookup;
  action: (fd: FormData) => void;
  pending: boolean;
  idemKey: string;
  error?: string;
}) {
  const [reason, setReason] = useState<string>('SALE');

  return (
    <form action={action}>
      <input type="hidden" name="idempotencyKey" value={idemKey} />
      <input type="hidden" name="productId" value={found.productId} />
      <input type="hidden" name="serialNo" value={found.unit.serialNo} />

      {error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {error}
        </div>
      )}

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-4 border-b border-rule p-4">
          <div>
            <p className="text-[13px] font-medium">{found.productName}</p>
            <p className="tnum mt-0.5 text-[11px] text-graphite">{found.sku}</p>
          </div>
          <SerialChip serial={found.unit.serialNo} />
        </div>

        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Why is it leaving?">
              <Select name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            {reason === 'SALE' && (
              <Field
                label="Selling price (৳)"
                hint={
                  found.unit.costPrice !== undefined
                    ? `Cost was ${formatBDT(found.unit.costPrice)}`
                    : undefined
                }
              >
                <MonoInput
                  name="salePrice"
                  inputMode="decimal"
                  required
                  defaultValue={toTaka(found.suggestedPrice)}
                />
              </Field>
            )}
          </div>

          {reason === 'SALE' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Customer name">
                <Input name="customerName" placeholder="Optional" />
              </Field>
              <Field label="Phone">
                <MonoInput name="customerPhone" placeholder="Optional" />
              </Field>
              <Field label="Memo number" hint="Groups a multi-item sale">
                <MonoInput name="reference" placeholder="MEMO-2001" />
              </Field>
            </div>
          )}

          {reason !== 'SALE' && (
            <div className="mt-4">
              <Field label="Note" hint="Goes in the audit trail">
                <Input name="note" placeholder="Screen cracked in the back room" />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? 'Recording…' : reason === 'SALE' ? 'Record sale' : 'Remove from stock'}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function BulkFlow({ products }: { products: ProductDTO[] }) {
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    stockOutAction,
    {},
  );
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('SALE');
  const [key, setKey] = useState('');

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.ok) setKey(crypto.randomUUID());
  }, [state.ok]);

  const product = products.find((p) => p.id === productId);

  if (products.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[13px] text-graphite">
          No bulk-counted products yet. Serial-tracked products go out through the other tab.
        </p>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="idempotencyKey" value={key} />

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="mb-4 rounded-[3px] border border-ok/20 bg-ok-wash px-3 py-2 text-[13px] text-ok">
          {state.ok}
        </div>
      )}

      <Card className="mb-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product">
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
                  {p.sku} — {p.name} ({p.quantityOnHand} on hand)
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="How many"
            hint={product ? `${product.quantityOnHand} on hand` : undefined}
          >
            <MonoInput
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={product?.quantityOnHand}
              required
              placeholder="12"
            />
          </Field>

          <Field label="Why is it leaving?">
            <Select name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          {reason === 'SALE' && (
            <Field label="Selling price each (৳)">
              <MonoInput
                name="salePrice"
                inputMode="decimal"
                required
                defaultValue={product ? toTaka(product.defaultSalePrice) : ''}
              />
            </Field>
          )}

          <Field label="Reference">
            <MonoInput name="reference" placeholder="MEMO-2003" />
          </Field>
          <Field label="Note">
            <Input name="note" />
          </Field>
        </div>
      </Card>

      <Button type="submit" disabled={pending || !product}>
        {pending ? 'Recording…' : reason === 'SALE' ? 'Record sale' : 'Remove from stock'}
      </Button>
    </form>
  );
}
