import { db } from '@/repositories';
import { createSupplier } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { SupplierEditor } from '@/components/suppliers/SupplierEditor';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const suppliers = await db.suppliers.findAll();

  return (
    <>
      <PageHeader
        title={t('nav.suppliers')}
        count={t('catalog.supplierCount', { count: suppliers.length })}
      />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createSupplier}
          submitLabel={t('catalog.addSupplier')}
          fields={[
            { name: 'name', label: t('common.name'), placeholder: 'Dhaka Electronics Importers', required: true },
            { name: 'phone', label: t('customers.mobile'), type: 'tel', placeholder: '01712345678' },
            { name: 'email', label: t('common.email'), type: 'email', placeholder: 'sales@example.com' },
            { name: 'address', label: t('common.address'), placeholder: 'Motijheel, Dhaka' },
          ]}
        />
      </div>}

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title={t('catalog.noSuppliers')} />
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
