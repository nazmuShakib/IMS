import type { Product, StockMovement } from '@/domain/types';
import { weightedAvgCost } from '@/lib/money';

export const movementOrder = (a: Pick<StockMovement, 'createdAt' | 'id'>, b: Pick<StockMovement, 'createdAt' | 'id'>) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Replay effective history without rewriting recorded movement economics. */
export function bulkCorrectionState(product: Pick<Product, 'quantityOnHand' | 'avgCostPrice'>, original: StockMovement, history: StockMovement[]) {
  const byId = new Map(history.map(row => [row.id, row]));
  const reversed = new Set<string>();
  for (const row of history.filter(row => row.reason === 'CORRECTION')) {
    const target = row.reversesId ? byId.get(row.reversesId) : undefined;
    if (!target || target.reason === 'CORRECTION' || target.quantity !== -row.quantity || reversed.has(target.id)) throw new Error('ledger.inconsistentHistory');
    reversed.add(target.id);
  }
  const effective = history.filter(row => row.reason !== 'CORRECTION' && !reversed.has(row.id)).sort(movementOrder);
  // Receipts can be corrected independently of later receipts. Outbound undo
  // still follows the existing reverse-order policy of its owning workflow.
  if (original.quantity < 0 && effective.at(-1)?.id !== original.id) throw new Error('ledger.laterActivity');
  const replay = (rows: StockMovement[], proposed = false) => {
    let quantity = 0, average = 0;
    for (const row of rows) {
      if (row.unitId || !Number.isSafeInteger(row.quantity) || row.quantity === 0 || !Number.isSafeInteger(row.unitCost) || row.unitCost < 0) throw new Error('ledger.inconsistentHistory');
      if (row.quantity > 0) {
        if (!Number.isSafeInteger(quantity * average + row.quantity * row.unitCost)) throw new Error('ledger.inconsistentHistory');
        average = weightedAvgCost(quantity, average, row.quantity, row.unitCost);
      } else {
        if (quantity + row.quantity < 0) throw new Error(proposed ? 'ledger.receiptInUse' : 'ledger.inconsistentHistory');
        if (row.unitCost !== average) throw new Error(proposed ? 'ledger.receiptCostDependency' : 'ledger.inconsistentHistory');
      }
      quantity += row.quantity;
      if (!Number.isSafeInteger(quantity) || quantity < 0 || !Number.isSafeInteger(average)) throw new Error('ledger.inconsistentHistory');
    }
    return { quantity, average: quantity === 0 ? 0 : average };
  };
  const current = replay(effective);
  if (current.quantity !== product.quantityOnHand || history.reduce((sum, row) => sum + row.quantity, 0) !== current.quantity || (current.quantity > 0 && current.average !== product.avgCostPrice)) throw new Error('ledger.inconsistentHistory');
  if (original.quantity > product.quantityOnHand) throw new Error('ledger.receiptInUse');
  // Recompute the remaining receipt basis using integer-paisa rounding. Never
  // rewrite historical sales, their COGS, or already-recorded movement costs.
  return replay(effective.filter(row => row.id !== original.id), true);
}
