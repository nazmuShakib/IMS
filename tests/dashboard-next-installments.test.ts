import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { EmiContract, EmiInstallment } from '@/domain/types';
import type { OpenEmiSchedule, Repositories } from '@/repositories';
import { getDashboardEmiSnapshot } from '@/services/dashboard';

const createdAt = '2026-01-01T00:00:00.000Z';

function contract(
  id: string,
  contractNumber: string,
  status: EmiContract['status'] = 'ACTIVE',
): EmiContract {
  return {
    id,
    contractNumber,
    saleId: `sale-${id}`,
    customerId: `customer-${id}`,
    status,
    termMonths: 6,
    normalPrice: 6_000,
    emiTotal: 6_000,
    downPayment: 0,
    tradeInCredit: 0,
    financedAmount: 6_000,
    firstDueDate: '2026-07-18T12:00:00.000Z',
    createdById: 'admin',
    createdByName: 'Admin',
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    voidedAt: null,
  };
}

function installment(
  contractId: string,
  sequence: number,
  dueDate: string,
  patch: Partial<EmiInstallment> = {},
): EmiInstallment {
  return {
    id: `${contractId}-i${sequence}`,
    contractId,
    sequence,
    dueDate,
    amountDue: 1_000,
    amountPaid: 0,
    status: 'UPCOMING',
    paidAt: null,
    createdAt,
    updatedAt: createdAt,
    ...patch,
  };
}

function schedule(
  id: string,
  contractNumber: string,
  installments: EmiInstallment[],
  status: EmiContract['status'] = 'ACTIVE',
): OpenEmiSchedule {
  return {
    contract: contract(id, contractNumber, status),
    installments,
    customer: { id: `customer-${id}`, name: `Customer ${id}`, phone: `0170000${id}` },
    sale: { id: `sale-${id}`, invoiceNumber: `INV-${id}` },
  };
}

