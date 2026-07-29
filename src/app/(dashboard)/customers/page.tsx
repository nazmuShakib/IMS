import Link from 'next/link';

import { CreateCustomerForm } from '@/components/customers/CreateCustomerForm';
import { Button, Card, EmptyState, Input, PageHeader, TableViewport } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCapability('MANAGE_CUSTOMERS');
  const { q = '' } = await searchParams;
  const customers = q.trim()
    ? await db.customers.search(q, 100)
    : await db.customers.findAll();
  return (
    <>
      <PageHeader
        title="Customers"
        count={`${customers.length} ${q ? 'matching' : 'reusable'} customer records`}
      />
      <Card className="mb-4 p-5">
        <p className="eyebrow mb-4">New customer</p>
        <CreateCustomerForm />
      </Card>
      <form className="mb-4 flex gap-2" method="get">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search customer name or phone"
          aria-label="Search customers"
        />
        <Button type="submit">Search</Button>
        {q && <Link href="/customers" className="inline-flex h-9 items-center rounded-[3px] border border-rule bg-card px-3 text-[13px]">Clear</Link>}
      </form>
      <Card>
        {customers.length === 0 ? <EmptyState title="No saved customers yet." /> : (
          <TableViewport>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-rule text-left">
                <th className="eyebrow px-4 py-2.5">Name</th><th className="eyebrow px-4 py-2.5">Phone</th><th className="eyebrow px-4 py-2.5"><span className="sr-only">History</span></th>
              </tr></thead>
              <tbody>{customers.map((customer) => <tr key={customer.id} className="border-b border-rule-soft last:border-0">
                <td className="px-4 py-3 font-medium"><Link href={`/customers/${customer.id}`} className="text-signal">{customer.name}</Link></td><td className="tnum px-4 py-3">{customer.phone ?? '—'}</td><td className="px-4 py-3 text-right"><Link href={`/customers/${customer.id}`} className="text-signal">Purchase history</Link></td>
              </tr>)}</tbody>
            </table>
          </TableViewport>
        )}
      </Card>
    </>
  );
}
