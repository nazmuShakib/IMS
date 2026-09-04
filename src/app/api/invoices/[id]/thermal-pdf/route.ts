import { NextResponse } from 'next/server';

import { invoiceToThermalPdf } from '@/lib/invoice-pdf';
import { hasPermission } from '@/lib/permissions';
import { getOptionalSession } from '@/lib/session';
import { db } from '@/repositories';
import { bundledInvoiceLogoDataUri } from '@/lib/server-shop-branding';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOptionalSession();
  if (!session) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!hasPermission(session.role, 'VIEW_INVOICES')) return NextResponse.json({ error: 'Invoice access denied' }, { status: 403 });

  const width: 58 | 80 = new URL(request.url).searchParams.get('width') === '58' ? 58 : 80;
  const { id } = await params;
  const sale = await db.sales.findById(id);
  if (!sale) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const [items, emiContract, settlements] = await Promise.all([
    db.sales.findItems(sale.id),
    db.emi.findContractBySale(sale.id),
    db.saleSettlements.findBySale(sale.id),
  ]);
  const [installments, earlySettlement] = emiContract
    ? await Promise.all([db.emi.findInstallments(emiContract.id), db.emi.findEarlySettlement(emiContract.id)])
    : [[], null];
  const content = await invoiceToThermalPdf(sale, items, {
    name: process.env.SHOP_NAME?.trim() || 'Irfan Gadget & Mobile',
    logoDataUri: process.env.SHOP_LOGO_DATA_URI?.trim() || await bundledInvoiceLogoDataUri(),
    address: process.env.SHOP_ADDRESS?.trim() || null,
    phone: process.env.SHOP_PHONE?.trim() || null,
    policy: process.env.INVOICE_POLICY?.trim() || null,
  }, emiContract ? { contract: emiContract, installments, earlySettlement } : null, width, settlements);

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sale.invoiceNumber}-${width}mm.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
