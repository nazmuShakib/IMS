import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { reconcile } from '@/services/stock';
import { Card, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * PLAN.md §8.4. The cache and the ledger must always agree. If they don't, a
 * transaction boundary was missed somewhere and the ledger is the truth.
 *
 * This page exists so that "the books add up" is something you can SEE, not
 * something you hope is true.
 */
export default async function ReconcilePage() {
  await requireRole('ADMIN', 'MANAGER');
  const drifts = await reconcile();
  const healthy = drifts.length === 0;

  return (
    <>
      <PageHeader
        title="Reconciliation"
        count="On-hand vs SUM(ledger), for every product"
      />

      <Card
        className={healthy ? 'border-ok/30 bg-ok-wash' : 'border-out/30 bg-out-wash'}
      >
        <div className="p-5">
          <p className={`text-[13px] font-medium ${healthy ? 'text-ok' : 'text-out'}`}>
            {healthy
              ? 'The books add up.'
              : `${drifts.length} product${drifts.length > 1 ? 's have' : ' has'} drifted.`}
          </p>
          <p className="mt-1 text-[12px] text-graphite">
            {healthy
              ? "Every product's on-hand count equals the sum of its ledger entries. That is the invariant the whole system rests on."
              : 'A stock change was made without a matching ledger entry. The ledger is the source of truth — investigate before trusting any report.'}
          </p>
        </div>

        {!healthy && (
          <table className="w-full border-t border-out/20 bg-card">
            <thead>
              <tr className="border-b border-rule">
                <th className="eyebrow px-4 py-2.5 text-left">Product</th>
                <th className="eyebrow px-4 py-2.5 text-right">On hand</th>
                <th className="eyebrow px-4 py-2.5 text-right">Ledger says</th>
                <th className="eyebrow px-4 py-2.5 text-right">Drift</th>
              </tr>
            </thead>
            <tbody>
              {drifts.map((d) => (
                <tr key={d.productId} className="border-b border-rule-soft last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/products/${d.productId}`} className="text-[13px] hover:text-signal">
                      {d.name}
                    </Link>
                    <span className="tnum mt-0.5 block text-[11px] text-graphite">{d.sku}</span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px]">{d.onHand}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px]">{d.ledgerSum}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] font-medium text-out">
                    {d.drift > 0 ? '+' : ''}
                    {d.drift}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
