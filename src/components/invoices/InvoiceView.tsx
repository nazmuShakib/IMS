'use client';

import { useActionState, useEffect, useState } from 'react';

import { recordInvoicePrintAction } from '@/actions/checkout';
import { Button } from '@/components/ui';
import type { InvoiceItem, Sale } from '@/domain/types';
import { formatBDT } from '@/lib/money';

export interface InvoiceShop {
  name: string;
  address: string | null;
  phone: string | null;
  policy: string | null;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-BD', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function InvoiceView({
  sale,
  items,
  shop,
}: {
  sale: Sale;
  items: InvoiceItem[];
  shop: InvoiceShop;
}) {
  const [layout, setLayout] = useState<'a4' | 'thermal'>('a4');
  const [state, action, pending] = useActionState(recordInvoicePrintAction, {});

  useEffect(() => {
    if (state.printNonce) window.print();
  }, [state.printNonce]);

  return (
    <div className="invoice-root" data-layout={layout}>
      <div className="invoice-screen-controls print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-rule bg-card p-3">
          <div>
            <p className="text-[13px] font-medium">Invoice layout</p>
            <p className="text-[11px] text-graphite">Reprints use the original completed-sale snapshot.</p>
          </div>
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="saleId" value={sale.id} />
            <select
              name="layout"
              value={layout}
              onChange={(event) => setLayout(event.target.value as 'a4' | 'thermal')}
              className="h-9 rounded-[3px] border border-rule bg-card px-2.5 text-[13px]"
            >
              <option value="a4">A4 invoice</option>
              <option value="thermal">80 mm thermal</option>
            </select>
            <Button type="submit" disabled={pending}>
              {pending ? 'Preparing…' : 'Print'}
            </Button>
            <a
              href={`/api/invoices/${sale.id}/pdf`}
              className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3.5 text-[13px] font-medium"
            >
              Download PDF
            </a>
          </form>
        </div>
        {state.error && <p className="mb-3 text-[12px] text-out">{state.error}</p>}
      </div>

      <div className="invoice-preview-viewport" tabIndex={0} aria-label="Scrollable invoice preview">
        <article className="invoice-document">
          <header className="invoice-header">
            <div>
              <h1>{shop.name}</h1>
              {shop.address && <p>{shop.address}</p>}
              {shop.phone && <p>{shop.phone}</p>}
            </div>
            <div className="invoice-title">
              <strong>INVOICE</strong>
              <span className="tnum">{sale.invoiceNumber}</span>
            </div>
          </header>

          <section className="invoice-meta">
            <div>
              <span>Customer</span>
              <strong>{sale.customerName ?? 'Walk-in customer'}</strong>
              {sale.customerPhone && <p>{sale.customerPhone}</p>}
            </div>
            <div>
              <span>Date</span>
              <strong>{dateTime(sale.completedAt)}</strong>
              <p>Served by {sale.actorName}</p>
              {sale.reference && <p>Ref: {sale.reference}</p>}
            </div>
          </section>

          <table className="invoice-items">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.productName}</strong>
                    <span className="tnum">{item.sku}{item.serialNo ? ` · S/N ${item.serialNo}` : ''}</span>
                    {item.warrantyMonths ? <span>{item.warrantyMonths} month warranty</span> : null}
                  </td>
                  <td className="tnum">{item.quantity}</td>
                  <td className="tnum">{formatBDT(item.actualUnitPrice)}</td>
                  <td className="tnum">{formatBDT(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="invoice-summary">
            <dl>
              <div><dt>List subtotal</dt><dd className="tnum">{formatBDT(sale.subtotal)}</dd></div>
              {sale.discount !== 0 && (
                <div><dt>Price adjustment</dt><dd className="tnum">{formatBDT(sale.discount)}</dd></div>
              )}
              <div className="invoice-total"><dt>Total</dt><dd className="tnum">{formatBDT(sale.total)}</dd></div>
            </dl>
          </section>

          <section className="invoice-payment">
            <p><span>Payment:</span> {sale.paymentMethod.replaceAll('_', ' ')} · {sale.paymentStatus}</p>
            {sale.note && <p><span>Note:</span> {sale.note}</p>}
          </section>

          <footer>
            {shop.policy && <p>{shop.policy}</p>}
            <p>This is an ordinary sales invoice, not a VAT/tax invoice.</p>
          </footer>
        </article>
      </div>
    </div>
  );
}
