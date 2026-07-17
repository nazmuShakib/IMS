import Link from 'next/link';
import { db } from '@/repositories';
import { canSeeCosts, getSession } from '@/lib/session';
import { ReverseButton } from '@/components/stock/ReverseButton';
import {
  Badge,
  Card,
  EmptyState,
  Money,
  PageHeader,
  SerialChip,
  TableViewport,
} from '@/components/ui';
import type { MovementReason } from '@/domain/types';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<MovementReason, string> = {
  INITIAL_STOCK: 'Opening balance',
  PURCHASE: 'Purchase',
  CUSTOMER_RETURN: 'Customer return',
  SALE: 'Sale',
  RETURN_TO_SUPPLIER: 'Returned to supplier',
  DAMAGE: 'Damage',
  LOSS: 'Loss',
  INTERNAL_USE: 'Internal use',
  CORRECTION: 'Correction',
  STOCK_COUNT: 'Stock count',
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; product?: string }>;
}) {
  const { reason, product: productFilter } = await searchParams;
  const { role } = await getSession();
  const showCosts = canSeeCosts(role);
  const canReverse = role === 'ADMIN' || role === 'MANAGER';

  const [all, products, users, units] = await Promise.all([
    // The ledger has no findAll — by design, reads are bounded. Epoch → now is
    // "everything", and it becomes an indexed range scan in Postgres (§6).
    db.movements.findByDateRange(new Date(0), new Date(), {
      reason: reason as MovementReason | undefined,
      productId: productFilter,
    }),
    db.products.findAll(),
    db.users.findAll(),
    Promise.resolve([]),
  ]);

  void units;

  const productById = new Map(products.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));

  // Which entries have already been reversed? They shouldn't offer the button.
  const reversedIds = new Set(all.map((m) => m.reversesId).filter(Boolean));

  const rows = await Promise.all(
    all
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200)
      .map(async (m) => ({
        m,
        serial: m.unitId ? ((await db.units.findById(m.unitId))?.serialNo ?? null) : null,
      })),
  );

  return (
    <>
      <PageHeader
        title="Movement ledger"
        count={`${all.length} entries · append-only, nothing is ever deleted`}
      />

      <nav className="mb-4 flex flex-wrap gap-1.5">
        {[
          ['', 'All'],
          ['PURCHASE', 'Purchases'],
          ['SALE', 'Sales'],
          ['DAMAGE', 'Damage'],
          ['LOSS', 'Loss'],
          ['CORRECTION', 'Corrections'],
        ].map(([value, label]) => {
          const active = (reason ?? '') === value;
          return (
            <Link
              key={label}
              href={value ? `/stock/movements?reason=${value}` : '/stock/movements'}
              className={`rounded-[3px] border px-2.5 py-1 text-[12px] transition-colors ${
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-rule bg-card text-graphite hover:text-ink'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No movements match. Stock has to be received before it can move." />
        ) : (
          <TableViewport>
            <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">When</th>
                <th className="eyebrow px-4 py-2.5 text-left">Product</th>
                <th className="eyebrow px-4 py-2.5 text-left">Reason</th>
                <th className="eyebrow px-4 py-2.5 text-right">Qty</th>
                {showCosts && <th className="eyebrow px-4 py-2.5 text-right">Cost</th>}
                <th className="eyebrow px-4 py-2.5 text-right">Price</th>
                <th className="eyebrow px-4 py-2.5 text-left">By</th>
                {canReverse && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, serial }) => {
                const p = productById.get(m.productId);
                const inbound = m.quantity > 0;
                const isCorrection = m.reason === 'CORRECTION';
                const wasReversed = reversedIds.has(m.id);

                return (
                  <tr
                    key={m.id}
                    className={`border-b border-rule-soft last:border-0 ${
                      isCorrection ? 'bg-plate/40' : ''
                    }`}
                  >
                    <td className="tnum px-4 py-2.5 text-[12px] whitespace-nowrap text-graphite">
                      {stamp(m.createdAt)}
                    </td>

                    <td className="px-4 py-2.5">
                      {p ? (
                        <Link href={`/products/${p.id}`} className="text-[13px] hover:text-signal">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="text-[13px] text-graphite">—</span>
                      )}
                      {serial && (
                        <span className="mt-1 block">
                          <SerialChip serial={serial} dim />
                        </span>
                      )}
                      {m.reference && (
                        <span className="tnum mt-0.5 block text-[11px] text-graphite">
                          {m.reference}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          isCorrection
                            ? 'low'
                            : m.reason === 'SALE'
                              ? 'ok'
                              : inbound
                                ? 'signal'
                                : 'out'
                        }
                      >
                        {REASON_LABEL[m.reason]}
                      </Badge>
                      {m.note && (
                        <span className="mt-1 block max-w-56 text-[11px] text-graphite">
                          {m.note}
                        </span>
                      )}
                      {wasReversed && (
                        <span className="mt-1 block text-[11px] text-low">reversed</span>
                      )}
                    </td>

                    {/* The sign IS the direction. There is no separate in/out column. */}
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`tnum text-[13px] font-medium ${
                          inbound ? 'text-ok' : 'text-out'
                        }`}
                      >
                        {inbound ? '+' : ''}
                        {m.quantity}
                      </span>
                    </td>

                    {showCosts && (
                      <td className="px-4 py-2.5 text-right">
                        <Money value={m.unitCost} muted />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      <Money value={m.unitPrice} />
                    </td>

                    <td className="px-4 py-2.5 text-[12px] text-graphite">
                      {userById.get(m.actorId ?? '')?.name ?? '—'}
                    </td>

                    {canReverse && (
                      <td className="px-4 py-2.5 text-right">
                        {!isCorrection && !wasReversed && (
                          <ReverseButton
                            movementId={m.id}
                            label={`${REASON_LABEL[m.reason]} of ${p?.name ?? 'item'}`}
                          />
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

      <p className="mt-3 text-[12px] text-graphite">
        There is no edit and no delete here, on purpose. Reversing writes a new opposing entry
        and leaves the original in place — so the ledger always adds up, and you can always see
        what actually happened.
      </p>
    </>
  );
}
