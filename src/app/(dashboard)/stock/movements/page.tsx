import Link from 'next/link';
import { db } from '@/repositories';
import { canSeeCosts, getAuthUserNames, getSession } from '@/lib/session';
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
import { createTranslator, type MessageKey } from '@/lib/i18n/messages';
import type { Locale } from '@/lib/i18n/config';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<MovementReason, MessageKey> = {
  INITIAL_STOCK: 'reason.initialStock',
  PURCHASE: 'reason.purchase',
  CUSTOMER_RETURN: 'reason.customerReturn',
  SALE: 'reason.sale',
  RETURN_TO_SUPPLIER: 'reason.returnSupplier',
  DAMAGE: 'reason.damage',
  LOSS: 'reason.loss',
  INTERNAL_USE: 'reason.internalUse',
  WARRANTY_REPLACEMENT: 'reason.warrantyReplacement',
  CORRECTION: 'reason.correction',
  STOCK_COUNT: 'reason.stockCount',
};

const stamp = (iso: string, _locale: Locale) =>
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
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const showCosts = canSeeCosts(role);
  const canReverse = role === 'ADMIN' || role === 'MANAGER';

  const [all, products, users] = await Promise.all([
    // The ledger has no findAll — by design, reads are bounded. Epoch → now is
    // "everything", and it becomes an indexed range scan in Postgres (§6).
    db.movements.findByDateRange(new Date(0), new Date(), {
      reason: reason as MovementReason | undefined,
      productId: productFilter,
    }),
    db.products.findAll(),
    db.users.findAll(),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const actorNameById = new Map(users.map((user) => [user.id, user.name]));
  const authActorNames = await getAuthUserNames(all.map((movement) => movement.actorId));
  for (const [id, name] of authActorNames) actorNameById.set(id, name);

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
        title={t('nav.movementLedger')}
        count={t('ledger.entries', { count: all.length })}
      />

      <nav className="mb-4 flex flex-wrap gap-1.5">
        {[
          ['', t('ledger.all')],
          ['PURCHASE', t('ledger.purchases')],
          ['SALE', t('ledger.sales')],
          ['DAMAGE', t('ledger.damage')],
          ['LOSS', t('ledger.loss')],
          ['CORRECTION', t('ledger.corrections')],
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
          <EmptyState title={t('ledger.empty')} />
        ) : (
          <TableViewport>
            <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">{t('ledger.when')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('common.product')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('stock.reason')}</th>
                <th className="eyebrow px-4 py-2.5 text-right">{t('ledger.qty')}</th>
                {showCosts && <th className="eyebrow px-4 py-2.5 text-right">{t('common.cost')}</th>}
                <th className="eyebrow px-4 py-2.5 text-right">{t('common.price')}</th>
                <th className="eyebrow px-4 py-2.5 text-left">{t('ledger.by')}</th>
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
                      {stamp(m.createdAt, locale)}
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
                        {t(REASON_LABEL[m.reason])}
                      </Badge>
                      {m.note && (
                        <span className="mt-1 block max-w-56 text-[11px] text-graphite">
                          {m.note}
                        </span>
                      )}
                      {wasReversed && (
                        <span className="mt-1 block text-[11px] text-low">{t('ledger.reversed')}</span>
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
                      {m.actorId ? (actorNameById.get(m.actorId) ?? t('ledger.unknownUser')) : t('ledger.system')}
                    </td>

                    {canReverse && (
                      <td className="px-4 py-2.5 text-right">
                        {!isCorrection && !wasReversed && (
                          <ReverseButton
                            movementId={m.id}
                            label={t('ledger.movementLabel', {
                              reason: t(REASON_LABEL[m.reason]),
                              item: p?.name ?? t('ledger.item'),
                            })}
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
        {t('ledger.appendOnlyHelp')}
      </p>
    </>
  );
}
