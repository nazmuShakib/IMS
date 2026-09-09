import { randomUUID } from 'node:crypto';
import { db } from '@/repositories';
import { createBrand } from '@/actions/catalog';
import { QuickCreateForm } from '@/components/catalog/QuickCreateForm';
import { TaxonomyManager } from '@/components/catalog/TaxonomyManager';
import { PageHeader } from '@/components/ui';
import { getSession } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { createTranslator } from '@/lib/i18n/messages';
import { taxonomyQuery } from '@/lib/catalog-taxonomy';
import { type RawParams } from '@/lib/catalog-query';
export const dynamic = 'force-dynamic';
export default async function BrandsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { role, locale } = await getSession(); const t = createTranslator(locale);
  const query = taxonomyQuery(await searchParams); query.parent = '';
  const result = await db.brands.findPage(query);
  const { page, pageSize, ...confirmedFilters } = query;
  const canManage = hasPermission(role, 'MANAGE_CATALOG');
  return <div className="mx-auto w-full max-w-5xl">
    <PageHeader title={t('nav.brands')} count={t('taxonomy.matchingCount', { count: result.totalCount, total: result.catalogCount })} />
    {canManage && <div className="mb-4"><QuickCreateForm action={createBrand} taxonomyKind="brand" submitLabel={t('catalog.addBrand')} fields={[{ name: 'name', label: t('common.name'), placeholder: t('taxonomy.brandExample'), required: true }]} /></div>}
    <TaxonomyManager kind="brand" canManage={canManage} items={result.rows} confirmedFilters={confirmedFilters} meta={result} catalogCount={result.catalogCount} resultVersion={randomUUID()} />
  </div>;
}
