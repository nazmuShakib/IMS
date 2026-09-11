// Read-only smoke check through the configured application adapter. No business data is printed.
import { db } from '../../src/repositories';
import { parseExpenseQuery } from '../../src/lib/expense-query';
import { prisma } from '../../src/lib/prisma';
try {
  const first = await db.operatingExpenses.findPage(parseExpenseQuery({}));
  const last = await db.operatingExpenses.findPage(parseExpenseQuery({ page: '999999', pageSize: '100' }));
  if (first.totalCount !== last.totalCount || JSON.stringify(first.summary) !== JSON.stringify(last.summary)) throw new Error('Expense summaries differ across pages');
  console.log(JSON.stringify({ ok: true, rows: first.rows.length, totalCount: first.totalCount, lastPage: last.page, summariesMatch: true }));
} finally { await prisma.$disconnect(); }
