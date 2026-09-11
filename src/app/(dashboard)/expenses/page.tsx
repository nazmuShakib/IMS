import { ExpenseWorkspace } from '@/components/expenses/ExpenseWorkspace';
import { getSession, requirePageCapability } from '@/lib/session';
import { db } from '@/repositories';
import { ExpenseQueryError, parseExpenseQuery, summarizeExpenses, type ExpensePage } from '@/lib/expense-query';
import { one, type RawParams } from '@/lib/catalog-query';
export const dynamic = 'force-dynamic';
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePageCapability('VIEW_EXPENSES');
  const { role } = await getSession(), raw = await searchParams;
  let query = parseExpenseQuery({}), initialErrors: Record<string, string> = {};
  try { query = parseExpenseQuery(raw); } catch (error) { if (error instanceof ExpenseQueryError) { initialErrors = error.details; query = parseExpenseQuery({ page: raw.page, pageSize: raw.pageSize, order: raw.order, groupBy: raw.groupBy }); } else throw error; }
  const invalid = Object.keys(initialErrors).length > 0;
  const empty: ExpensePage = { ...query, rows: [], totalCount: 0, pageCount: 1, summary: summarizeExpenses([], []) };
  const [categories, result, users] = await Promise.all([db.expenseCategories.findAll(), invalid ? Promise.resolve(empty) : db.operatingExpenses.findPage(query), db.users.findAll()]);
  return <ExpenseWorkspace role={role} query={query} result={result} categories={categories} users={users.map(({ id, name }) => ({ id, name }))} initialErrors={initialErrors} invalidValues={invalid ? Object.fromEntries(Object.keys(raw).map(key => [key, one(raw, key)])) : undefined} />;
}
