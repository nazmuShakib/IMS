export type StockLevel = 'ok' | 'low' | 'out';
export function stockLevel(onHand: number, reorderPoint: number): StockLevel {
  if (onHand <= 0) return 'out';
  return onHand <= reorderPoint ? 'low' : 'ok';
}
