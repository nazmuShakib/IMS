'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Brand, Category, Product } from '@/domain/types';
import { toTaka } from '@/lib/money';
import type { ActionState } from '@/actions/catalog';
import { Button, Card, Field, HelpTerm, Input, MonoInput, Select, Textarea } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { productFormSchema, productFormErrors } from '@/lib/product-form';
import { generateNumericProductBarcode } from '@/lib/product-barcode';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ProductForm({
  action,
  categories,
  brands,
  product,
  canManageStaffDiscount = false,
}: {
  action: Action;
  categories: Category[];
  brands: Brand[];
  product?: Product;
  canManageStaffDiscount?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const { t, message } = useI18n();
  const editing = Boolean(product);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    sku: product?.sku ?? '', name: product?.name ?? '', barcode: product?.barcode ?? '',
    description: product?.description ?? '', model: product?.model ?? '',
    categoryId: product?.categoryId ?? '', brandId: product?.brandId ?? '',
    trackingType: product?.trackingType ?? 'SERIAL',
    defaultCostPrice: product ? String(toTaka(product.defaultCostPrice)) : '',
    defaultSalePrice: product ? String(toTaka(product.defaultSalePrice)) : '',
    staffMaxDiscount: product ? String(toTaka(product.staffMaxDiscount)) : '0',
    reorderPoint: String(product?.reorderPoint ?? 5),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setErrors(state.fieldErrors ?? {}); }, [state]);
  const err = (key: string) => errors[key] ? message(errors[key]) : undefined;
  function validate(next: Record<string, string>) {
    return productFormSchema.safeParse({ ...next,
      reorderPoint: next.reorderPoint?.trim() || String(product?.reorderPoint ?? 5),
    });
  }
  function update(key: string, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (errors[key] || key === 'defaultSalePrice' || key === 'defaultCostPrice') {
      const result = validate(next);
      const nextErrors = result.success ? {} : productFormErrors(result.error);
      setErrors((previous) => {
        const updated = { ...previous };
        for (const field of Object.keys(previous)) {
          if (field === key || ['defaultSalePrice', 'staffMaxDiscount'].includes(field)) {
            if (nextErrors[field]) updated[field] = nextErrors[field];
            else delete updated[field];
          }
        }
        return updated;
      });
    }
  }
  const binding = (name: string) => ({
    id: `product-${name}`,
    value: values[name] ?? '',
    onChange: (event: { target: { value: string } }) => update(name, event.target.value),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `product-${name}-error` : undefined,
  });

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => {
        const result = validate(values);
        if (!result.success) {
          event.preventDefault();
          const nextErrors = productFormErrors(result.error);
          setErrors(nextErrors);
          const field = event.currentTarget.elements.namedItem(Object.keys(nextErrors)[0] ?? '');
          if (field instanceof HTMLElement) field.focus();
        }
      }}
    >
      <fieldset disabled={pending} className="contents">
        {product && <input type="hidden" name="id" value={product.id} />}

        {state.error && (
          <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
            {message(state.error)}
          </div>
        )}

        <Card className="mb-4 p-5">
          <p className="eyebrow mb-4">{t('products.identity')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={<HelpTerm description={t('term.productCodeHelp')}>{t('term.productCode')}</HelpTerm>}
              error={err('sku')} errorId="product-sku-error" inputId="product-sku"
              hint={t('products.codeUnique')}
            >
              <MonoInput
                name="sku" {...binding('sku')}
                required

                placeholder={t('products.productCodePlaceholder')}
              />
            </Field>

            <Field
              label={t('common.barcode')}
              error={err('barcode')} errorId="product-barcode-error" inputId="product-barcode"
              hint={t('products.generatedBarcodeHelp')}
            >
              <div className="flex gap-2">
                <MonoInput
                  ref={barcodeRef}
                  name="barcode" {...binding('barcode')}

                />
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    if (!barcodeRef.current) return;
                    update('barcode', generateNumericProductBarcode());
                    barcodeRef.current.focus();
                    barcodeRef.current.select();
                  }}
                >
                  {t('products.generateBarcode')}
                </Button>
              </div>
            </Field>

            <div className="sm:col-span-2">
              <Field label={t('common.name')} error={err('name')} errorId="product-name-error" inputId="product-name">
                <Input
                  name="name" {...binding('name')}
                  required

                  placeholder={t('products.namePlaceholder')}
                />
              </Field>
            </div>

            <Field label={t('products.modelNumber')} error={err('model')} errorId="product-model-error" inputId="product-model">
              <MonoInput
                name="model" {...binding('model')}

                placeholder={t('products.modelPlaceholder')}
              />
            </Field>

            <Field label={t('common.category')} error={err('categoryId')} errorId="product-categoryId-error" inputId="product-categoryId">
              <Select name="categoryId" {...binding('categoryId')} required >
                <option value="" disabled>
                  {t('products.chooseCategory')}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('common.brand')} error={err('brandId')} errorId="product-brandId-error" inputId="product-brandId">
              <Select name="brandId" {...binding('brandId')} >
                <option value="">{t('products.noBrand')}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label={t('common.description')} error={err('description')} errorId="product-description-error" inputId="product-description">
                <Textarea name="description" {...binding('description')}  />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="mb-4 p-5">
          <p className="eyebrow mb-4">{t('products.counting')}</p>

          {editing ? (
            /* Changing tracking type on a product with history would orphan its units
               and break the ledger invariant. It's fixed at creation. (PLAN.md §5.3) */
            <div className="rounded-[3px] border border-rule bg-plate/60 px-3 py-2.5">
              <p className="text-[13px] font-medium">
                {product!.trackingType === 'SERIAL'
                  ? t('products.serialRecord')
                  : t('products.bulkRecord')}
              </p>
              <p className="mt-1 text-[12px] text-graphite">
                {t('products.trackingLocked')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
                <input
                  type="radio"
                  name="trackingType"
                  value="SERIAL"
                  checked={values.trackingType === 'SERIAL'} onChange={() => update('trackingType', 'SERIAL')}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[13px] font-medium">{t('products.serialTracking')}</span>
                  <span className="mt-0.5 block text-[12px] text-graphite">
                    {t('products.serialTrackingHelp')}
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
                <input type="radio" name="trackingType" value="QUANTITY" checked={values.trackingType === 'QUANTITY'} onChange={() => update('trackingType', 'QUANTITY')} className="mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium">{t('products.bulkTracking')}</span>
                  <span className="mt-0.5 block text-[12px] text-graphite">
                    {t('products.bulkTrackingHelp')}
                  </span>
                </span>
              </label>
            </div>
          )}
        </Card>

        <Card className="mb-4 p-5">
          <p className="eyebrow mb-1">{t('products.defaultPrices')}</p>
          <p className="mb-4 text-[12px] text-graphite">
            {t('products.defaultPricesHelp')}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('products.costPrice')} error={err('defaultCostPrice')} errorId="product-defaultCostPrice-error" inputId="product-defaultCostPrice">
              <MonoInput
                name="defaultCostPrice" {...binding('defaultCostPrice')}
                inputMode="decimal"

                placeholder="42000"
              />
            </Field>

            <Field label={t('products.sellingPrice')} error={err('defaultSalePrice')} errorId="product-defaultSalePrice-error" inputId="product-defaultSalePrice">
              <MonoInput
                name="defaultSalePrice" {...binding('defaultSalePrice')}
                inputMode="decimal"

                placeholder="47500"
              />
            </Field>

            <Field
              label={t('products.reorderPoint')}
              error={err('reorderPoint')} errorId="product-reorderPoint-error" inputId="product-reorderPoint"
              hint={t('products.reorderHint')}
            >
              <MonoInput
                name="reorderPoint" {...binding('reorderPoint')}
                inputMode="numeric"

              />
            </Field>

            {canManageStaffDiscount && (
              <Field
                label={t('products.staffMaxDiscount')}
                error={err('staffMaxDiscount')} errorId="product-staffMaxDiscount-error" inputId="product-staffMaxDiscount"
                hint={t('products.staffMaxDiscountHelp')}
              >
                <MonoInput
                  name="staffMaxDiscount" {...binding('staffMaxDiscount')}
                  inputMode="decimal"

                  placeholder="0"

                />
              </Field>
            )}
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : editing ? t('common.saveChanges') : t('products.create')}
          </Button>
          <Link className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3.5 text-[13px] hover:bg-plate" href={product ? `/products/${product.id}` : '/products'}>{t('common.cancel')}</Link>
        </div>
      </fieldset>
    </form>
  );
}
