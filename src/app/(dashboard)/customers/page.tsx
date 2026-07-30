import { CreateCustomerForm } from '@/components/customers/CreateCustomerForm';
import { CustomerRegister } from '@/components/customers/CustomerRegister';
import { Card, PageHeader } from '@/components/ui';
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
      <CustomerRegister
        confirmedQuery={q}
        customers={customers}
        resultVersion={crypto.randomUUID()}
      />
    </>
  );
}
