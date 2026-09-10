import { reportExportContext } from '@/lib/report-export-context';
import { NextResponse } from 'next/server';

import { hasPermission } from '@/lib/permissions';
import { reportToCsv } from '@/lib/report-export';
import { reportToPdf } from '@/lib/report-pdf';
import { getOptionalSession } from '@/lib/session';
import { getReport, parseReportFilters, reportRaw, ReportQueryError } from '@/services/reports';

export const dynamic = 'force-dynamic';

function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET(request: Request) {
  const session = await getOptionalSession();
  if (!session)
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!hasPermission(session.role, 'VIEW_REPORTS')) {
    return NextResponse.json(
      { error: 'Financial reports require manager access' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const raw = reportRaw(url.searchParams);
  const format = raw.format === 'pdf' ? 'pdf' : 'csv';
  let filters;
  try {
    filters = parseReportFilters(raw);
  } catch (error) {
    if (!(error instanceof ReportQueryError)) throw error;
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const report = await getReport(filters, { export: true });
  const filename = `${safeName(report.title)}-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(report.generatedAt))}.${format}`;

  if (format === 'pdf') {
    report.filterContext = await reportExportContext(filters, session.locale);
    const content = await reportToPdf(report, session.locale);
    return new Response(new Uint8Array(content), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const content = `\uFEFF${reportToCsv(report, session.locale)}`;
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
