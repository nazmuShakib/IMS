import { expect, it } from 'vitest';
import { expenseDisplayDate, expenseDateKey, expenseUrl, parseExpenseQuery, parseExpenseAmount, MAX_EXPENSE_PAISA } from '@/lib/expense-query';
import { expenseFieldsSchema } from '@/schemas';

it.each(['2025-02-29', '2026-02-30', '2026-04-31', '0000-01-01', '2026-13-01', 'today'])('rejects impossible expense/filter date %s', date => {
  expect(() => parseExpenseQuery({ from: date })).toThrow();
  expect(expenseFieldsSchema.safeParse({ expenseDate: date, categoryId: 'rent', description: 'Rent', amount: '12', paidTo: '', paymentMethod: 'CASH', reference: '', note: '' }).success).toBe(false);
});
it('normalizes blank, repeated, leap, open and future ranges without introducing dates', () => {
  expect(parseExpenseQuery({})).toMatchObject({ from: undefined, to: undefined, page: 1, pageSize: 25 });
  expect(parseExpenseQuery({ format: 'csv', irrelevant: 'value' })).toEqual(parseExpenseQuery({}));
  expect(parseExpenseQuery({ from: [' 2024-02-29 ', 'invalid'], to: ' ', query: [' rent ', 'other'] })).toMatchObject({ from: '2024-02-29', to: undefined, query: 'rent' });
  expect(parseExpenseQuery({ to: '2030-01-01' }).from).toBeUndefined();
  expect(() => parseExpenseQuery({ from: '2026-09-10', to: '2026-09-09' })).toThrow();
});
it.each(['12abc', '-1', '1,2', '1.001', 'NaN', '21474836.48'])('rejects malformed or out-of-range money %s', amount => expect(() => parseExpenseQuery({ minAmount: amount })).toThrow());
it('preserves paisa, zero filter values, supported comma formats and database bounds', () => {
  expect(parseExpenseAmount('৳ 12,500.25')).toBe(1250025);
  expect(parseExpenseAmount('1,25,000.25')).toBe(12500025);
  expect(parseExpenseAmount('21474836.47')).toBe(MAX_EXPENSE_PAISA);
  expect(parseExpenseQuery({ minAmount: '0', maxAmount: '0' })).toMatchObject({ minAmount: 0, maxAmount: 0 });
  expect(() => parseExpenseQuery({ minAmount: '100', maxAmount: '10' })).toThrow();
});
it('formats full stored instants in Dhaka and preserves date-only values at month boundaries', () => {
  expect(expenseDateKey('2026-09-09T18:00:00.000Z')).toBe('2026-09-10');
  expect(expenseDisplayDate('2026-09-09T18:00:00.000Z')).toBe(expenseDisplayDate('2026-09-10'));
  expect(expenseDateKey('2026-08-31T18:00:00.000Z')).toBe('2026-09-01');
  expect(expenseDisplayDate('2026-09-10', 'bn')).toContain('১০');
});
it('canonical URLs retain money and filters but exclude pages from exports', () => {
  const query = parseExpenseQuery({ page: '999', pageSize: '100', minAmount: '12.50', groupBy: 'category', query: ' rent ' });
  expect(expenseUrl(query)).toContain('page=999');
  expect(expenseUrl(query, false)).toBe('/expenses?query=rent&minAmount=12.5&groupBy=category');
  expect(parseExpenseQuery({ page: '-1', pageSize: '2000' })).toMatchObject({ page: 1, pageSize: 25 });
});
