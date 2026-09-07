import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { code128Values, encodeCode128, isCode128Value } from '@/lib/code128';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 7.5 Code 128 labels', () => {
  it('encodes ordinary identifiers with Code Set B and a valid checksum', () => {
    expect(code128Values('AB')).toEqual([104, 33, 34, 102, 106]);
  });

  it('compacts numeric serials with Code Set C and switches for an odd final digit', () => {
    expect(code128Values('12345')).toEqual([105, 12, 34, 100, 21, 54, 106]);
  });

  it('includes quiet zones and rejects values scanners cannot reproduce', () => {
    const encoded = encodeCode128('SKU-100');
    expect(encoded.modules.startsWith('000000000')).toBe(true);
    expect(encoded.modules.endsWith('000000000')).toBe(true);
    expect(isCode128Value('IMEI-123')).toBe(true);
    expect(isCode128Value('পণ্য')).toBe(false);
    expect(() => encodeCode128('পণ্য')).toThrow(/printable ASCII/);
  });

  it('fits a 14-digit serial at exactly two 203-DPI printer dots per module', () => {
    const encoded = encodeCode128('35643104817547');
    expect(encoded.modules).toHaveLength(130);
    expect(Math.floor(304 / encoded.modules.length)).toBe(2);
  });

  it('fits a 15-digit serial at exactly two 203-DPI printer dots per module', () => {
    const encoded = encodeCode128('352386045293914');
    expect(encoded.modules).toHaveLength(152);
    expect(Math.floor(304 / encoded.modules.length)).toBe(2);
  });

  it('identifies long alphanumeric SKUs that cannot retain two-dot modules', () => {
    const encoded = encodeCode128('ANK-NANO-45W');
    expect(encoded.modules).toHaveLength(185);
    expect(Math.floor(304 / encoded.modules.length)).toBe(1);
  });
});

describe('stock receipt label integration', () => {
  it('connects stock receipt and scanner workflows to label printing', () => {
    const stockIn = source('src/components/stock/StockInForm.tsx');
    expect(stockIn).toContain('state.labelReceiptId');
    expect(stockIn).toContain('<ReceiptDialog');
    expect(source('src/components/stock/ReceiptDialog.tsx')).toContain('dialog.showModal()');
    expect(stockIn).toContain('stock.receiptTitle');
    expect(stockIn).toContain('href={receiptLabelHref}');
    expect(stockIn).toContain('`/stock/labels?product=');
    expect(stockIn).toContain('bg-signal');
    expect(stockIn).toContain('onSubmit={reviewReceipt}');
    expect(stockIn).toContain('event.preventDefault()');
    expect(stockIn).toContain('preflightStockSerials');
    expect(stockIn).toContain('startTransition(() => formAction(data))');
    expect(stockIn).toContain('busy={pending}');
    expect(stockIn).toContain("t('stock.receivingHelp')");
    expect(stockIn).toContain('animate-spin');
    expect(stockIn).toContain('onClick={confirmReceipt} disabled={pending}');
    expect(stockIn).toContain("t('stock.confirmReceiveTitle')");
    expect(stockIn).toContain("t('stock.yesReceive')");
    expect(stockIn).toContain('role="alert"');
    expect(source('src/repositories/prisma/index.ts')).toContain('async findBySerials(serialNos)');
    expect(source('src/services/stock.ts')).toContain('existing.productId !== product.id');
    expect(source('src/services/stock.ts')).toContain('totalCost: input.unitCost * count');
    expect(source('src/components/labels/StockLabelStudio.tsx')).toContain('ScannerInput');
    expect(source('src/components/shell/NavigationLinks.tsx')).toContain('href="/stock/labels"');
  });

});
