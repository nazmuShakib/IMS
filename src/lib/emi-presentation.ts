import type { EmiContract, EmiEarlySettlement, EmiInstallment, EmiPayment } from '@/domain/types';

export interface EmiInvoiceData {
  contract: EmiContract;
  installments: EmiInstallment[];
  payments: EmiPayment[];
  earlySettlement: EmiEarlySettlement | null;
}

export function isSettlementReceipt(payment: EmiPayment, settlement: EmiEarlySettlement | null): boolean {
  return Boolean(settlement && payment.contractId === settlement.contractId
    && payment.paidAt === settlement.approvedAt && payment.amount === settlement.finalAmount);
}

export function emiScheduleRows(contract: EmiContract, installments: EmiInstallment[], settlement: EmiEarlySettlement | null) {
  const rows = [...installments].sort((a, b) => a.sequence - b.sequence);
  const taka = contract.financedAmount / 100;
  const base = Math.floor(taka / contract.termMonths);
  const remainder = taka - base * contract.termMonths;
  const annotated = rows.map((row, index) => {
    const originalAmount = (base + (index < remainder ? 1 : 0)) * 100;
    return { ...row, originalAmount, discount: originalAmount - row.amountDue };
  });
  const valid = Boolean(settlement && Number.isInteger(taka) && rows.length === contract.termMonths
    && annotated.every((row, index) => row.sequence === index + 1 && row.discount >= 0)
    && annotated.reduce((sum, row) => sum + row.discount, 0) === settlement.discountAmount);
  return annotated.map((row) => ({ ...row, originalAmount: valid ? row.originalAmount : row.amountDue, discount: valid ? row.discount : 0 }));
}

export function emiInvoiceSummary(emi: EmiInvoiceData, voided = false) {
  const paid = emi.payments.filter((payment) => payment.status === 'ACTIVE').reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = voided ? 0 : emi.installments.reduce((sum, row) => sum + Math.max(0, row.amountDue - row.amountPaid), 0);
  const rows = [
    { label: 'EMI total', amount: emi.contract.emiTotal, deduction: false },
    ...(!voided ? [
      { label: 'Down payment', amount: emi.contract.downPayment, deduction: true },
      { label: 'Trade-in credit', amount: emi.contract.tradeInCredit, deduction: true },
      { label: 'Installment payments received', amount: paid, deduction: true },
      { label: 'Early-settlement discount', amount: emi.earlySettlement?.discountAmount ?? 0, deduction: true },
    ].filter((row) => row.amount > 0) : []),
    { label: 'Outstanding', amount: outstanding, deduction: false },
  ];
  return { rows, paid, outstanding, settlement: voided ? null : emi.earlySettlement };
}

export function emiScheduleDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}
