import { notFound } from 'next/navigation';

import { InvoiceView } from '@/components/invoices/InvoiceView';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import { assertVoidPermission } from '@/services/sales';

export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCapability('VIEW_INVOICES');
  const { id } = await params;
  const sale = await db.sales.findById(id);
  if (!sale) notFound();
  const items = await db.sales.findItems(sale.id);
  let canVoid = sale.status === 'COMPLETED';
  if (canVoid) {
    try {
      assertVoidPermission(sale, actor);
    } catch {
      canVoid = false;
    }
  }

  return (
    <InvoiceView
      sale={sale}
      items={items}
      canVoid={canVoid}
      shop={{
        name: process.env.SHOP_NAME?.trim() || 'Electronics Shop',
        address: process.env.SHOP_ADDRESS?.trim() || null,
        phone: process.env.SHOP_PHONE?.trim() || null,
        policy: process.env.INVOICE_POLICY?.trim() || null,
      }}
    />
  );
}
