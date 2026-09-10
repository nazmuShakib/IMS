import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { reportToPdf } from '@/lib/report-pdf';
import { calculateReport } from '@/lib/report-calculations';
import { reportFixture, reportNow } from './report-fixtures';
it('embeds Bengali-capable fonts and generates a multipage PDF with repeated headers and context', async () => {
  const ctx = reportFixture(),
    r = calculateReport(ctx, { report: 'profit' }, reportNow);
  r.filterContext = [{ label: 'পণ্য', value: 'বাংলা স্মার্টফোন' }];
  const pdf = await reportToPdf(r, 'bn');
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.toString('latin1')).toContain('NotoSansBengali');
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  if (process.env.REPORT_PDF_ARTIFACTS) {
    const dir = mkdtempSync(join(tmpdir(), 'ims-report-pdf-')),
      file = join(dir, 'report.pdf');
    writeFileSync(file, pdf);
    execFileSync('pdftotext', ['-layout', file, join(dir, 'report.txt')]);
    const text = readFileSync(join(dir, 'report.txt'), 'utf8');
    expect(text).toContain('Asia/Dhaka');
    execFileSync('pdftoppm', [
      '-f',
      '1',
      '-singlefile',
      '-scale-to',
      '1400',
      '-png',
      file,
      join(dir, 'report'),
    ]);
    console.log(`PDF artifact: ${dir}`);
  }
}, 30000);
