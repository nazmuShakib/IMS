import { db } from '@/repositories';
import { createBrand } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const { role } = await getSession();
  const [brands, products] = await Promise.all([
    db.brands.findAll(),
    db.products.findAll({ activeOnly: true }),
  ]);

  const count = (id: string) => products.filter((p) => p.brandId === id).length;

  return (
    <>
      <PageHeader title="Brands" count={`${brands.length} brands`} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createBrand}
          submitLabel="Add brand"
          fields={[{ name: 'name', label: 'Name', placeholder: 'Samsung', required: true }]}
        />
      </div>}

      <Card>
        {brands.length === 0 ? (
          <EmptyState title="No brands yet. Brands are optional on a product, but they make reports far more useful." />
        ) : (
          <ul>
            {brands.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between border-b border-rule-soft px-4 py-2.5 last:border-0"
              >
                <span className="text-[13px] font-medium">{b.name}</span>
                <span className="tnum text-[12px] text-graphite">
                  {count(b.id)} {count(b.id) === 1 ? 'product' : 'products'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
