import Link from 'next/link';
import { db } from '@/repositories';
import { getSession, canSeeCosts } from '@/lib/session';
import { toProductDTO } from '@/lib/dto';
import { productQuery, type RawParams } from '@/lib/catalog-query';
import { createTranslator } from '@/lib/i18n/messages';
import { ProductRegister } from '@/components/catalog/ProductRegister';
import { Badge, ButtonLink, EmptyState, HelpTerm, Money, PageHeader, StockCount, TableViewport, stockLevel } from '@/components/ui';
export const dynamic = 'force-dynamic';
export default async function ProductsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);
  const query = productQuery(await searchParams, showCosts);
  const { page: requestedPage, pageSize, now, ...confirmedFilters } = query;
  const [categories, brands, result] = await Promise.all([
    db.categories.findAll(), db.brands.findAll(), db.products.findPage(query),
  ]);
  const categoryName = new Map(categories.map(category => [category.id, category.name]));
  const brandName = new Map(brands.map(brand => [brand.id, brand.name]));
  const rows = result.rows.map(row => ({ ...row, product: toProductDTO(row.product, role) }));
  return (
    <>
      <PageHeader
        title={t('products.title')}
        count={t('products.resultsSummary', { count: result.totalCount, low: result.lowCount, out: result.outCount })}
        action={role !== 'STAFF' ? <ButtonLink href="/products/new">{t('products.add')}</ButtonLink> : undefined}
      />

      <ProductRegister
        confirmedFilters={confirmedFilters}
        categories={categories.filter(category => category.isActive || result.categoryIds.includes(category.id) || category.id === query.category).map(({ id, name, isActive }) => ({ id, name: isActive ? name : `${name} (${t('catalog.removed')})` }))}
        brands={brands.filter(brand => brand.isActive || result.brandIds.includes(brand.id) || brand.id === query.brand).map(({ id, name, isActive }) => ({ id, name: isActive ? name : `${name} (${t('catalog.removed')})` }))}
        showCosts={showCosts}
        resultVersion={crypto.randomUUID()}
        meta={{ page: result.page, pageSize, pageCount: result.pageCount, totalCount: result.totalCount }}
      >
          {rows.length === 0 ? (
            <EmptyState
              title={t(result.catalogCount === 0 ? 'products.empty' : 'products.noFilterMatch')}
              action={role !== 'STAFF' && result.catalogCount === 0 ? <ButtonLink href="/products/new" variant="ghost">{t('products.add')}</ButtonLink> : undefined}
            />
          ) : (
            <TableViewport>
              <table className="w-full min-w-[48rem]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-rule">
                    <th className="eyebrow px-4 py-2.5 text-left">
                      <HelpTerm description={t('term.productCodeHelp')} placement="bottom" align="start">{t('term.productCode')}</HelpTerm>
                    </th>
                    <th className="eyebrow px-4 py-2.5 text-left">{t('common.product')}</th>
                    <th className="eyebrow px-4 py-2.5 text-left">
                      <HelpTerm description={t('term.trackingHelp')} placement="bottom">{t('term.trackingMethod')}</HelpTerm>
                    </th>
                    <th className="eyebrow px-4 py-2.5 text-right">{t('products.onHand')}</th>
                    {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('products.defaultCost')}</th>}
                    <th className="eyebrow px-4 py-2.5 text-right">{t('products.defaultPrice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ product, onHand }) => {
                    const level = stockLevel(onHand, product.reorderPoint);
                    const stripe = level === 'out' ? 'border-l-2 border-l-out' : level === 'low' ? 'border-l-2 border-l-low' : 'border-l-2 border-l-transparent';
                    return (
                      <tr key={product.id} className={`group border-b border-rule-soft last:border-0 hover:bg-plate/50 ${stripe}`}>
                        <td className="px-4 py-2.5">
                          <Link href={`/products/${product.id}`} className="tnum text-[12px] text-graphite group-hover:text-signal">{product.sku}</Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/products/${product.id}`} className="block">
                            <span className="text-[13px] font-medium">{product.name}</span> {!product.isActive && <Badge>{t('products.archived')}</Badge>}
                            <span className="mt-0.5 block text-[11px] text-graphite">
                              {[brandName.get(product.brandId ?? ''), categoryName.get(product.categoryId) ?? t('products.uncategorised')].filter(Boolean).join(' · ')}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={product.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                            {product.trackingType === 'SERIAL' ? t('term.serial') : t('term.bulkCount')}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right"><StockCount onHand={onHand} reorderPoint={product.reorderPoint} /></td>
                        {showCosts && <td className="px-4 py-2.5 text-right"><Money value={product.defaultCostPrice ?? null} muted /></td>}
                        <td className="px-4 py-2.5 text-right"><Money value={product.defaultSalePrice} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableViewport>
          )}
      </ProductRegister>
    </>
  );
}
