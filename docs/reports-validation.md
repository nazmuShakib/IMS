# Reports refresh validation

The reports use one canonical query model (`src/lib/report-query.ts`), shared JSON calculations, and report-specific PostgreSQL aggregation. The table page is bounded independently of totals and chart aggregates. Exports request all matching rows.

## Repeatable checks

- `npm run typecheck`
- `npm test -- tests/reports.test.ts tests/reports-ui.test.tsx tests/reports-export.test.ts tests/reports-pdf.test.ts tests/phase5.test.ts tests/i18n.test.ts tests/sale-timing.test.ts tests/chart-axis.test.ts tests/phase3-security.test.ts tests/phase10-expenses.test.ts tests/phase10-supplier-analytics.test.ts`
- `node scripts/validation/report-postgres.mjs` starts and stops disposable local PostgreSQL with synthetic records. Set `POSTGRES_BIN` if PostgreSQL binaries are not under `/usr/lib/postgresql/12/bin`. This never reads application database credentials. The integration tests create their own uniquely named schema.
- `node scripts/validation/report-browser.mjs` renders the actual report components against synthetic records using a Vite fixture. Set `PLAYWRIGHT_MODULE` and `CHROME_BIN` for local browser installations. Screenshots go to a temporary directory. Checks cover seven reports, English/Bangla, 375/768/1440px, pagination draft preservation, Back/Forward, compatible report transitions, chart range, and keyboard chart data.
- `REPORT_PDF_ARTIFACTS=1 npm test -- tests/reports-pdf.test.ts` additionally uses `pdftotext` and `pdftoppm` to inspect a multipage Bengali report.

The standard targeted suite has 102 passing tests; its eleven PostgreSQL tests are intentionally skipped unless `TEST_REPORT_DATABASE_URL` is supplied by the disposable runner. The runner passes all 34 tests in `tests/reports.test.ts`, including those eleven integration tests.

Browser validation uses the actual components with a navigation adapter and fixture data; it does not authenticate against or modify live business data. Bengali PDF font embedding, visual shaping, repeating headers, and page numbers were checked. Locally bundled Noto font licensing is included in `public/fonts/reports/LICENSE.txt`.

No schema migration, new runtime dependency, or chart-library installation is required. Shared export helpers preserve custom metadata for expense and supplier-analytics exports.

## Follow-up audit: report-loading failure

The actual Next.js development log reported PostgreSQL `42P18`: “could not determine data type of parameter $1”. Summary keys passed as parameters to `jsonb_build_object` needed explicit `::text` casts with the application's Neon adapter. Native Prisma tests had supplied parameter types and masked this difference. The regression suite now prepares every report query without declared parameter types.

After the fix, read-only validation through the configured application repository and Neon adapter loaded all seven reports successfully. Only row counts were printed; no business records were changed. The checker is `node --env-file=.env.local --import tsx scripts/validation/report-live-read.ts`.

The follow-up audit also fixed redundant navigation for equivalent default URLs and preserved first/last matching activity for time-chart zero filling when boundary activity is fully corrected. Tests cover both behaviors. Query normalization, permission boundaries, source aggregation, table pagination, independent totals/charts, chart types, CSV escaping, localized PDF presentation, and shared export compatibility were reviewed against the handoff plan.

## Presentation change requested after review

Report charts are no longer mounted. All filter controls are visible without disclosure, with Apply/Reset after the fields. Separate green CSV and red PDF export buttons replace the menu. Summary cards retain compact sizing with a subtle top border and slightly rounded corners. Financial calculations, permission checks and pagination remain in place. The browser harness now verifies the chart-free layout and visible filters/direct exports.

The subsequent presentation update uses the shared `LoadingScreen` during report navigation, metric-specific tinted summary cards (negative profit/margin use red), and separately labelled product search/selection controls. The filters form a four-column row at `lg` widths and retain the two-column/single-column responsive layouts. The browser harness asserts that the first four labelled fields share the same row at desktop width.
