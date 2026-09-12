import { db } from '@/repositories';
import { formatBDT } from '@/lib/money';

async function main() {
  const { rows: drifts, valuation } = await db.reconciliation.check();
  if (drifts.length === 0 && valuation && valuation.rows.length === 0) {
    console.log('Reconciliation OK: stock quantities and inventory valuation match.');
    return;
  }

  if (drifts.length) console.error(`Quantity reconciliation failed for ${drifts.length} product(s):`);
  for (const drift of drifts) {
    console.error(
      `${drift.sku}: on-hand=${drift.onHand}, ledger=${drift.ledgerSum}, drift=${drift.drift}`,
    );
  }
  if (!valuation) console.error('Valuation could not be verified.');
  for (const row of valuation?.rows ?? []) {
    console.error(`${row.sku}: recorded value=${formatBDT(row.recordedValue)}, expected value=${row.expectedValue === null ? 'unverified' : formatBDT(row.expectedValue)}, difference=${row.difference === null ? 'unverified' : formatBDT(row.difference)}${row.issue ? ` (${row.issue})` : ''}${row.units.length ? `; ${row.units.length} unit difference(s)` : ''}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
