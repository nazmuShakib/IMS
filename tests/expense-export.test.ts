import { beforeEach, expect, it, vi } from 'vitest';
import Papa from 'papaparse';
import { expenseCategories, expenseFixture, expenseFixtures } from './expense-fixtures';
import { expenseExport } from '@/lib/expense-export';
import { expenseDisplayDate, parseExpenseQuery } from '@/lib/expense-query';
import { reportToCsv } from '@/lib/report-export';
const mocks = vi.hoisted(() => ({ session: vi.fn(), rows: vi.fn(), categories: vi.fn(), actors: vi.fn(), pdf: vi.fn() }));
vi.mock('@/lib/session', () => ({ getOptionalSession: mocks.session, getAuthUserNames: mocks.actors }));
vi.mock('@/repositories', () => ({ db: { operatingExpenses: { findForExport: mocks.rows }, expenseCategories: { findAll: mocks.categories } } }));
vi.mock('@/lib/report-pdf', () => ({ reportToPdf: mocks.pdf }));
import { GET } from '@/app/api/expenses/export/route';
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ role: 'MANAGER', locale: 'en' }); mocks.rows.mockResolvedValue([expenseFixture()]); mocks.categories.mockResolvedValue(expenseCategories); mocks.actors.mockResolvedValue(new Map([['user1', 'Manager']])); mocks.pdf.mockResolvedValue(Buffer.from('%PDF-test')); });
it.each([[null, 401], [{ role: 'STAFF' }, 403]])('protects expense exports', async (session, status) => { mocks.session.mockResolvedValue(session); const response = await GET(new Request('http://localhost/api/expenses/export')); expect(response.status).toBe(status); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(mocks.rows).not.toHaveBeenCalled(); });
it.each(['from=2026-02-30', 'from=2026-09-10&to=2026-09-09', 'minAmount=12abc', 'minAmount=100&maxAmount=10'])('returns actionable 400 for %s', async query => { const response = await GET(new Request(`http://localhost/api/expenses/export?${query}`)); expect(response.status).toBe(400); expect((await response.json()).details).toBeTruthy(); expect(mocks.rows).not.toHaveBeenCalled(); });
it('matches page first-value semantics, fixes the exported day, and exports more than 2000 rows', async () => {
  mocks.rows.mockResolvedValue(expenseFixtures());
  const response = await GET(new Request('http://localhost/api/expenses/export?from=2026-09-10&from=invalid&page=22&format=csv'));
  expect(response.status).toBe(200); expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-10' }));
  const parsed = Papa.parse<string[]>(await response.text()); expect(parsed.data).toHaveLength(2126); expect(parsed.data[1]![1]).toBe(expenseDisplayDate('2026-09-10'));
});
it('uses localized PDF metadata with filters and summaries without pretending to be a report kind', async () => {
  mocks.session.mockResolvedValue({ role: 'ADMIN', locale: 'bn' });
  const response = await GET(new Request('http://localhost/api/expenses/export?format=pdf&categoryId=rent'));
  expect(response.status).toBe(200); const [document, locale] = mocks.pdf.mock.calls[0]!;
  expect(locale).toBe('bn'); expect(document).not.toHaveProperty('kind'); expect(document.summaryItems).toHaveLength(3); expect(document.filterContext).toContainEqual({ label: 'ব্যয়ের ক্যাটাগরি', value: 'ভাড়া / Rent' }); expect(document.rows[0].cells.date).toContain('১০');
});
it('escapes formula text while preserving numeric money cells and user names', () => {
  const document = expenseExport(parseExpenseQuery({}), [expenseFixture({ description: '=1+1', paidTo: 'বাংলা নাম', amount: -150 })], expenseCategories, new Map(), 'bn');
  const rows = Papa.parse<string[]>(reportToCsv(document, 'bn')).data;
  expect(rows[1]).toContain("'=1+1"); expect(rows[1]).toContain('বাংলা নাম'); expect(rows[1]).toContain('-1.5');
});
