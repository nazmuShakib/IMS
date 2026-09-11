import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/permissions';
import { reportToCsv } from '@/lib/report-export';
import { reportToPdf } from '@/lib/report-pdf';
import { getAuthUserNames, getOptionalSession } from '@/lib/session';
import { db } from '@/repositories';
import { ExpenseQueryError, parseExpenseQuery } from '@/lib/expense-query';
import { expenseExport } from '@/lib/expense-export';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  if (!hasPermission(session.role, 'VIEW_EXPENSES')) return NextResponse.json({ error: 'Operating expenses require manager access' }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  // get() consistently uses the first occurrence, as the page parser does.
  const raw = Object.fromEntries([...new Set(params.keys())].map(key => [key, params.get(key)!]));
  let query;
  try { query = parseExpenseQuery(raw); }
  catch (error) { if (error instanceof ExpenseQueryError) return NextResponse.json({ error: error.message, details: error.details }, { status: 400, headers }); throw error; }
  const format = raw.format ?? 'csv';
  if (!['csv', 'pdf'].includes(format)) return NextResponse.json({ error: 'Invalid export format' }, { status: 400, headers });
  const [expenses, categories] = await Promise.all([db.operatingExpenses.findForExport(query), db.expenseCategories.findAll()]);
  const actors = await getAuthUserNames([...expenses.map(item => item.recordedById), ...(query.recordedById ? [query.recordedById] : [])]);
  const report = expenseExport(query, expenses, categories, actors, session.locale);
  const filename = `operating-expenses-${query.from ?? 'all'}-to-${query.to ?? 'all'}.${format}`;
  if (format === 'pdf') return new Response(new Uint8Array(await reportToPdf(report, session.locale)), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` } });
  return new Response(`\uFEFF${reportToCsv(report, session.locale)}`, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
}
