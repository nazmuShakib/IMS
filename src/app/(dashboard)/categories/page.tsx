import { db } from '@/repositories';
import { createCategory } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const { role } = await getSession();
  const [categories, products] = await Promise.all([
    db.categories.findAll(),
    db.products.findAll({ activeOnly: true }),
  ]);

  const count = (id: string) => products.filter((p) => p.categoryId === id).length;

  return (
    <>
      <PageHeader title="Categories" count={`${categories.length} categories`} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createCategory}
          submitLabel="Add category"
          fields={[{ name: 'name', label: 'Name', placeholder: 'Mobile Phones', required: true }]}
        />
      </div>}

      <Card>
        {categories.length === 0 ? (
          <EmptyState title="No categories yet. Add one above — a product can't exist without one." />
        ) : (
          <ul>
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between border-b border-rule-soft px-4 py-2.5 last:border-0"
              >
                <div>
                  <span className="text-[13px] font-medium">{c.name}</span>
                  <span className="tnum ml-2 text-[11px] text-graphite">{c.slug}</span>
                </div>
                <span className="tnum text-[12px] text-graphite">
                  {count(c.id)} {count(c.id) === 1 ? 'product' : 'products'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
