'use server';

import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import type { StockCheckResult } from '@/lib/reconciliation';

export async function checkStockAction(): Promise<StockCheckResult> {
  await requireCapability('CORRECT_STOCK');
  try { return { report: await db.reconciliation.check() }; }
  catch (error) {
    console.error('Stock consistency check failed', error);
    return { error: 'consistency.failed' };
  }
}
