'use client';
import { useI18n } from '@/components/i18n/I18nProvider';
import { stockLevel } from '@/lib/stock-level';
export function StockCount({ onHand, reorderPoint }: { onHand: number; reorderPoint: number }) {
  const { t } = useI18n();
  const level = stockLevel(onHand, reorderPoint);
  const tone = { ok: 'text-ink', low: 'text-low', out: 'text-out' }[level];
  return <span className="inline-flex items-baseline gap-1.5"><span className={`tnum text-[13px] font-medium ${tone}`}>{onHand}</span>{level !== 'ok' && <span className={`text-[11px] ${tone}`}>{t(level === 'low' ? 'catalog.low' : 'catalog.out')}</span>}</span>;
}
