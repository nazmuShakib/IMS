import { describe, expect, it, vi, afterEach } from 'vitest';
import type { EmiContract, EmiInstallment, EmiPayment, EmiEarlySettlement } from '@/domain/types';
import { emiInvoiceSummary, emiScheduleRows, isSettlementReceipt, emiScheduleDate } from '@/lib/emi-presentation';
import { settleEmiEarly } from '@/services/emi';
import { db, type Repositories } from '@/repositories';

const contract = { id: '0198b410-0000-7000-8000-000000000001', termMonths: 6, financedAmount: 1800000, emiTotal: 1900000, downPayment: 100000, tradeInCredit: 0, status: 'PAID' } as EmiContract;
const settlement = { contractId: contract.id, outstandingBefore: 1000000, discountAmount: 50000, finalAmount: 950000, reason: 'Customer paid early', approvedAt: '2026-09-04T12:14:00.000Z' } as EmiEarlySettlement;
const installments = Array.from({ length: 6 }, (_, index) => ({ id: `i${index}`, sequence: index + 1, amountDue: index === 5 ? 250000 : 300000, amountPaid: index === 5 ? 250000 : 300000, status: 'PAID', dueDate: '2026-10-01T12:00:00.000Z' })) as EmiInstallment[];
const payment = { id: 'closing', contractId: contract.id, amount: 950000, status: 'ACTIVE', paidAt: settlement.approvedAt, recordedById: 'actor', paymentMethod: 'CASH', reference: null } as EmiPayment;
const payments = [{ ...payment, id: 'prior', amount: 800000 }, payment];

afterEach(() => vi.restoreAllMocks());

describe('EMI presentation and settlement', () => {
  it('reconciles the settled invoice without counting reversed receipts', () => {
    const summary = emiInvoiceSummary({ contract, installments, earlySettlement: settlement, payments: [...payments, { ...payment, id: 'reversed', status: 'REVERSED' }] });
    expect(summary.paid).toBe(1750000);
    expect(summary.outstanding).toBe(0);
    expect(summary.rows.find((row) => row.label === 'Early-settlement discount')?.amount).toBe(50000);
    expect(summary.rows.filter((row) => row.deduction).reduce((sum, row) => sum + row.amount, summary.outstanding)).toBe(contract.emiTotal);
    expect(emiScheduleRows(contract, installments, settlement)[5]).toMatchObject({ originalAmount: 300000, amountDue: 250000, discount: 50000 });
  });

  it('explains discounts spanning rows and refuses to invent legacy adjustments', () => {
    const rows = installments.map((row, index) => ({ ...row, amountDue: index === 5 ? 0 : index === 4 ? 250000 : 300000 }));
    expect(emiScheduleRows(contract, rows, { ...settlement, discountAmount: 350000 }).map((row) => row.discount)).toEqual([0, 0, 0, 0, 50000, 300000]);
    expect(emiScheduleRows(contract, rows, settlement).every((row) => row.discount === 0)).toBe(true);
  });

  it('keeps voided invoices free of live payment and discount deductions', () => {
    const summary = emiInvoiceSummary({ contract, installments, payments, earlySettlement: settlement }, true);
    expect(summary.rows.map((row) => row.label)).toEqual(['EMI total', 'Outstanding']);
    expect(summary.settlement).toBeNull();
  });

  it('matches only the closing receipt and formats dates in Dhaka', () => {
    expect(isSettlementReceipt(payment, settlement)).toBe(true);
    expect(isSettlementReceipt({ ...payment, amount: 1 }, settlement)).toBe(false);
    expect(isSettlementReceipt({ ...payment, contractId: 'other' }, settlement)).toBe(false);
    expect(emiScheduleDate('2026-09-30T18:00:00.000Z')).toBe('01 Oct 2026');
  });

  const input = { contractId: contract.id, discountAmount: 50000, paymentMethod: 'CASH' as const, reason: settlement.reason, reference: null, idempotencyKey: 'settlement-request', actorId: 'actor', actorName: 'Manager' };

  it.each(['', 0])('rejects a zero or blank discount (%s)', async (discountAmount) => {
    await expect(settleEmiEarly({ ...input, discountAmount })).rejects.toThrow('greater than zero');
  });

  it('returns the original receipt on replay without changing records or auditing again', async () => {
    const tx = { emi: { findPaymentByIdempotencyKey: vi.fn(async () => payment), findEarlySettlement: vi.fn(async () => settlement), findContractById: vi.fn() }, auditLogs: { create: vi.fn() } };
    vi.spyOn(db, 'transaction').mockImplementation(async (fn) => fn(tx as unknown as Repositories));
    expect(await settleEmiEarly(input)).toEqual({ payment, settlement, replayed: true });
    expect(tx.emi.findContractById).not.toHaveBeenCalled();
    expect(tx.auditLogs.create).not.toHaveBeenCalled();
    await expect(settleEmiEarly({ ...input, contractId: '0198b410-0000-7000-8000-000000000002' })).rejects.toThrow('different EMI payment');
  });

  it('allocates the closing payment and writes the settlement audit in the same transaction', async () => {
    const rows = installments.map((row, i) => ({ ...row, amountDue: 300000, amountPaid: i < 2 ? 300000 : i === 2 ? 200000 : 0 }));
    const tx = { emi: { findPaymentByIdempotencyKey: vi.fn(async () => null), findContractById: vi.fn(async () => ({ ...contract, status: 'ACTIVE' })), findEarlySettlement: vi.fn(async () => null), findInstallments: vi.fn(async () => rows), createEarlySettlement: vi.fn(async (value) => value), updateInstallment: vi.fn(), nextReceiptNumber: vi.fn(async () => 'RCPT-TEST'), createPayment: vi.fn(), createAllocation: vi.fn(), updateContract: vi.fn() }, auditLogs: { create: vi.fn() } };
    vi.spyOn(db, 'transaction').mockImplementation(async (fn) => fn(tx as unknown as Repositories));
    const result = await settleEmiEarly(input);
    expect(result.payment.amount).toBe(950000);
    expect(result.settlement.outstandingBefore).toBe(1000000);
    expect(result.replayed).toBe(false);
    expect(tx.emi.createAllocation.mock.calls.reduce((sum, [allocation]) => sum + allocation.amount, 0)).toBe(950000);
    expect(tx.auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ discountAmount: 50000, finalAmount: 950000, receiptNumber: 'RCPT-TEST' }) }));
  });
});
