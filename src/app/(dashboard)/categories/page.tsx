import { db } from '@/repositories';
import { createCategory } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const { role, locale } = await getSession();
  const t = createTranslator(locale);
  const [categories, products] = await Promise.all([
    db.categories.findAll(),
    db.products.findAll({ activeOnly: true }),
  ]);

  const count = (id: string) => products.filter((p) => p.categoryId === id).length;

  return (
    <>
      <PageHeader title={t('nav.categories')} count={t('catalog.categoryCount', { count: categories.length })} />

      {role !== 'STAFF' && <div className="mb-4">
        <QuickCreateForm
          action={createCategory}
          submitLabel={t('catalog.addCategory')}
          fields={[{ name: 'name', label: t('common.name'), placeholder: 'Mobile Phones', required: true }]}
        />
      </div>}

      <Card>
        {categories.length === 0 ? (
          <EmptyState title={t('catalog.noCategories')} />
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
                  {t('catalog.productCount', {
                    count: count(c.id),
                    kind: t(count(c.id) === 1 ? 'catalog.productSingle' : 'catalog.productPlural'),
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
