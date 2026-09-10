// Read-only validation through the application's configured repository and Neon adapter.
import { getReport, REPORT_KINDS } from '../../src/services/reports';
for (const report of REPORT_KINDS) {
  const result = await getReport({ report, page: 1, pageSize: 25 });
  console.log(
    JSON.stringify({ report, rows: result.rows.length, totalCount: result.totalCount, ok: true }),
  );
}