function repositories(schedules: OpenEmiSchedule[]): Repositories {
  return {
    emi: { findOpenSchedules: vi.fn(async () => schedules) },
  } as unknown as Repositories;
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('dashboard next installments', () => {
  it('uses inclusive Dhaka starts, exclusive period ends, and deterministic ordering', async () => {
    const schedules = [
      schedule('b', 'EMI-B', [installment('b', 1, '2026-07-17T18:00:00.000Z')]),
      schedule('a', 'EMI-A', [installment('a', 1, '2026-07-17T18:00:00.000Z')]),
      schedule('tomorrow', 'EMI-TOMORROW', [installment('tomorrow', 1, '2026-07-18T18:00:00.000Z')]),
      schedule('week', 'EMI-WEEK', [installment('week', 1, '2026-07-23T17:59:59.000Z')]),
      schedule('friday', 'EMI-FRIDAY', [installment('friday', 1, '2026-07-23T18:00:00.000Z')]),
      schedule('month', 'EMI-MONTH', [installment('month', 1, '2026-07-31T17:59:59.000Z')]),
      schedule('next-month', 'EMI-NEXT', [installment('next-month', 1, '2026-07-31T18:00:00.000Z')]),
    ];

    const snapshot = await getDashboardEmiSnapshot(
      new Date('2026-07-18T06:00:00.000Z'),
      repositories(schedules),
    );

    expect(snapshot.installmentsByPeriod.day.map((row) => row.contractNumber)).toEqual(['EMI-A', 'EMI-B']);
    expect(snapshot.installmentsByPeriod.day[0]?.status).toBe('DUE');
    expect(snapshot.installmentsByPeriod.week.map((row) => row.contractNumber)).toEqual([
      'EMI-A', 'EMI-B', 'EMI-TOMORROW', 'EMI-WEEK',
    ]);
    expect(snapshot.installmentsByPeriod.month.map((row) => row.contractNumber)).toEqual([
      'EMI-A', 'EMI-B', 'EMI-TOMORROW', 'EMI-WEEK', 'EMI-FRIDAY', 'EMI-MONTH',
    ]);
  });

  it('selects the true earliest balance and does not skip an overdue installment', async () => {
    const schedules = [
      schedule('eligible', 'EMI-ELIGIBLE', [
        installment('eligible', 1, '2026-07-18T12:00:00.000Z', { amountPaid: 1_000, status: 'PAID' }),
        installment('eligible', 2, '2026-07-20T12:00:00.000Z'),
      ]),
      schedule('partial', 'EMI-PARTIAL', [
        installment('partial', 1, '2026-07-21T12:00:00.000Z', { amountPaid: 400, status: 'PARTIAL' }),
      ]),
      schedule('overdue', 'EMI-OVERDUE', [
        installment('overdue', 1, '2026-07-17T12:00:00.000Z', { status: 'OVERDUE' }),
        installment('overdue', 2, '2026-07-22T12:00:00.000Z'),
      ], 'OVERDUE'),
      schedule('voided-row', 'EMI-VOIDED-ROW', [
        installment('voided-row', 1, '2026-07-19T12:00:00.000Z', { status: 'VOIDED' }),
        installment('voided-row', 2, '2026-07-20T12:00:00.000Z'),
      ]),
      schedule('zero', 'EMI-ZERO', [
        installment('zero', 1, '2026-07-20T12:00:00.000Z', { amountPaid: 1_000 }),
      ]),
      schedule('paid-contract', 'EMI-PAID', [installment('paid-contract', 1, '2026-07-20T12:00:00.000Z')], 'PAID'),
      schedule('voided-contract', 'EMI-VOIDED', [installment('voided-contract', 1, '2026-07-20T12:00:00.000Z')], 'VOIDED'),
    ];

    const snapshot = await getDashboardEmiSnapshot(
      new Date('2026-07-18T06:00:00.000Z'),
      repositories(schedules),
    );
    const monthRows = snapshot.installmentsByPeriod.month;

    expect(monthRows.map((row) => row.contractNumber)).toEqual([
      'EMI-ELIGIBLE', 'EMI-VOIDED-ROW', 'EMI-PARTIAL',
    ]);
    expect(monthRows.find((row) => row.contractNumber === 'EMI-ELIGIBLE')?.sequence).toBe(2);
    expect(monthRows.find((row) => row.contractNumber === 'EMI-PARTIAL')).toMatchObject({
      remainingAmount: 600,
      status: 'PARTIAL',
    });
    expect(monthRows.some((row) => row.contractNumber === 'EMI-OVERDUE')).toBe(false);
    expect(snapshot.openContractCount).toBe(5);
    expect(snapshot.overdueContractCount).toBe(1);
    expect(snapshot.outstandingAmount).toBe(4_600);
  });

  it('handles month and year rollover without including the next month boundary', async () => {
    const schedules = [
      schedule('december', 'EMI-DEC', [installment('december', 1, '2026-12-31T12:00:00.000Z')]),
      schedule('january', 'EMI-JAN', [installment('january', 1, '2026-12-31T18:00:00.000Z')]),
    ];

    const snapshot = await getDashboardEmiSnapshot(
      new Date('2026-12-31T06:00:00.000Z'),
      repositories(schedules),
    );

    expect(snapshot.installmentsByPeriod.day.map((row) => row.contractNumber)).toEqual(['EMI-DEC']);
    expect(snapshot.installmentsByPeriod.month.map((row) => row.contractNumber)).toEqual(['EMI-DEC']);
  });

  it('wires a shared read model and period-aware, read-only panel into the dashboard', () => {
    const page = source('src/app/(dashboard)/page.tsx');
    const panel = source('src/components/dashboard/DashboardPeriodPanels.tsx');
    const emiService = source('src/services/emi.ts');
    const prisma = source('src/repositories/prisma/index.ts');
    const json = source('src/repositories/json/index.ts');

    expect(page).toContain("hasPermission(role, 'VIEW_EMI')");
    expect(page).toContain("{role !== 'STAFF' && emiSnapshot &&");
    expect(page.indexOf('<DashboardNextInstallments')).toBeLessThan(page.indexOf('<DashboardCharts'));
    expect(panel).toContain('useDashboardPeriod()');
    expect(panel).toContain('max-h-96');
    expect(panel).toContain('href={`/emi/${row.contractId}`}');
    expect(panel).not.toContain('fetch(');
    const refreshSource = emiService.slice(emiService.indexOf('export async function refreshEmiStatuses'));
    expect(refreshSource).toContain('findOpenSchedules()');
    expect(refreshSource).not.toContain('findContracts()');
    expect(refreshSource).not.toContain('findInstallments(');
    expect(prisma).toContain("where: { status: { in: ['ACTIVE', 'OVERDUE'] } }");
    expect(prisma).toContain("installments: { orderBy: { sequence: 'asc' } }");
    expect(json).toContain('const [contracts, installments, customerRows, saleRows] = await Promise.all([');
  });
});
