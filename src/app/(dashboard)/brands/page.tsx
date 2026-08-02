import { db } from '@/repositories';
import { createBrand } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const [brands, products] = await Promise.all([
    db.brands.findAll(),
    db.products.findAll({ activeOnly: true }),
  ]);

  const count = (id: string) => products.filter((p) => p.brandId === id).length;

  return (
    <>
      <PageHeader title={t('nav.brands')} count={t('catalog.brandCount', { count: brands.length })} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createBrand}
          submitLabel={t('catalog.addBrand')}
          fields={[{ name: 'name', label: t('common.name'), placeholder: 'Samsung', required: true }]}
        />
      </div>}

      <Card>
        {brands.length === 0 ? (
          <EmptyState title={t('catalog.noBrands')} />
        ) : (
          <ul>
            {brands.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between border-b border-rule-soft px-4 py-2.5 last:border-0"
              >
                <span className="text-[13px] font-medium">{b.name}</span>
                <span className="tnum text-[12px] text-graphite">
                  {t('catalog.productCount', {
                    count: count(b.id),
                    kind: t(count(b.id) === 1 ? 'catalog.productSingle' : 'catalog.productPlural'),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
