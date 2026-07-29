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
  const { role } = await requireRole('ADMIN', 'MANAGER', 'STAFF');
  const { serial } = await searchParams;

  const products = await db.products.findAll({ activeOnly: true });
  const bulk = products.filter((p) => p.trackingType === 'QUANTITY');

  return (
    <>
      <PageHeader
        title="Inventory removal"
        count="Damage, loss, internal use, or return to supplier · all sales go through Checkout"
      />
      <StockOutForm
        bulkProducts={bulk.map((product) => toProductDTO(product, role))}
        initialSerial={serial}
      />
    </>
  );
}
