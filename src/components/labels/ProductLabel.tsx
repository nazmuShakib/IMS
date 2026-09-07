'use client';
import { Barcode128 } from '@/components/labels/Barcode128';
import type { PreparedLabelJob } from '@/lib/label-print';

export function ProductLabel({ product, serialNo }: { product: Pick<PreparedLabelJob['product'], 'name' | 'sku' | 'barcode'>; serialNo?: string }) {
  const barcodeValue = serialNo ?? product.barcode;
  if (!barcodeValue) return null;
  return <article className="stock-label">
    <div className="stock-label-heading"><strong className="stock-label-name">{product.name}</strong></div>
    <div className="stock-label-meta"><span className="tnum">SKU: {product.sku}</span></div>
    <div className="stock-label-bars"><Barcode128 value={barcodeValue} /></div>
    <div className="stock-label-code tnum">{serialNo ? `S/N ${serialNo}` : barcodeValue}</div>
  </article>;
}

export function LabelPrintOutput({ job }: { job: PreparedLabelJob }) {
  const items = job.product.trackingType === 'SERIAL' ? job.units : [{ id: job.product.id, serialNo: undefined }];
  const labels = items.flatMap(unit => Array.from({ length: job.copies }, (_, copy) => <ProductLabel key={`${unit.id}-${copy}`} product={job.product} serialNo={unit.serialNo} />));
  return <div className="label-print-area" aria-hidden="true">
    {job.layout === 'a4' ? Array.from({ length: Math.ceil(labels.length / 55) }, (_, page) => <div key={page} className="label-a4-sheet"><div className="label-print-grid">{labels.slice(page * 55, (page + 1) * 55)}</div></div>) : <div className="label-print-grid">{labels}</div>}
  </div>;
}
