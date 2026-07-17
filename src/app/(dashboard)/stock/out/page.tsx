import { db } from '@/repositories';
import { toProductDTO } from '@/lib/dto';
import { requireRole } from '@/lib/session';
import { StockOutForm } from '@/components/stock/StockOutForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StockOutPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const { role } = await requireRole('ADMIN', 'MANAGER', 'STAFF'); // staff sell things
  const { serial } = await searchParams;

  const products = await db.products.findAll({ activeOnly: true });
  const bulk = products.filter((p) => p.trackingType === 'QUANTITY');

  return (
    <>
      <PageHeader
        title="Stock out"
        count="Sales, damage, loss — a sale is just a stock-out with a price"
      />
      <StockOutForm
        bulkProducts={bulk.map((product) => toProductDTO(product, role))}
        initialSerial={serial}
      />
    </>
  );
}
