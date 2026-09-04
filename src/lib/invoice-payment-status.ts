import { emiOutstanding, type EmiDisplayStatus } from '@/lib/emi-summary';
import type { PaymentStatus, SaleStatus } from '@/domain/types';

export interface InvoiceEmiPaymentState {
  status: EmiDisplayStatus;
  downPayment: number;
  tradeInCredit: number;
  installmentAmountPaid: number;
}

export function regularInvoiceAmountDue(sale: {
  status: SaleStatus;
  total: number;
  tradeInCredit: number;
  amountPaid?: number | null;
}): number {
  if (sale.status === 'VOIDED') return 0;
  const collectible = Math.max(0, sale.total - sale.tradeInCredit);
  return Math.max(0, collectible - (sale.amountPaid ?? 0));
}

export function emiInvoiceAmountDue(
  sale: { status: SaleStatus },
  installments: Array<{ amountDue: number; amountPaid: number }>,
): number {
  return sale.status === 'VOIDED' ? 0 : emiOutstanding(installments);
}

/**
 * Returns the payment state that the invoice register should filter by.
 * A voided invoice has no outstanding payment obligation, so it is neither
 * paid, partially paid, nor unpaid.
 */
export function effectiveInvoicePaymentStatus(
  sale: { status: SaleStatus; paymentStatus: PaymentStatus },
  emi?: InvoiceEmiPaymentState,
): PaymentStatus | null {
  if (sale.status === 'VOIDED' || emi?.status === 'VOIDED') return null;
  if (!emi) return sale.paymentStatus;
  if (emi.status === 'PAID' || emi.status === 'SETTLED_EARLY') return 'PAID';

  const upfrontCredit = emi.downPayment + emi.tradeInCredit;
  return upfrontCredit + emi.installmentAmountPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
}
