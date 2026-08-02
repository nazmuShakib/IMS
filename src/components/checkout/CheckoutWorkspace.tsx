'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';

import {
  addCartItemAction,
  checkoutAction,
  createCustomerAction,
  removeCartItemAction,
  updateCartDetailsAction,
  updateCartItemAction,
  type CheckoutActionState,
} from '@/actions/checkout';
import { ScannerInput } from '@/components/search/ScannerInput';
import { DiscardDraftControl } from '@/components/checkout/DiscardDraftControl';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import type {
  CartDraft,
  Customer,
  PaymentMethod,
  PaymentStatus,
  TrackingType,
} from '@/domain/types';
import { formatBDT, toTaka } from '@/lib/money';
import { useI18n } from '@/components/i18n/I18nProvider';
import { domainLabel } from '@/lib/i18n/domain';

export interface CheckoutProductOption {
  id: string;
  name: string;
  sku: string;
  trackingType: TrackingType;
  onHand: number;
}

export interface CheckoutUnitOption {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  serialNo: string;
}

export interface CheckoutLine {
  id: string;
  productId: string;
  unitId: string | null;
  productName: string;
  sku: string;
  serialNo: string | null;
  trackingType: TrackingType;
  quantity: number;
  listUnitPrice: number;
  actualUnitPrice: number;
  onHand: number;
}

function Message({ state }: { state: CheckoutActionState }) {
  const { message } = useI18n();
  if (state.error) return <p className="mt-2 text-[12px] text-out">{message(state.error)}</p>;
  if (state.ok) return <p className="mt-2 text-[12px] text-ok">{message(state.ok)}</p>;
  return null;
}

