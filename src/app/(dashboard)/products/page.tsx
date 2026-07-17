import Link from 'next/link';
import { db } from '@/repositories';
import { getSession, canSeeCosts } from '@/lib/session';
import { toProductDTO } from '@/lib/dto';
import { getOnHand } from '@/services/stock';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  StockCount,
  TableViewport,
  stockLevel,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const { q, archived } = await searchParams;
  const { role } = await getSession();
  const showCosts = canSeeCosts(role);
  const showArchived = archived === '1';

  const [categories, brands] = await Promise.all([
    db.categories.findAll(),
    db.brands.findAll(),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));

  const raw = q
    ? await db.products.search(q, 50)
    : await db.products.findAll({ activeOnly: !showArchived });

  // On-hand is computed differently per tracking type — never read a stock column.
  const rows = await Promise.all(
    raw.map(async (p) => ({
      product: toProductDTO(p, role),
      onHand: await getOnHand(p),
    })),
  );

  const lowCount = rows.filter(
    (r) => stockLevel(r.onHand, r.product.reorderPoint) !== 'ok',
  ).length;

  return (
    <>
      <PageHeader
        title="Products"
        count={
          q
            ? `${rows.length} matching "${q}"`
            : `${rows.length} products · ${lowCount} need attention`
        }
        action={
          role !== 'STAFF' ? (
            <Link href="/products/new">
              <Button>Add product</Button>
            </Link>
          ) : undefined
        }
      />

      {q && (
        <p className="mb-3 text-[12px] text-graphite">
          Showing search results.{' '}
          <Link href="/products" className="text-signal underline underline-offset-2">
            Clear
          </Link>
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={
              q
                ? `Nothing matches "${q}". Try a SKU, a model number, or part of the name.`
                : 'No products yet. Add the first one, or run `npm run seed` for demo stock.'
            }
            action={
              !q && role !== 'STAFF' && (
                <Link href="/products/new">
                  <Button variant="ghost">Add product</Button>
                </Link>
              )
            }
          />
        ) : (
          <TableViewport>
            <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">SKU</th>
                <th className="eyebrow px-4 py-2.5 text-left">Product</th>
                <th className="eyebrow px-4 py-2.5 text-left">Tracking</th>
                <th className="eyebrow px-4 py-2.5 text-right">On hand</th>
                {showCosts && <th className="eyebrow px-4 py-2.5 text-right">Cost</th>}
                <th className="eyebrow px-4 py-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product: p, onHand }) => {
                const level = stockLevel(onHand, p.reorderPoint);
                const stripe =
                  level === 'out'
                    ? 'border-l-2 border-l-out'
                    : level === 'low'
                      ? 'border-l-2 border-l-low'
                      : 'border-l-2 border-l-transparent';

                return (
                  <tr
                    key={p.id}
                    className={`group border-b border-rule-soft last:border-0 hover:bg-plate/50 ${stripe} ${
                      !p.isActive ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/products/${p.id}`}
                        className="tnum text-[12px] text-graphite group-hover:text-signal"
                      >
                        {p.sku}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${p.id}`} className="block">
                        <span className="text-[13px] font-medium">{p.name}</span>
                        <span className="mt-0.5 block text-[11px] text-graphite">
                          {brandName.get(p.brandId ?? '') ?? '—'} ·{' '}
                          {catName.get(p.categoryId) ?? 'Uncategorised'}
                          {!p.isActive && ' · archived'}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={p.trackingType === 'SERIAL' ? 'signal' : 'neutral'}>
                        {p.trackingType === 'SERIAL' ? 'Serial' : 'Bulk'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StockCount onHand={onHand} reorderPoint={p.reorderPoint} />
                    </td>
                    {showCosts && (
                      <td className="px-4 py-2.5 text-right">
                        <Money value={p.defaultCostPrice ?? null} muted />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      <Money value={p.defaultSalePrice} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </TableViewport>
        )}
      </Card>

      {!q && (
        <p className="mt-3 text-[12px] text-graphite">
          <Link
            href={showArchived ? '/products' : '/products?archived=1'}
            className="underline underline-offset-2 hover:text-ink"
          >
            {showArchived ? 'Hide archived products' : 'Show archived products'}
          </Link>
        </p>
      )}
    </>
  );
}
