import type { ExpenseCategory, OperatingExpense } from '@/domain/types';
export const expenseCategories: ExpenseCategory[] = [
  { id: 'rent', name: 'ভাড়া / Rent', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: 'old', name: 'Old category', isActive: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
];
export function expenseFixture(patch: Partial<OperatingExpense> = {}): OperatingExpense {
  return { id: 'e1', expenseNumber: 'EXP-2026-00001', expenseDate: '2026-09-09T18:00:00.000Z', categoryId: 'rent', description: 'Shop rent / দোকান ভাড়া', amount: 125025, paidTo: 'Landlord', paymentMethod: 'CASH', reference: null, note: 'Keep this note', status: 'ACTIVE', recordedById: 'user1', updatedById: 'user1', voidedById: null, voidedAt: null, voidReason: null, createdAt: '2026-09-10T06:00:00.000Z', updatedAt: '2026-09-10T06:00:00.000Z', ...patch };
}
export function expenseFixtures(count = 2125): OperatingExpense[] {
  return Array.from({ length: count }, (_, i) => expenseFixture({ id: `e${String(i).padStart(5, '0')}`, expenseNumber: `EXP-2026-${String(i).padStart(5, '0')}`, amount: (i % 10 + 1) * 100, categoryId: i % 3 === 0 ? 'old' : 'rent', status: i % 5 === 0 ? 'VOIDED' : 'ACTIVE', paymentMethod: i % 2 ? 'CASH' : 'MOBILE_BANKING' }));
}
