'use client';

import type { EmiContract, EmiEarlySettlement, EmiInstallment } from '@/domain/types';
import { Badge, Card, TableViewport } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
import { emiScheduleRows } from '@/lib/emi-presentation';
import { formatBDT } from '@/lib/money';
import { formatDhakaDate } from '@/lib/time';

export function InstallmentSchedule({ contract, installments, settlement }: { contract: EmiContract; installments: EmiInstallment[]; settlement: EmiEarlySettlement | null }) {
  const { t } = useI18n();
  const rows = emiScheduleRows(contract, installments, settlement);
  const next = contract.status === 'ACTIVE' || contract.status === 'OVERDUE' ? rows.find((row) => row.amountDue > row.amountPaid)?.id : null;
  const status = (row: EmiInstallment) => <Badge tone={row.status === 'PAID' ? 'ok' : row.status === 'OVERDUE' || row.status === 'VOIDED' ? 'out' : row.status === 'UPCOMING' ? 'neutral' : 'low'}>{t(`emi.status.${row.status.toLowerCase()}` as 'emi.status.paid')}</Badge>;
  const adjustment = (row: typeof rows[number]) => row.discount > 0 ? <span className="mt-1 block text-[11px] font-normal text-graphite">{t('emi.rowDiscount', { original: formatBDT(row.originalAmount), discount: formatBDT(row.discount) })}</span> : null;
  return <Card className="!rounded-xl overflow-hidden">
    <div className="border-b border-rule px-4 py-4"><h2 className="font-semibold">{t(settlement ? 'emi.adjustedSchedule' : 'emi.schedule')}</h2>{settlement && <p className="mt-1 text-[12px] text-graphite">{t('emi.scheduleAdjustedForDiscount', { discount: formatBDT(settlement.discountAmount) })}</p>}</div>
    <div className="divide-y divide-rule-soft md:hidden">{rows.map((row) => <article key={row.id} className={`p-4 ${row.id === next ? 'bg-signal/5' : ''}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="font-medium">#{row.sequence} · {formatDhakaDate(row.dueDate)}</p>{row.id === next && <p className="mt-1 text-[11px] font-medium text-signal">{t('emi.nextPayment')}</p>}</div>{status(row)}</div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-[12px]">{[['emi.amount', row.amountDue], ['emi.paid', row.amountPaid], ['emi.balance', contract.status === 'VOIDED' ? 0 : row.amountDue - row.amountPaid]].map(([label, value]) => <div key={label}><dt className="text-graphite">{t(label as 'emi.amount')}</dt><dd className="tnum mt-1 font-semibold">{formatBDT(Number(value))}</dd></div>)}</dl>{adjustment(row)}
    </article>)}</div>
    <TableViewport className="hidden md:block"><table className="w-full text-[13px]"><thead className="sticky top-0 bg-card"><tr className="border-b border-rule">{['emi.installment', 'emi.dueDate', 'emi.amount', 'emi.paid', 'emi.balance', 'common.status'].map((key, index) => <th key={key} className={`eyebrow px-4 py-3 ${index < 2 ? 'text-left' : 'text-right'}`}>{t(key as 'emi.amount')}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`border-b border-rule-soft last:border-0 ${row.id === next ? 'bg-signal/5' : 'hover:bg-plate/40'}`}><td className="px-4 py-3 font-medium">#{row.sequence}{row.id === next && <span className="mt-1 block text-[11px] text-signal">{t('emi.nextPayment')}</span>}</td><td className="px-4 py-3 whitespace-nowrap">{formatDhakaDate(row.dueDate)}</td><td className="tnum px-4 py-3 text-right">{formatBDT(row.amountDue)}{adjustment(row)}</td><td className="tnum px-4 py-3 text-right">{formatBDT(row.amountPaid)}</td><td className="tnum px-4 py-3 text-right font-semibold">{formatBDT(contract.status === 'VOIDED' ? 0 : row.amountDue - row.amountPaid)}</td><td className="px-4 py-3 text-right">{status(row)}</td></tr>)}</tbody></table></TableViewport>
  </Card>;
}
