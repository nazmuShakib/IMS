'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import type { Brand, Category, Product } from '@/domain/types';
import { toTaka } from '@/lib/money';
import type { ActionState } from '@/actions/catalog';
import { Button, Card, Field, Input, MonoInput, Select, Textarea } from '@/components/ui';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ProductForm({
  action,
  categories,
  brands,
  product,
}: {
  action: Action;
  categories: Category[];
  brands: Brand[];
  product?: Product;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const err = (k: string) => state.fieldErrors?.[k];
  const editing = Boolean(product);

  return (
    <form action={formAction}>
      {product && <input type="hidden" name="id" value={product.id} />}

      {state.error && (
        <div className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[13px] text-out">
          {state.error}
        </div>
      )}

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">Identity</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" error={err('sku')} hint="Your internal code. Must be unique.">
            <MonoInput
              name="sku"
              required
              defaultValue={product?.sku}
              placeholder="SAM-A55-8-256"
            />
          </Field>

          <Field label="Barcode" error={err('barcode')} hint="Optional. Scanning is Phase 7.">
            <MonoInput name="barcode" defaultValue={product?.barcode ?? ''} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Name" error={err('name')}>
              <Input
                name="name"
                required
                defaultValue={product?.name}
                placeholder="Samsung Galaxy A55 (8/256GB)"
              />
            </Field>
          </div>

          <Field label="Model number" error={err('model')}>
            <MonoInput name="model" defaultValue={product?.model ?? ''} placeholder="SM-A556E" />
          </Field>

          <Field label="Category" error={err('categoryId')}>
            <Select name="categoryId" required defaultValue={product?.categoryId ?? ''}>
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Brand" error={err('brandId')}>
            <Select name="brandId" defaultValue={product?.brandId ?? ''}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Description" error={err('description')}>
              <Textarea name="description" defaultValue={product?.description ?? ''} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">How this product is counted</p>

        {editing ? (
          /* Changing tracking type on a product with history would orphan its units
             and break the ledger invariant. It's fixed at creation. (PLAN.md §5.3) */
          <div className="rounded-[3px] border border-rule bg-plate/60 px-3 py-2.5">
            <p className="text-[13px] font-medium">
              {product!.trackingType === 'SERIAL'
                ? 'Serial-tracked — one row per physical unit'
                : 'Bulk-counted — a single quantity'}
            </p>
            <p className="mt-1 text-[12px] text-graphite">
              This can&apos;t be changed after the product exists. Its units and its ledger
              history depend on it. Create a new product if you need the other kind.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
              <input
                type="radio"
                name="trackingType"
                value="SERIAL"
                defaultChecked
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-medium">Serial / IMEI</span>
                <span className="mt-0.5 block text-[12px] text-graphite">
                  Every unit is entered individually. Phones, laptops, TVs. Gives you exact
                  profit per unit and warranty lookup.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-[3px] border border-rule p-3 hover:bg-plate/50 has-checked:border-signal has-checked:bg-signal-wash">
              <input type="radio" name="trackingType" value="QUANTITY" className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium">Bulk quantity</span>
                <span className="mt-0.5 block text-[12px] text-graphite">
                  Counted, not serialised. Cables, adapters, screws. Costed at weighted
                  average.
                </span>
              </span>
            </label>
          </div>
        )}
      </Card>

      <Card className="mb-4 p-5">
        <p className="eyebrow mb-1">Default prices</p>
        <p className="mb-4 text-[12px] text-graphite">
          These only pre-fill the stock-in form. The real cost is recorded per unit when
          stock arrives, so a price change here never rewrites history.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cost price (৳)" error={err('defaultCostPrice')}>
            <MonoInput
              name="defaultCostPrice"
              inputMode="decimal"
              defaultValue={product ? toTaka(product.defaultCostPrice) : ''}
              placeholder="42000"
            />
          </Field>

          <Field label="Selling price (৳)" error={err('defaultSalePrice')}>
            <MonoInput
              name="defaultSalePrice"
              inputMode="decimal"
              defaultValue={product ? toTaka(product.defaultSalePrice) : ''}
              placeholder="47500"
            />
          </Field>

          <Field
            label="Reorder point"
            error={err('reorderPoint')}
            hint="Flag as low at or below this"
          >
            <MonoInput
              name="reorderPoint"
              inputMode="numeric"
              defaultValue={product?.reorderPoint ?? 5}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
        </Button>
        <Link href={product ? `/products/${product.id}` : '/products'}>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
