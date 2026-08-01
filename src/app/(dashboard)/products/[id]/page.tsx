import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { canSeeCosts, getSession } from '@/lib/session';
import { toProductDTO, toProductUnitDTO } from '@/lib/dto';
import { getOnHand } from '@/services/stock';
import { archiveProduct, restoreProduct } from '@/actions/catalog';
import type { UnitStatus } from '@/domain/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  SerialChip,
  StockCount,
  TableViewport,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<UnitStatus, 'ok' | 'neutral' | 'out' | 'low'> = {
  IN_STOCK: 'ok',
  RESERVED: 'low',
  SOLD: 'neutral',
  RETURNED: 'low',
  DAMAGED: 'out',
  LOST: 'out',
  VOID: 'neutral', // entered in error and reversed out — not stock, not a sale
};

const dhaka = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await getSession();
  const showCosts = canSeeCosts(role);

  const raw = await db.products.findById(id);
  if (!raw) notFound();

  const product = toProductDTO(raw, role);
  const [category, brand, onHand, rawUnits] = await Promise.all([
    db.categories.findById(raw.categoryId),
    raw.brandId ? db.brands.findById(raw.brandId) : Promise.resolve(null),
    getOnHand(raw),
    raw.trackingType === 'SERIAL'
      ? db.units.findByProduct(raw.id)
      : Promise.resolve([]),
  ]);

  const units = rawUnits
    .map((u) => toProductUnitDTO(u, role))
    .sort((a, b) => {
      // In-stock first — that's what someone at the counter is looking for.
      if (a.status === 'IN_STOCK' && b.status !== 'IN_STOCK') return -1;
      if (b.status === 'IN_STOCK' && a.status !== 'IN_STOCK') return 1;
      return b.receivedAt.localeCompare(a.receivedAt);
    });

  const inStock = units.filter((u) => u.status === 'IN_STOCK');

  // Valuation is only meaningful if you can see costs.
  const stockValue = showCosts
    ? raw.trackingType === 'SERIAL'
      ? inStock.reduce((sum, u) => sum + (u.costPrice ?? 0), 0)
      : onHand * raw.avgCostPrice
    : null;

  return (
    <>
      <PageHeader
        title={product.name}
        count={product.sku}
        action={
          <div className="flex gap-2">
            {product.isActive && (
              <Link href={`/stock/in?product=${product.id}`}>
                <Button>Receive stock</Button>
              </Link>
            )}
            {role !== 'STAFF' && (
              <Link href={`/products/${product.id}/edit`}>
                <Button variant="ghost">Edit</Button>
              </Link>
            )}
            {role === 'ADMIN' && (product.isActive ? (
              <form action={archiveProduct}>
                <input type="hidden" name="id" value={product.id} />
                <Button variant="danger" type="submit">
                  Archive
                </Button>
              </form>
            ) : (
              <form action={restoreProduct}>
                <input type="hidden" name="id" value={product.id} />
                <Button variant="ghost" type="submit">
                  Restore
                </Button>
              </form>
            ))}
          </div>
        }
      />

      {!product.isActive && (
        <div className="mb-4 rounded-[3px] border border-low/20 bg-low-wash px-3 py-2 text-[13px] text-low">
          Archived. It stays here because its units and ledger history still refer to it —
          nothing is ever hard-deleted.
        </div>
      )}

      {/* --- Summary plate ------------------------------------------------ */}
      <Card className="mb-4">
        <dl className="grid grid-cols-2 divide-rule sm:grid-cols-4 sm:divide-x">
          <div className="p-4">
            <dt className="eyebrow">On hand</dt>
            <dd className="mt-1">
              <StockCount onHand={onHand} reorderPoint={product.reorderPoint} />
              <span className="mt-0.5 block text-[11px] text-graphite">
                reorder at {product.reorderPoint}
              </span>
            </dd>
          </div>

          <div className="p-4">
            <dt className="eyebrow">Selling price</dt>
            <dd className="mt-1">
              <Money value={product.defaultSalePrice} />
            </dd>
          </div>

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">Cost price</dt>
              <dd className="mt-1">
                <Money value={product.defaultCostPrice ?? null} muted />
              </dd>
            </div>
          )}

          {showCosts && (
            <div className="p-4">
              <dt className="eyebrow">Stock value</dt>
              <dd className="mt-1">
                <Money value={stockValue} />
                <span className="mt-0.5 block text-[11px] text-graphite">
                  {raw.trackingType === 'SERIAL' ? 'sum of unit costs' : 'weighted average'}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="eyebrow mb-3">Details</p>
          <dl className="space-y-2 text-[13px]">
            {[
              ['Brand', brand?.name ?? '—'],
              ['Category', category?.name ?? '—'],
              ['Model', raw.model ?? '—'],
              ['Barcode', raw.barcode ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-graphite">{k}</dt>
                <dd className={k === 'Model' || k === 'Barcode' ? 'tnum' : ''}>{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-graphite">Tracking</dt>
              <dd>
                <Badge tone={raw.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                  {raw.trackingType === 'SERIAL' ? 'Serial' : 'Bulk'}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <p className="eyebrow mb-3">Description</p>
          <p className="text-[13px] leading-relaxed text-graphite">
            {raw.description || 'No description.'}
          </p>
        </Card>
      </div>

      {/* --- The unit ledger: every physical device, individually ---------- */}
      {raw.trackingType === 'SERIAL' && (
        <Card>
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <div>
              <p className="text-[13px] font-medium">Units</p>
              <p className="tnum mt-0.5 text-[11px] text-graphite">
                {inStock.length} in stock · {units.length} total, all time
              </p>
            </div>
          </div>

          {units.length === 0 ? (
            <EmptyState
              title="No items yet. Receive stock and each phone, laptop or TV will appear here with its own device number or IMEI."
              action={
                <Link href={`/stock/in?product=${product.id}`}>
                  <Button variant="ghost">Receive stock</Button>
                </Link>
              }
            />
          ) : (
            <TableViewport>
              <table className="w-full">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-rule">
                  <th className="eyebrow px-4 py-2.5 text-left">Device number / IMEI</th>
                  <th className="eyebrow px-4 py-2.5 text-left">Status</th>
                  <th className="eyebrow px-4 py-2.5 text-left">Received</th>
                  {showCosts && <th className="eyebrow px-4 py-2.5 text-right">Cost</th>}
                  <th className="eyebrow px-4 py-2.5 text-right">Sold for</th>
                  {showCosts && <th className="eyebrow px-4 py-2.5 text-right">Profit</th>}
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  // Exact, per unit. No FIFO, no weighted average — this unit's own cost.
                  const profit =
                    showCosts && u.salePrice !== null && u.costPrice !== undefined
                      ? u.salePrice - u.costPrice
                      : null;

                  return (
                    <tr id={`unit-${u.id}`} key={u.id} className="scroll-mt-4 border-b border-rule-soft last:border-0 target:bg-signal-wash">
                      <td className="px-4 py-2.5">
                        <SerialChip serial={u.serialNo} dim={u.status !== 'IN_STOCK'} />
                        {u.status === 'IN_STOCK' && (
                          <>
                            {u.location && (
                              <span className="ml-2 text-[11px] text-graphite">{u.location}</span>
                            )}
                            <Link
                              href={`/stock/out?serial=${encodeURIComponent(u.serialNo)}`}
                              className="ml-2 text-[11px] text-signal underline underline-offset-2"
                            >
                              Sell
                            </Link>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[u.status]}>
                          {u.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="tnum px-4 py-2.5 text-[12px] text-graphite">
                        {dhaka(u.receivedAt)}
                      </td>
                      {showCosts && (
                        <td className="px-4 py-2.5 text-right">
                          <Money value={u.costPrice ?? null} muted />
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <Money value={u.salePrice} />
                      </td>
                      {showCosts && (
                        <td className="px-4 py-2.5 text-right">
                          {profit === null ? (
                            <span className="text-graphite">—</span>
                          ) : (
                            <span
                              className={`tnum text-[13px] font-medium ${
                                profit >= 0 ? 'text-ok' : 'text-out'
                              }`}
                            >
                              {profit >= 0 ? '+' : ''}
                              <Money value={profit} />
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </TableViewport>
          )}
        </Card>
      )}
    </>
  );
}
