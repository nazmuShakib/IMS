'use client';

import type { FormEvent, ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { PRODUCT_DEFAULTS, type ProductFilterValues } from '@/lib/catalog-query';
import { CatalogPagination, CatalogResults, type PageMeta } from './CatalogPagination';
import { useCatalogNavigation } from './useCatalogNavigation';
export type { ProductFilterValues } from '@/lib/catalog-query';

export function ProductRegister({
  confirmedFilters,
  categories,
  brands,
  showCosts,
  resultVersion,
  children,
  meta,
}: {
  confirmedFilters: ProductFilterValues;
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  showCosts: boolean;
  resultVersion: string;
  children: ReactNode;
  meta: PageMeta;
}) {
  const { t } = useI18n();
  const { values, setValues, pending, navigate } = useCatalogNavigation('/products', confirmedFilters, resultVersion);
  function update(key: keyof ProductFilterValues, value: string) { setValues(current => ({ ...current, [key]: value })); }
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate(values, { page: 1, pageSize: meta.pageSize }); }
  const activeCount = Object.entries(confirmedFilters).filter(([key, value]) => value !== PRODUCT_DEFAULTS[key as keyof ProductFilterValues]).length;

  return (
    <>
      <Card className="mb-4 p-4">
        <form onSubmit={apply}><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label={t('common.search')}>
              <Input
                type="search"
                value={values.q}
                onChange={(event) => update('q', event.target.value)}
                placeholder={t('products.filterSearchPlaceholder')}
              />
            </Field>
          </div>
          <Field label={t('term.trackingMethod')}>
            <Select value={values.tracking} onChange={(event) => update('tracking', event.target.value)}>
              <option value="">{t('products.allTrackingMethods')}</option>
              <option value="SERIAL">{t('term.serial')}</option>
              <option value="QUANTITY">{t('term.bulkCount')}</option>
            </Select>
          </Field>
          <Field label={t('products.stockStatus')}>
            <Select value={values.stock} onChange={(event) => update('stock', event.target.value)}>
              <option value="">{t('products.allStockLevels')}</option>
              <option value="on-hand">{t('products.onHandOnly')}</option>
              <option value="low">{t('products.lowStockOnly')}</option>
              <option value="out">{t('products.outOfStockOnly')}</option>
              <option value="dead">{t('products.deadStockOnly')}</option>
            </Select>
          </Field>
          <Field label={t('common.category')}>
            <Select value={values.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">{t('products.allCategories')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.brand')}>
            <Select value={values.brand} onChange={(event) => update('brand', event.target.value)}>
              <option value="">{t('products.allBrands')}</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={values.status} onChange={(event) => update('status', event.target.value)}>
              <option value="active">{t('products.activeOnly')}</option>
              <option value="archived">{t('products.archivedOnly')}</option>
              <option value="all">{t('products.allStatuses')}</option>
            </Select>
          </Field>
          <Field label={t('catalog.orderBy')}>
            <Select value={values.order} onChange={(event) => update('order', event.target.value)}>
              <option value="name-asc">{t('catalog.nameAscending')}</option>
              <option value="name-desc">{t('catalog.nameDescending')}</option>
              <option value="newest">{t('products.createdNewest')}</option>
              <option value="oldest">{t('products.createdOldest')}</option>
              <option value="stock-desc">{t('products.stockHigh')}</option>
              <option value="stock-asc">{t('products.stockLow')}</option>
              {showCosts && <option value="cost-desc">{t('products.orderCostHigh')}</option>}
              {showCosts && <option value="cost-asc">{t('products.orderCostLow')}</option>}
              <option value="price-desc">{t('products.salePriceHigh')}</option>
              <option value="price-asc">{t('products.salePriceLow')}</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={pending}>{t('common.applyFilters')}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => { setValues(PRODUCT_DEFAULTS); navigate(PRODUCT_DEFAULTS, { page: 1, pageSize: meta.pageSize }); }}>{t('common.reset')}</Button>
          </div>
        </fieldset></form>
        <p className="mt-3 text-[12px] text-graphite">{t('catalog.appliedFilters', { count: activeCount })}</p>
        <p className="mt-2 text-[11px] text-graphite">{t('products.deadStockHelp')}</p>
      </Card>

      <Card>
        <CatalogResults pending={pending} version={resultVersion}>{children}</CatalogResults>
        <CatalogPagination meta={meta} pending={pending} onChange={page => navigate(confirmedFilters, page)} />
      </Card>
    </>
  );
}
