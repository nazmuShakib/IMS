import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { canSeeCosts, getSession } from '@/lib/session';
import { toProductDTO, toProductUnitDTO } from '@/lib/dto';
import { unitQuery, type RawParams } from '@/lib/catalog-query';
import { ArchiveProductControl } from '@/components/catalog/ArchiveProductControl';
import { restoreProduct } from '@/actions/catalog';
import { SerializedUnitRegister } from '@/components/catalog/SerializedUnitRegister';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Money,
  PageHeader,
  StockCount,
} from '@/components/ui';
import { createTranslator } from '@/lib/i18n/messages';
import { formatBDT } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RawParams> }) {
  const { id } = await params;
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);

  const raw = await db.products.findById(id);
  if (!raw) notFound();

  const product = toProductDTO(raw, role);
  const query = unitQuery(await searchParams, id, showCosts);
  const { page: requestedPage, pageSize, productId, unit, ...confirmedFilters } = query;
  const [category, brand, result] = await Promise.all([
    db.categories.findById(raw.categoryId),
    raw.brandId ? db.brands.findById(raw.brandId) : Promise.resolve(null),
    raw.trackingType === 'SERIAL' ? db.units.findPage(query) : Promise.resolve(null),
  ]);
  const units = result?.rows.map(u => toProductUnitDTO(u, role)) ?? [];
  const onHand = result?.inStock ?? raw.quantityOnHand;
  const stockValue = showCosts ? (result?.stockValue ?? onHand * raw.avgCostPrice) : null;

  return (
    <>
      <Link href="/products" className="mb-3 inline-block text-[13px] text-signal hover:underline">← {t('products.back')}</Link>
      <PageHeader
        title={product.name}
        count={product.sku}
        action={
          <div className="flex flex-wrap gap-2">
            {product.isActive && (
              <ButtonLink href={`/stock/in?product=${product.id}`}>{t('stock.receiveTitle')}</ButtonLink>
            )}
            {role !== 'STAFF' && (
              <ButtonLink href={`/products/${product.id}/edit`} variant="ghost">{t('common.edit')}</ButtonLink>
            )}
            {role === 'ADMIN' && (product.isActive ? (
              <ArchiveProductControl productId={product.id} />
            ) : (
              <form action={restoreProduct}>
                <input type="hidden" name="id" value={product.id} />
                <Button variant="ghost" type="submit">
                  {t('products.restore')}
                </Button>
              </form>
            ))}
          </div>
        }
      />

      {!product.isActive && (
        <div className="mb-4 rounded-[3px] border border-low/20 bg-low-wash px-3 py-2 text-[13px] text-low">
          {t('products.archivedHelp')}
        </div>
      )}

      {/* --- Summary plate ------------------------------------------------ */}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 divide-rule sm:grid-cols-4 sm:divide-x">
          <div className="p-4">
            <dt className="eyebrow">{t('products.onHand')}</dt>
            <dd className="mt-1">
              <StockCount onHand={onHand} reorderPoint={product.reorderPoint} />
              <span className="mt-0.5 block text-[11px] text-graphite">
                {t('products.reorderAt', { count: product.reorderPoint })}
              </span>
            </dd>
          </div>

          <div className="p-4">
            <dt className="eyebrow">{t('products.defaultPrice')}</dt>
            <dd className="mt-1">
              <Money value={product.defaultSalePrice} />
            </dd>
          </div>

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">{t('products.defaultCost')}</dt>
              <dd className="mt-1">
                <Money value={product.defaultCostPrice ?? null} muted />
              </dd>
            </div>
          )}

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">{t('products.stockValue')}</dt>
              <dd className="mt-1">
                <Money value={stockValue} />
                <span className="mt-0.5 block text-[11px] text-graphite">
                  {t(raw.trackingType === 'SERIAL' ? 'products.sumUnitCosts' : 'products.weightedAverage')}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="eyebrow mb-3">{t('products.details')}</p>
          <dl className="space-y-2 text-[13px]">
            {[
              [t('common.brand'), brand?.name ?? '—'],
              [t('common.category'), category?.name ?? '—'],
              [t('products.model'), raw.model ?? '—'],
              [t('common.barcode'), raw.barcode ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-graphite">{k}</dt>
                <dd className={k === t('products.model') || k === t('common.barcode') ? 'tnum' : ''}>{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">{t('products.tracking')}</dt>
              <dd>
                <Badge tone={raw.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                  {raw.trackingType === 'SERIAL' ? t('term.serial') : t('term.bulkCount')}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-rule-soft pt-2">
              <dt className="text-graphite">{t('products.staffMaxDiscount')}</dt>
              <dd className="text-right">
                <Money value={raw.staffMaxDiscount} />
                <span className="mt-0.5 block text-[11px] text-graphite">
                  {t('products.staffMinimumPrice')}: {formatBDT(Math.max(0, raw.defaultSalePrice - raw.staffMaxDiscount))}
                </span>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <p className="eyebrow mb-3">{t('common.description')}</p>
          <p className="text-[13px] leading-relaxed text-graphite">
            {raw.description || t('products.noDescription')}
          </p>
        </Card>
      </div>

      {/* --- The unit ledger: every physical device, individually ---------- */}
      {result && (
        <SerializedUnitRegister
          units={units}
          productId={product.id}
          showCosts={showCosts}
          locale={locale}
          canManageUsedDevices={role !== 'STAFF'}
          usedDetails={showCosts ? result.usedDetails : []}
          productActive={product.isActive}
          confirmedFilters={confirmedFilters}
          meta={{ page: result.page, pageSize, pageCount: result.pageCount, totalCount: result.totalCount }}
          unitCount={result.unitCount}
          inStock={result.inStock}
          targetStatus={result.targetStatus}
          targetUnit={unit}
          resultVersion={crypto.randomUUID()}
        />
      )}
    </>
  );
}
