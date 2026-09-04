import { describe, expect, it } from 'vitest';

import { effectiveInvoicePaymentStatus, emiInvoiceAmountDue, regularInvoiceAmountDue } from '../src/lib/invoice-payment-status';

describe('effective invoice payment status', () => {
  it('never presents a collectible balance on a voided invoice', () => {
    expect(regularInvoiceAmountDue({
      status: 'VOIDED', total: 10_000, tradeInCredit: 0, amountPaid: 2_500,
    })).toBe(0);
    expect(regularInvoiceAmountDue({
      status: 'COMPLETED', total: 10_000, tradeInCredit: 2_000, amountPaid: 2_500,
    })).toBe(5_500);
    const installments = [{ amountDue: 6_000, amountPaid: 1_000 }];
    expect(emiInvoiceAmountDue({ status: 'VOIDED' }, installments)).toBe(0);
    expect(emiInvoiceAmountDue({ status: 'COMPLETED' }, installments)).toBe(5_000);
  });

  it('does not classify voided invoices as paid or unpaid', () => {
    expect(effectiveInvoicePaymentStatus({ status: 'VOIDED', paymentStatus: 'UNPAID' })).toBeNull();
  });

  it('classifies paid and early-settled EMI invoices as paid', () => {
    const sale = { status: 'COMPLETED' as const, paymentStatus: 'UNPAID' as const };
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'PAID', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 10_000,
    })).toBe('PAID');
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'SETTLED_EARLY', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 8_000,
    })).toBe('PAID');
  });

  it('distinguishes untouched and partially paid active EMI invoices', () => {
    const sale = { status: 'COMPLETED' as const, paymentStatus: 'UNPAID' as const };
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'ACTIVE', downPayment: 0, tradeInCredit: 0, installmentAmountPaid: 0,
    })).toBe('UNPAID');
    expect(effectiveInvoicePaymentStatus(sale, {
      status: 'OVERDUE', downPayment: 1_000, tradeInCredit: 0, installmentAmountPaid: 0,
    })).toBe('PARTIALLY_PAID');
  });
});
