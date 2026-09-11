import type { TabularExport } from './tabular-export';
import path from 'node:path';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { reportExportMatrix } from '@/lib/report-export';
import {
  localizeReport,
  presentCell,
  reportDate,
  summaryColumn,
  summaryValue,
} from './report-presentation';
import { reportText } from './report-copy';
import { type ReportResult } from './report-query';
import { summaryKeys } from './report-results';
import type { Locale } from './i18n/config';
for (const family of ['NotoSans', 'NotoSansBengali'])
  Font.register({
    family,
    fonts: [
      {
        src: path.join(process.cwd(), `public/fonts/reports/${family}-Regular.ttf`),
        fontWeight: 400,
      },
      { src: path.join(process.cwd(), `public/fonts/reports/${family}-Bold.ttf`), fontWeight: 700 },
    ],
  });
Font.registerHyphenationCallback((word) => [word]);
const styles = StyleSheet.create({
  page: {
    padding: 26,
    paddingBottom: 38,
    fontFamily: ['NotoSans', 'NotoSansBengali'],
    fontSize: 8,
    color: '#14181d',
  },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 8, color: '#626c76', marginBottom: 8 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d5dade' },
  header: { backgroundColor: '#e9ecee', fontWeight: 700 },
  cell: { flex: 1, paddingVertical: 5, paddingHorizontal: 3 },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 26,
    right: 26,
    fontSize: 7,
    color: '#626c76',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  note: { marginTop: 8, color: '#626c76', fontSize: 7 },
  summary: { marginBottom: 10, fontSize: 9 },
});
function ReportDocument({ report, locale }: { report: ReportResult | TabularExport; locale: Locale }) {
  const localized = report.kind ? localizeReport(report, locale) : report,
    matrix = reportExportMatrix(report, locale);
  const context = report.filterContext ?? [];
  return (
    <Document title={localized.title} author="Irfan Gadget & Mobile IMS">
      <Page
        size="A4"
        orientation={matrix.headers.length > 6 ? 'landscape' : 'portrait'}
        style={styles.page}
        wrap
      >
        <Text style={styles.title}>{localized.title}</Text>
        <Text style={styles.subtitle}>{localized.description}</Text>
        {(report.filters || report.filterContext) && (
          <Text style={styles.subtitle}>
            {reportText(locale, 'filters')}:{' '}
            {context.length
              ? context.map(({ label, value }) => `${label}: ${value}`).join(' · ')
              : reportText(locale, 'allData')}
          </Text>
        )}
        {report.filters && (
          <Text style={styles.subtitle}>
            {reportText(
              locale,
              ['valuation', 'aging'].includes(report.kind)
                ? 'current'
                : ['sales', 'profit'].includes(report.kind)
                  ? 'actual'
                  : 'recorded',
            )}
          </Text>
        )}
        <Text style={styles.summary}>
          {!report.kind ? report.summaryItems.map(item => `${item.label}: ${item.value}`).join(' · ') : (report.filters ? summaryKeys(report.kind) : Object.keys(report.totals))
            .map((k) => {
              const c = summaryColumn(k, report, locale);
              return `${c.label}: ${presentCell(summaryValue(report, k), c, locale)}`;
            })
            .join(' · ')}
        </Text>
        <View style={[styles.row, styles.header]} fixed>
          {matrix.headers.map((h, i) => (
            <Text key={i} style={styles.cell}>
              {h}
            </Text>
          ))}
        </View>
        {matrix.rows.map((row, i) => (
          <View key={i} style={styles.row} wrap={false}>
            {row.map((cell, j) => (
              <Text key={j} style={styles.cell}>
                {cell || '—'}
              </Text>
            ))}
          </View>
        ))}
        {localized.note && <Text style={styles.note}>{localized.note}</Text>}
        <View style={styles.footer} fixed>
          <Text>{reportDate(report.generatedAt, locale)} · Asia/Dhaka</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${reportText(locale, 'page')} ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
export async function reportToPdf(report: ReportResult | TabularExport, locale: Locale = 'en'): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} locale={locale} />);
}
