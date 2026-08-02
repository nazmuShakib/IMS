'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProductDTO } from '@/lib/dto';
import {
  lookupSerial,
  stockOutAction,
  type SerialLookup,
  type StockActionState,
} from '@/actions/stock';
import { Button, Card, Field, Input, MonoInput, Select, SerialChip } from '@/components/ui';
import { ScannerInput } from '@/components/search/ScannerInput';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/messages';

const REASONS = [
  ['DAMAGE', 'stock.damaged'],
  ['LOSS', 'stock.lost'],
  ['INTERNAL_USE', 'stock.internalUse'],
  ['RETURN_TO_SUPPLIER', 'stock.returnSupplier'],
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
  const { t } = useI18n();

  return (
    <>
      <div className="mb-4 inline-flex rounded-[3px] border border-rule bg-card p-0.5">
        {(
          [
            ['serial', t('stock.bySerial')],
            ['bulk', t('stock.byQuantity')],
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
  const { t, message } = useI18n();
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
        <p className="eyebrow mb-1">{t('stock.scanOrTypeDevice')}</p>
        <p className="mb-3 text-[12px] text-graphite">
          {t('stock.scannerHelp')}
        </p>

        <form action={lookupAction} className="flex gap-2">
          <ScannerInput
            name="serialNo"
            defaultValue={initialSerial}
            placeholder="352099001761482"
            autoFocus
            className="max-w-xs"
          />
          <Button type="submit" variant="ghost" disabled={looking}>
            {looking ? t('stock.finding') : t('stock.find')}
          </Button>
        </form>

        {lookup.error && <p className="mt-3 text-[13px] text-out">{message(lookup.error)}</p>}
      </Card>

      {/* Step 2 — confirm and record */}
      {found && !done && <ConfirmUnit found={found} action={outAction} pending={submitting} idemKey={key} error={out.error} />}

      {out.ok && (
        <Card className="border-ok/30 bg-ok-wash p-5">
          <p className="text-[13px] font-medium text-ok">{message(out.ok)}</p>
          <p className="mt-3 flex gap-2">
            <Button variant="ghost" type="button" onClick={() => window.location.reload()}>
              {t('stock.nextDevice')}
            </Button>
            <Link href="/stock/movements">
              <Button variant="ghost" type="button">
                {t('stock.seeLedger')}
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
  const [reason, setReason] = useState<string>('DAMAGE');
  const { t, message } = useI18n();

  return (
    <form action={action}>
      <input type="hidden" name="idempotencyKey" value={idemKey} />
      <input type="hidden" name="productId" value={found.productId} />
      <input type="hidden" name="serialNo" value={found.unit.serialNo} />

      {error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(error)}
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
            <Field label={t('stock.whyLeaving')}>
              <Select name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {t(label as MessageKey)}
                  </option>
                ))}
              </Select>
            </Field>

          </div>

          <div className="mt-4">
            <Field label={t('common.note')} hint={t('stock.auditNote')}>
              <Input name="note" placeholder="Screen cracked in the back room" />
            </Field>
          </div>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        {pending ? t('stock.recording') : t('stock.remove')}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function BulkFlow({ products }: { products: ProductDTO[] }) {
  const { t, message } = useI18n();
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    stockOutAction,
    {},
  );
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('DAMAGE');
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
          {t('stock.noBulk')}
        </p>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="idempotencyKey" value={key} />

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(state.error)}
        </div>
      )}
      {state.ok && (
        <div className="mb-4 rounded-[3px] border border-ok/20 bg-ok-wash px-3 py-2 text-[13px] text-ok">
          {message(state.ok)}
        </div>
      )}

      <Card className="mb-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.product')}>
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
                  {p.sku} — {p.name} ({t('stock.onHandCount', { count: p.quantityOnHand })})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t('stock.howMany')}
            hint={product ? t('stock.onHandCount', { count: product.quantityOnHand }) : undefined}
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

          <Field label={t('stock.whyLeaving')}>
            <Select name="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {t(label as MessageKey)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('common.reference')}>
            <MonoInput name="reference" placeholder="MEMO-2003" />
          </Field>
          <Field label={t('common.note')}>
            <Input name="note" />
          </Field>
        </div>
      </Card>

      <Button type="submit" disabled={pending || !product}>
        {pending ? t('stock.recording') : t('stock.remove')}
      </Button>
    </form>
  );
}
