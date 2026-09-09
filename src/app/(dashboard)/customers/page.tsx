import { CustomerRegister } from '@/components/customers/CustomerRegister';
import { requirePageCapability } from '@/lib/session';
import { customerQuery } from '@/lib/customer-query';
import type { RawParams } from '@/lib/catalog-query';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';
export default async function CustomersPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  await requirePageCapability('MANAGE_CUSTOMERS');
  const query = customerQuery(await searchParams);
  const result = await db.customers.findPage(query);
  const { page, pageSize, pageCount, totalCount } = result;
  return <div className="mx-auto w-full max-w-5xl"><CustomerRegister confirmedQuery={query.q} customers={result.rows} meta={{ page, pageSize, pageCount, totalCount }} /></div>;
}
