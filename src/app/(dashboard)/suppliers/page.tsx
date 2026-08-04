import { db } from '@/repositories';
import { createSupplier } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { SupplierRegister } from '@/components/suppliers/SupplierRegister';
import { PageHeader } from '@/components/ui';
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

      <SupplierRegister suppliers={suppliers} canManage={role !== 'STAFF'} />
    </>
  );
}
