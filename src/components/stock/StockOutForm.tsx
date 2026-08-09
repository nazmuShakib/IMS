'use client';

import { useActionState, useEffect, useState, type FormEvent } from 'react';
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
import type { Supplier } from '@/domain/types';
import { supplierReturnFieldsSchema } from '@/schemas';

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
  suppliers,
  initialSerial,
}: {
  bulkProducts: ProductDTO[];
  suppliers: Supplier[];
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
        <SerialFlow initialSerial={initialSerial} suppliers={suppliers} />
      ) : (
        <BulkFlow products={bulkProducts} suppliers={suppliers} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SerialFlow({ initialSerial, suppliers }: { initialSerial?: string; suppliers: Supplier[] }) {
  const { t, message } = useI18n();
  const [lookup, lookupAction, looking] = useActionState(lookupSerial, {});
  const [out, outAction, submitting] = useActionState<StockActionState, FormData>(
    stockOutAction,
    {},
  );
  const [key, setKey] = useState('');
  const [dismissedReturnId, setDismissedReturnId] = useState<string | null>(null);

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
      {found && !done && <ConfirmUnit found={found} suppliers={suppliers} action={outAction} pending={submitting} idemKey={key} error={out.error} fieldErrors={out.fieldErrors} />}

      {out.ok && !out.supplierReturn && (
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
            {out.supplierReturn && (
              <Link href="/suppliers/returns">
                <Button variant="ghost" type="button">{t('supplierReturns.viewReturn')}</Button>
              </Link>
            )}
          </p>
        </Card>
      )}
      {out.ok && out.supplierReturn && dismissedReturnId !== out.supplierReturn.id && (
        <SupplierReturnSuccessModal
          message={message(out.ok)}
          supplierReturn={out.supplierReturn}
          onClose={() => setDismissedReturnId(out.supplierReturn!.id)}
        />
      )}
    </>
  );
}

function ConfirmUnit({
  found,
  suppliers,
  action,
  pending,
  idemKey,
  error,
  fieldErrors,
}: {
  found: SerialLookup;
  suppliers: Supplier[];
  action: (fd: FormData) => void;
  pending: boolean;
  idemKey: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}) {
  const [reason, setReason] = useState<string>('DAMAGE');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const { t, message } = useI18n();

  return (
    <form action={action} onSubmit={(event) => validateSupplierReturn(event, reason, setClientErrors)}>
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

            {reason === 'RETURN_TO_SUPPLIER' && (
              <SupplierReturnFields suppliers={suppliers} initialSupplierId={found.unit.supplierId ?? ''} errors={{ ...fieldErrors, ...clientErrors }} />
            )}

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

function BulkFlow({ products, suppliers }: { products: ProductDTO[]; suppliers: Supplier[] }) {
  const { t, message } = useI18n();
  const [state, formAction, pending] = useActionState<StockActionState, FormData>(
    stockOutAction,
    {},
  );
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('DAMAGE');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState('');
  const [dismissedReturnId, setDismissedReturnId] = useState<string | null>(null);

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
    <form action={formAction} onSubmit={(event) => validateSupplierReturn(event, reason, setClientErrors)}>
      <input type="hidden" name="idempotencyKey" value={key} />

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {message(state.error)}
        </div>
      )}
      {state.ok && !state.supplierReturn && (
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

          {reason === 'RETURN_TO_SUPPLIER' && <SupplierReturnFields suppliers={suppliers} errors={{ ...state.fieldErrors, ...clientErrors }} />}

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
      {state.ok && state.supplierReturn && dismissedReturnId !== state.supplierReturn.id && (
        <SupplierReturnSuccessModal
          message={message(state.ok)}
          supplierReturn={state.supplierReturn}
          onClose={() => setDismissedReturnId(state.supplierReturn!.id)}
        />
      )}
    </form>
  );
}

function SupplierReturnSuccessModal({
  message,
  supplierReturn,
  onClose,
}: {
  message: string;
  supplierReturn: NonNullable<StockActionState['supplierReturn']>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <Card className="w-full max-w-lg shadow-xl" >
        <div className="border-b border-rule p-5">
          <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-ok-wash text-[20px] font-semibold text-ok" aria-hidden="true">✓</div>
          <h2 className="text-[18px] font-semibold">{t('supplierReturns.createdTitle')}</h2>
          <p className="mt-1 text-[13px] text-graphite">{t('supplierReturns.createdHelp')}</p>
        </div>
        <div className="p-5">
          <p className="text-[14px] text-ok">{message}</p>
          <dl className="mt-3 grid gap-3 rounded-[3px] bg-plate p-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="eyebrow">{t('common.product')}</dt><dd className="mt-1 text-[14px] font-medium">{supplierReturn.productName}</dd></div>
            <div><dt className="eyebrow">{t('stock.productCode')}</dt><dd className="tnum mt-1 text-[13px]">{supplierReturn.sku}</dd></div>
            <div><dt className="eyebrow">{supplierReturn.serialNo ? t('stock.deviceNumbers') : t('common.quantity')}</dt><dd className="tnum mt-1 text-[13px]">{supplierReturn.serialNo ?? supplierReturn.quantity}</dd></div>
            <div className="sm:col-span-2"><dt className="eyebrow">{t('supplierReturns.returnNumber')}</dt><dd className="tnum mt-1 text-[13px] font-medium">{supplierReturn.returnNumber}</dd></div>
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t border-rule p-4">
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Link href="/suppliers/returns"><Button type="button">{t('supplierReturns.viewReturn')}</Button></Link>
        </div>
      </Card>
    </div>
  );
}

function SupplierReturnFields({
  suppliers,
  initialSupplierId = '',
  errors = {},
}: {
  suppliers: Supplier[];
  initialSupplierId?: string;
  errors?: Record<string, string>;
}) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t('common.supplier')} error={errors.supplierId}>
        <Select name="supplierId" defaultValue={initialSupplierId}>
          <option value="" disabled>{t('supplierReturns.chooseSupplier')}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </Select>
      </Field>
      <Field label={t('supplierReturns.returnReason')} error={errors.returnReason}>
        <Select name="returnReason" defaultValue="SLOW_MOVING">
          <option value="SLOW_MOVING">{t('supplierReturns.slowMoving')}</option>
          <option value="EXCESS_STOCK">{t('supplierReturns.excessStock')}</option>
          <option value="WRONG_ITEM">{t('supplierReturns.wrongItem')}</option>
          <option value="DEFECTIVE">{t('supplierReturns.defective')}</option>
          <option value="RECALL">{t('supplierReturns.recall')}</option>
          <option value="OTHER">{t('common.other')}</option>
        </Select>
      </Field>
    </>
  );
}

function validateSupplierReturn(
  event: FormEvent<HTMLFormElement>,
  reason: string,
  setErrors: (errors: Record<string, string>) => void,
) {
  if (reason !== 'RETURN_TO_SUPPLIER') { setErrors({}); return; }
  const data = new FormData(event.currentTarget);
  const result = supplierReturnFieldsSchema.safeParse({
    supplierId: String(data.get('supplierId') ?? ''),
    returnReason: String(data.get('returnReason') ?? ''),
  });
  if (result.success) { setErrors({}); return; }
  event.preventDefault();
  setErrors(Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message])));
}
