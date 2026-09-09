import { randomUUID } from 'node:crypto';
import { db } from '@/repositories';
import { createCategory } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { TaxonomyManager } from '@/components/catalog/TaxonomyManager';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { createTranslator } from '@/lib/i18n/messages';
import { taxonomyQuery } from '@/lib/catalog-taxonomy';
import { type RawParams } from '@/lib/catalog-query';
export const dynamic = 'force-dynamic';
export default async function CategoriesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { role, locale } = await getSession(); const t = createTranslator(locale);
  const query = taxonomyQuery(await searchParams);
  const result = await db.categories.findPage(query);
  const { page, pageSize, ...confirmedFilters } = query;
  const canManage = hasPermission(role, 'MANAGE_CATALOG');
  return <div className="mx-auto w-full max-w-5xl">
    <PageHeader title={t('nav.categories')} count={t('taxonomy.matchingCount', { count: result.totalCount, total: result.catalogCount })} />
    {canManage && <div className="mb-4"><QuickCreateForm action={createCategory} taxonomyKind="category" submitLabel={t('catalog.addCategory')} fields={[{ name: 'name', label: t('common.name'), placeholder: t('taxonomy.categoryExample'), required: true }]} /></div>}
    <TaxonomyManager kind="category" canManage={canManage} items={result.rows} confirmedFilters={confirmedFilters} meta={result} catalogCount={result.catalogCount} resultVersion={randomUUID()} />
  </div>;
}
