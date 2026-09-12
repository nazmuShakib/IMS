import { requirePageRole } from '@/lib/session';
import { db } from '@/repositories';
import { StockConsistencyWorkspace } from '@/components/stock/StockConsistencyWorkspace';
import type { StockConsistencyReport } from '@/lib/reconciliation';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
  await requirePageRole('ADMIN', 'MANAGER');
  let report: StockConsistencyReport | null = null;
  try { report = await db.reconciliation.check(); }
  catch (error) { console.error('Stock consistency check failed', error); }
  return <StockConsistencyWorkspace initialReport={report} />;
}
