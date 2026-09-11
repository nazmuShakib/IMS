import type { ReportColumn, ReportRow } from './report-query';
/** Presentation metadata for exports outside the seven inventory reports. */
export interface TabularExport {
  kind?: never;
  filters?: never;
  title: string;
  description: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  note?: string;
  filterContext?: Array<{ label: string; value: string }>;
  summaryItems: Array<{ label: string; value: string }>;
}
