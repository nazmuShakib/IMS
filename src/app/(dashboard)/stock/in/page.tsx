import { db } from '@/repositories';
import { getSession, requireRole } from '@/lib/session';
import { toProductDTO } from '@/lib/dto';
import { StockInForm } from '@/components/stock/StockInForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StockInPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  await requireRole('ADMIN', 'MANAGER', 'STAFF');
  const { role } = await getSession();
  const { product } = await searchParams;

  const [products, suppliers] = await Promise.all([
    db.products.findAll({ activeOnly: true }),
    db.suppliers.findAll(),
  ]);

  return (
    <>
      <PageHeader
        title="Receive stock"
        count="Every unit received is written to the ledger — nothing changes stock silently"
      />
      <StockInForm
        products={products.map((item) => toProductDTO(item, role))}
        suppliers={suppliers}
        initialProductId={product}
      />
    </>
  );
}
