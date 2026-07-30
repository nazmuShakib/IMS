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
    expect(encoded.modules.startsWith('0000000000')).toBe(true);
    expect(encoded.modules.endsWith('0000000000')).toBe(true);
    expect(isCode128Value('IMEI-123')).toBe(true);
    expect(isCode128Value('পণ্য')).toBe(false);
    expect(() => encodeCode128('পণ্য')).toThrow(/printable ASCII/);
  });
});

describe('Phase 7.5 stock-label invariants', () => {
  it('does not create label storage or stock movements when printing', () => {
    const action = source('src/actions/labels.ts');
    expect(action).toContain("action: 'label.print'");
    expect(action).not.toContain('movements.record');
    expect(action).not.toContain('transitionStatus');
    expect(source('prisma/schema.prisma')).not.toContain('model StockLabel');
  });

  it('enforces in-stock-only STAFF printing at the server boundary', () => {
    const permissions = source('src/lib/permissions.ts');
    const action = source('src/actions/labels.ts');
    expect(permissions).toContain("PRINT_LABELS: ['ADMIN', 'MANAGER', 'STAFF']");
    expect(permissions).toContain("REPRINT_NON_STOCK_LABELS: ['ADMIN', 'MANAGER']");
    expect(action).toContain("status !== 'IN_STOCK'");
    expect(action).toContain('product.quantityOnHand <= 0');
  });

  it('uses existing identifiers and exact physical print dimensions', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    const css = source('src/app/globals.css');
    expect(studio).toContain('serialNo ?? product.barcode ?? product.sku');
    expect(css).toContain('width: 50mm');
    expect(css).toContain('height: 25mm');
    expect(css).toContain('@page label-thermal');
    expect(css).toContain('@page label-a4');
  });

  it('connects stock receipt and scanner workflows to label printing', () => {
    expect(source('src/components/stock/StockInForm.tsx')).toContain('state.labelReceiptId');
    expect(source('src/components/labels/StockLabelStudio.tsx')).toContain('ScannerInput');
    expect(source('src/components/shell/NavigationLinks.tsx')).toContain("href: '/stock/labels'");
  });

  it('shows immediate feedback while label and filtered route data load', () => {
    const studio = source('src/components/labels/StockLabelStudio.tsx');
    expect(studio).toContain('useTransition');
    expect(studio).toContain('Loading product labels…');
    expect(studio).toContain('Searching inventory…');
    expect(studio).toContain('<LoadingScreen');
    expect(studio).toContain('setSelectedProductId(productId)');
    expect(studio).toContain('value={selectedProductId}');
    expect(studio).toContain('window.history.pushState');
    expect(studio).toContain('router.refresh()');
    expect(studio).toContain('setNavigating(true)');
    expect(source('src/app/(dashboard)/stock/labels/error.tsx')).toContain('Try again');
    expect(source('src/app/(dashboard)/stock/labels/loading.tsx')).toContain('Loading stock labels…');
    expect(source('src/app/(dashboard)/stock/in/loading.tsx')).toContain('Loading stock receipt…');
    expect(source('src/app/(dashboard)/stock/out/loading.tsx')).toContain('Loading inventory removal…');
    expect(source('src/app/(dashboard)/stock/reconcile/loading.tsx')).toContain('Loading reconciliation…');
    expect(source('src/components/invoices/InvoiceRegister.tsx')).toContain('Filtering invoices…');
    expect(source('src/app/(dashboard)/loading.tsx')).toContain('Loading dashboard…');
  });
});