function CartLineEditor({ cartId, line }: { cartId: string; line: CheckoutLine }) {
  const { t } = useI18n();
  const [updateState, updateAction, updating] = useActionState(updateCartItemAction, {});
  const [removeState, removeAction, removing] = useActionState(removeCartItemAction, {});

  return (
    <div className="border-b border-rule-soft px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{line.productName}</p>
          <p className="tnum text-[11px] text-graphite">
            {line.sku}{line.serialNo ? ` · ${line.serialNo}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-graphite">
            {t('checkout.listPrice', { price: formatBDT(line.listUnitPrice) })}
          </p>
        </div>
        <p className="tnum text-[13px] font-semibold">
          {formatBDT(line.actualUnitPrice * line.quantity)}
        </p>
      </div>
      <form action={updateAction} className="mt-3 grid gap-2 sm:grid-cols-[7rem_10rem_auto]">
        <input type="hidden" name="cartId" value={cartId} />
        <input type="hidden" name="itemId" value={line.id} />
        <Field label={t('common.quantity')}>
          <Input
            name="quantity"
            type="number"
            min={1}
            max={line.trackingType === 'SERIAL' ? 1 : Math.max(1, line.onHand)}
            defaultValue={line.quantity}
            readOnly={line.trackingType === 'SERIAL'}
          />
        </Field>
        <Field label={t('products.sellingPrice')}>
          <MonoInput
            name="actualUnitPrice"
            inputMode="decimal"
            required
            defaultValue={toTaka(line.actualUnitPrice)}
          />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="ghost" disabled={updating}>
            {updating ? t('common.saving') : t('checkout.update')}
          </Button>
          <Button
            type="submit"
            variant="danger"
            formAction={removeAction}
            disabled={removing}
          >
            {t('checkout.remove')}
          </Button>
        </div>
      </form>
      <Message state={updateState.error ? updateState : removeState} />
    </div>
  );
}

export function CheckoutWorkspace({
  cart,
  lines,
  products,
  units,
  customers,
}: {
  cart: CartDraft;
  lines: CheckoutLine[];
  products: CheckoutProductOption[];
  units: CheckoutUnitOption[];
  customers: Customer[];
}) {
  const { t } = useI18n();
  const [checkoutKey, setCheckoutKey] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [addState, addAction, adding] = useActionState(addCartItemAction, {});
  const [detailState, detailAction, saving] = useActionState(updateCartDetailsAction, {});
  const [customerState, customerAction, creatingCustomer] = useActionState(createCustomerAction, {});
  const [checkoutState, completeAction, checkingOut] = useActionState(checkoutAction, {});

  useEffect(() => setCheckoutKey(crypto.randomUUID()), []);

  useEffect(() => {
    if (!confirmingCheckout) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !checkingOut) setConfirmingCheckout(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmingCheckout, checkingOut]);

  const quantityProducts = products.filter((product) => product.trackingType === 'QUANTITY');
  const visibleCustomers = customers.filter((customer) => {
    const query = customerQuery.trim().toLowerCase();
    return !query
      || customer.name.toLowerCase().includes(query)
      || customer.phone?.toLowerCase().includes(query);
  });
  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.listUnitPrice * line.quantity, 0),
    [lines],
  );
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.actualUnitPrice * line.quantity, 0),
    [lines],
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
      <section>
        <Card className="mb-4 p-5">
          <p className="eyebrow mb-4">{t('checkout.addItems')}</p>
          <form action={addAction}>
            <input type="hidden" name="cartId" value={cart.id} />
            <Field
              label={<HelpTerm description={t('term.trackingHelp')}>{t('checkout.scanItem')}</HelpTerm>}
              hint={t('checkout.scanHint')}
            >
              <ScannerInput
                name="identifier"
                autoFocus
                autoComplete="off"
                placeholder={t('checkout.scanPlaceholder')}
              />
            </Field>
            <Button className="mt-3" type="submit" disabled={adding}>
              {adding ? t('checkout.adding') : t('checkout.addScanned')}
            </Button>
          </form>
          <div className="my-4 border-t border-rule" />
          <div className="grid gap-4 sm:grid-cols-2">
            <form action={addAction}>
              <input type="hidden" name="cartId" value={cart.id} />
              <Field label={t('checkout.bulkProduct')} hint={t('checkout.manualAlternative')}>
                <Select name="productId" defaultValue="">
                  <option value="" disabled>{t('stock.chooseProduct')}</option>
                  {quantityProducts.map((product) => (
                    <option key={product.id} value={product.id} disabled={product.onHand <= 0}>
                      {product.sku} — {product.name} ({product.onHand})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">{t('products.add')}</Button>
            </form>
            <form action={addAction}>
              <input type="hidden" name="cartId" value={cart.id} />
              <Field label={t('checkout.serialItem')} hint={t('checkout.chooseExact')}>
                <Select name="unitId" defaultValue="">
                  <option value="" disabled>{t('checkout.chooseDevice')}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.serialNo} — {unit.sku} — {unit.productName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="mt-3" type="submit" variant="ghost">{t('checkout.addUnit')}</Button>
            </form>
          </div>
          <Message state={addState} />
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="eyebrow">{t('checkout.cart', {
              count: lines.length,
              kind: t(lines.length === 1 ? 'checkout.line' : 'checkout.lines'),
            })}</p>
            <DiscardDraftControl cartId={cart.id} itemCount={lines.length} />
          </div>
          {lines.length === 0 ? (
            <p className="px-5 py-12 text-center text-[13px] text-graphite">
              {t('checkout.empty')}
            </p>
          ) : lines.map((line) => (
            <CartLineEditor key={line.id} cartId={cart.id} line={line} />
          ))}
        </Card>
      </section>

      <aside>
        <form action={detailAction}>
          <input type="hidden" name="cartId" value={cart.id} />
          <input type="hidden" name="idempotencyKey" value={checkoutKey} />
          <Card className="p-5">
            <p className="eyebrow mb-4">{t('checkout.customerPayment')}</p>
            <div className="space-y-4">
              <Field label={t('common.customer')} hint={t('checkout.customerHint')}>
                <Input
                  className="mb-2"
                  type="search"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder={t('checkout.filterCustomer')}
                  aria-label={t('checkout.filterCustomer')}
                />
                <Select name="customerId" defaultValue={cart.customerId ?? ''}>
                  <option value="">{t('checkout.walkIn')}</option>
                  {visibleCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}{customer.phone ? ` — ${customer.phone}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Field label={t('checkout.paymentMethod')}>
                  <Select name="paymentMethod" defaultValue={cart.paymentMethod}>
                    {(['CASH', 'CARD', 'MOBILE_BANKING', 'BANK_TRANSFER', 'MIXED', 'OTHER'] as PaymentMethod[])
                      .map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
                  </Select>
                </Field>
                <Field label={t('checkout.paymentStatus')}>
                  <Select name="paymentStatus" defaultValue={cart.paymentStatus}>
                    {(['PAID', 'UNPAID'] as PaymentStatus[])
                      .map((value) => <option key={value} value={value}>{domainLabel(t, value)}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label={t('common.reference')}>
                <Input name="reference" defaultValue={cart.reference ?? ''} maxLength={100} />
              </Field>
              <Field label={t('checkout.invoiceNote')}>
                <Textarea name="note" defaultValue={cart.note ?? ''} rows={3} />
              </Field>
            </div>

            <div className="my-5 border-t border-rule" />
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between"><dt>{t('checkout.listSubtotal')}</dt><dd className="tnum">{formatBDT(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>{t('checkout.priceAdjustment')}</dt><dd className="tnum">{formatBDT(subtotal - total)}</dd></div>
              <div className="flex justify-between border-t border-rule pt-2 text-[16px] font-semibold"><dt>{t('common.total')}</dt><dd className="tnum">{formatBDT(total)}</dd></div>
            </dl>

            <div className="mt-5 grid gap-2">
              <Button type="submit" variant="ghost" disabled={saving || checkingOut}>
                {saving ? t('common.saving') : t('checkout.saveDraft')}
              </Button>
              <Button
                type="button"
                onClick={() => setConfirmingCheckout(true)}
                disabled={checkingOut || lines.length === 0 || !checkoutKey}
              >
                {checkingOut ? t('checkout.completing') : t('checkout.complete')}
              </Button>
            </div>
            <Message state={checkoutState.error ? checkoutState : detailState} />
            <p className="mt-3 text-[11px] text-graphite">
              {t('checkout.transactionHelp')}
            </p>

            {confirmingCheckout && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !checkingOut) {
                    setConfirmingCheckout(false);
                  }
                }}
              >
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="complete-sale-title"
                  aria-describedby="complete-sale-description"
                  className="w-full max-w-md rounded-[3px] border border-rule bg-card p-5 shadow-xl"
                >
                  <h2 id="complete-sale-title" className="text-[16px] font-semibold">
                    {t('checkout.confirmTitle')}
                  </h2>
                  <p id="complete-sale-description" className="mt-2 text-[13px] text-graphite">
                    {t('checkout.confirmDescription', {
                      count: lines.length,
                      kind: t(lines.length === 1 ? 'checkout.line' : 'checkout.lines'),
                      total: formatBDT(total),
                    })}
                  </p>
                  <p className="mt-2 text-[12px] text-out">
                    {t('checkout.cannotUndo')}
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingCheckout(false)}
                      disabled={checkingOut}
                      autoFocus
                    >
                      {t('checkout.keepEditing')}
                    </Button>
                    <Button
                      type="submit"
                      formAction={completeAction}
                      disabled={checkingOut}
                    >
                      {checkingOut ? t('checkout.completing') : t('checkout.yesComplete')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </form>

        <details className="mt-4 rounded-[3px] border border-rule bg-card">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
            {t('checkout.newCustomer')}
          </summary>
          <form action={customerAction} className="border-t border-rule p-4">
            <input type="hidden" name="cartId" value={cart.id} />
            <div className="space-y-3">
              <Field label={t('common.name')}><Input name="name" required maxLength={150} /></Field>
              <Field label={t('customers.mobile')}>
                <MonoInput
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  maxLength={30}
                  placeholder="01712345678"
                />
              </Field>
              <Button type="submit" disabled={creatingCustomer}>
                {creatingCustomer ? t('customers.creating') : t('checkout.createSelect')}
              </Button>
              <Message state={customerState} />
            </div>
          </form>
        </details>
      </aside>
    </div>
  );
}
