import { db } from '@/repositories';
import { createSupplier } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { SupplierEditor } from '@/components/suppliers/SupplierEditor';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const { role } = await getSession();
  const suppliers = await db.suppliers.findAll();

  return (
    <>
      <PageHeader
        title="Suppliers"
        count={`${suppliers.length} suppliers · purchase orders are Phase 7`}
      />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createSupplier}
          submitLabel="Add supplier"
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Dhaka Electronics Importers', required: true },
            { name: 'phone', label: 'Bangladeshi mobile', type: 'tel', placeholder: '01712345678' },
            { name: 'email', label: 'Email', type: 'email', placeholder: 'sales@example.com' },
            { name: 'address', label: 'Address', placeholder: 'Motijheel, Dhaka' },
          ]}
        />
      </div>}

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="No suppliers yet. Each unit you receive records who it came from — worth setting up before Phase 2." />
        ) : (
          <ul>
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 border-b border-rule-soft px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{s.name}</p>
                  <p className="mt-0.5 break-words text-[12px] text-graphite">
                    <span className="tnum">{s.phone ?? '—'}</span>
                    {s.email && <> · {s.email}</>}
                    {s.address && <> · {s.address}</>}
                  </p>
                </div>
                {role !== 'STAFF' && <SupplierEditor supplier={s} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
