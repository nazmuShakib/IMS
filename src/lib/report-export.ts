import type { TabularExport } from './tabular-export';
import Papa from 'papaparse';
import type { Locale } from '@/lib/i18n/config';
import { localizeReport, presentCell } from './report-presentation';
import type { ReportCell, ReportColumn, ReportResult } from '@/lib/report-query';
export function formatReportCell(
  value: ReportCell,
  column: ReportColumn,
  locale: Locale = 'en',
): string {
  return presentCell(value, column, locale);
}
export function reportExportMatrix(
  report: ReportResult | TabularExport,
  locale: Locale = 'en',
): { headers: string[]; rows: string[][] } {
  const localized = report.kind ? localizeReport(report, locale) : report;
  return {
    headers: localized.columns.map((c) => c.label),
    rows: report.rows.map((r) =>
      localized.columns.map((c) => presentCell(r.cells[c.key] ?? null, c, locale)),
    ),
  };
}
export function reportToCsv(report: ReportResult | TabularExport, locale: Locale = 'en'): string {
  const localized = report.kind ? localizeReport(report, locale) : report;
  return Papa.unparse(
    {
      fields: localized.columns.map((c) => c.label),
      data: report.rows.map((r) =>
        localized.columns.map((c) => {
          const value = r.cells[c.key] ?? null;
          if (value === null) return '';
          if (c.type === 'money') return Number(value) / 100;
          if (c.type === 'number' || c.type === 'percent') return Number(value);
          return presentCell(value, c, locale);
        }),
      ),
    },
    { escapeFormulae: true },
  );
}
