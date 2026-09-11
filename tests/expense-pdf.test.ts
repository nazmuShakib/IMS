import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { reportToPdf } from '@/lib/report-pdf';
import { expenseExport } from '@/lib/expense-export';
import { parseExpenseQuery } from '@/lib/expense-query';
import { expenseCategories, expenseFixtures } from './expense-fixtures';
it.each(['en', 'bn'] as const)('renders a multipage %s expense PDF with date parity, summaries and context', async locale => {
  const rows = expenseFixtures(80);
  rows[0]!.description = 'দোকান ভাড়া এবং রক্ষণাবেক্ষণ / Shop rent and maintenance. '.repeat(4);
  const document = expenseExport(parseExpenseQuery({ from: '2026-09-10', categoryId: 'rent' }), rows, expenseCategories, new Map([['user1', 'ব্যবস্থাপক / Manager']]), locale, new Date('2026-09-10T12:00:00.000Z'));
  const pdf = await reportToPdf(document, locale);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF'); expect(pdf.toString('latin1')).toContain('NotoSansBengali');
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  if (process.env.EXPENSE_PDF_ARTIFACTS) {
    const dir = mkdtempSync(join(tmpdir(), `ims-expense-pdf-${locale}-`)), file = join(dir, 'expenses.pdf');
    writeFileSync(file, pdf); execFileSync('pdftotext', ['-layout', file, join(dir, 'expenses.txt')]);
    const text = readFileSync(join(dir, 'expenses.txt'), 'utf8'); expect(text).toContain('Asia/Dhaka');
    if (locale === 'en') { expect(text).toContain('10 Sept 2026'); expect(text).not.toContain('09 Sept 2026'); expect(text).toContain('Total active expenses'); expect(text).toContain('No end date'); }
    execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1600', '-png', file, join(dir, 'expenses')]);
    console.log(`Expense PDF artifact: ${dir}`);
  }
}, 30000);
