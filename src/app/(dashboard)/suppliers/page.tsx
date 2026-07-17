import { db } from '@/repositories';
import { createSupplier } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { Card, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const suppliers = await db.suppliers.findAll();

  return (
    <>
      <PageHeader
        title="Suppliers"
        count={`${suppliers.length} suppliers · purchase orders are Phase 7`}
      />

      <div className="mb-4">
        <QuickCreateForm
          action={createSupplier}
          submitLabel="Add supplier"
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Dhaka Electronics Importers', required: true },
            { name: 'phone', label: 'Phone', placeholder: '+8801700000000' },
            { name: 'email', label: 'Email', type: 'email', placeholder: 'sales@example.com' },
            { name: 'address', label: 'Address', placeholder: 'Motijheel, Dhaka' },
          ]}
        />
      </div>

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet. Each unit you receive records who it came from — worth setting up before Phase 2." />
        ) : (
          <ul>
            {suppliers.map((s) => (
              <li key={s.id} className="border-b border-rule-soft px-4 py-3 last:border-0">
                <p className="text-[13px] font-medium">{s.name}</p>
                <p className="mt-0.5 text-[12px] text-graphite">
                  <span className="tnum">{s.phone ?? '—'}</span>
                  {s.email && <> · {s.email}</>}
                  {s.address && <> · {s.address}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
