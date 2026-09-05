import { notFound } from 'next/navigation';

import { InvoiceView } from '@/components/invoices/InvoiceView';
import { requirePageCapability } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { db } from '@/repositories';
import { assertVoidPermission } from '@/services/sales';
import { printableShop } from '@/lib/server-shop-branding';

export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageCapability('VIEW_INVOICES');
  const { id } = await params;
  const sale = await db.sales.findById(id);
  if (!sale) notFound();
  const items = await db.sales.findItems(sale.id);
  const settlements = await db.saleSettlements.findBySale(sale.id);
  const emiContract = await db.emi.findContractBySale(sale.id);
  const [emiInstallments, emiEarlySettlement, emiPayments] = emiContract
    ? await Promise.all([
        db.emi.findInstallments(emiContract.id),
        db.emi.findEarlySettlement(emiContract.id),
        db.emi.findPayments(emiContract.id),
      ])
    : [[], null, []];
  let canVoid = sale.status === 'COMPLETED';
  if (canVoid) {
    try {
      assertVoidPermission(sale, actor);
    } catch {
      canVoid = false;
    }
  }
  if (emiPayments.some((payment) => payment.status === 'ACTIVE')) canVoid = false;

  return (
    <InvoiceView
      sale={sale}
      items={items}
      settlements={settlements}
      canVoid={canVoid}
      canCollectPayment={hasPermission(actor.role, 'RECORD_INVOICE_PAYMENT')}
      emi={emiContract ? { contract: emiContract, installments: emiInstallments, earlySettlement: emiEarlySettlement, payments: emiPayments } : null}
      shop={await printableShop()}
    />
  );
}
