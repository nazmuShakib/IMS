import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card, EmptyState, PageHeader, TableViewport } from '@/components/ui';
import { formatBDT } from '@/lib/money';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('MANAGE_CUSTOMERS');
  const { id } = await params;
  const customer = await db.customers.findById(id);
  if (!customer) notFound();
  const sales = await db.sales.findByCustomer(customer.id);
  const total = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <>
      <PageHeader
        title={customer.name}
        count={`${customer.phone ?? 'No phone'} · ${sales.length} purchases · ${formatBDT(total)} lifetime sales`}
        action={<Link href="/customers" className="rounded-[3px] border border-rule bg-card px-3 py-2 text-[13px]">All customers</Link>}
      />
      <Card>
        {sales.length === 0 ? <EmptyState title="This customer has no completed invoice history." /> : (
          <TableViewport>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left">
                <th className="eyebrow px-4 py-2.5">Invoice</th>
                <th className="eyebrow px-4 py-2.5">Date</th>
                <th className="eyebrow px-4 py-2.5">Payment</th>
                <th className="eyebrow px-4 py-2.5 text-right">Total</th>
              </tr></thead>
              <tbody>{sales.map((sale) => <tr key={sale.id} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-3"><Link className="tnum font-medium text-signal" href={`/invoices/${sale.id}`}>{sale.invoiceNumber}</Link></td>
                <td className="tnum px-4 py-3">{new Intl.DateTimeFormat('en-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sale.completedAt))}</td>
                <td className="px-4 py-3">{sale.paymentMethod.replaceAll('_', ' ')} · {sale.paymentStatus}</td>
                <td className="tnum px-4 py-3 text-right">{formatBDT(sale.total)}</td>
              </tr>)}</tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </>
  );
}
