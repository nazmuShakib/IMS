import { one, pageRequest, paginate, type RawParams, type PageRequest, type PageResult } from '@/lib/catalog-query';
import type { Category, Brand, Product } from '@/domain/types';
export type TaxonomyStatusFilter = 'all' | 'active' | 'removed';
export type TaxonomyUsageFilter = 'all' | 'used' | 'unused';
export type TaxonomyOrder =
  | 'newest'
  | 'oldest'
  | 'products-desc'
  | 'products-asc'
  | 'name-asc'
  | 'name-desc';

export interface TaxonomyListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  productCount: number;
  createdAt: string;
}

export interface TaxonomyFilters {
  query: string;
  status: TaxonomyStatusFilter;
  usage: TaxonomyUsageFilter;
  order: TaxonomyOrder;
}

export function filterTaxonomyItems(
  items: readonly TaxonomyListItem[],
  filters: TaxonomyFilters,
): TaxonomyListItem[] {
  const query = filters.query.trim().toLocaleLowerCase();

  const filtered = items.filter((item) => {
    const matchesQuery = !query || `${item.name} ${item.slug}`.toLocaleLowerCase().includes(query);
    const matchesStatus =
      filters.status === 'all' ||
      (filters.status === 'active' ? item.isActive : !item.isActive);
    const matchesUsage =
      filters.usage === 'all' ||
      (filters.usage === 'used' ? item.productCount > 0 : item.productCount === 0);
    return matchesQuery && matchesStatus && matchesUsage;
  });

  // Match PostgreSQL lower(name) COLLATE "C" without host-locale ordering.
  const compareName = (a: string, b: string) => { const left = a.toLowerCase(); const right = b.toLowerCase(); return left < right ? -1 : left > right ? 1 : 0; };
  return filtered.sort((left, right) => {
    const tie = left.id.localeCompare(right.id);
    switch (filters.order) {
      case 'oldest':
        return left.createdAt.localeCompare(right.createdAt) || compareName(left.name, right.name) || tie;
      case 'products-desc':
        return right.productCount - left.productCount || compareName(left.name, right.name) || tie;
      case 'products-asc':
        return left.productCount - right.productCount || compareName(left.name, right.name) || tie;
      case 'name-asc':
        return compareName(left.name, right.name) || tie;
      case 'name-desc':
        return compareName(right.name, left.name) || tie;
      case 'newest':
      default:
        return right.createdAt.localeCompare(left.createdAt) || compareName(left.name, right.name) || tie;
    }
  });
}

export const TAXONOMY_DEFAULTS: TaxonomyFilters & { parent: string } = { query: '', status: 'active', usage: 'all', order: 'newest', parent: '' };
export interface TaxonomyQuery extends TaxonomyFilters, PageRequest { parent: string }
export interface TaxonomyPageRow extends TaxonomyListItem { activeProductCount: number; activeChildCount: number; parentId: string | null; parentName: string | null }
export interface TaxonomyPageResult extends PageResult<TaxonomyPageRow> { catalogCount: number }
export function taxonomyQuery(raw: RawParams): TaxonomyQuery {
  const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T => options.includes(one(raw, key) as T) ? one(raw, key) as T : fallback;
  return { ...pageRequest(raw), query: one(raw, 'query'), parent: one(raw, 'parent'),
    status: pick('status', ['all', 'active', 'removed'], 'active'), usage: pick('usage', ['all', 'used', 'unused'], 'all'),
    order: pick('order', ['newest', 'oldest', 'products-desc', 'products-asc', 'name-asc', 'name-desc'], 'newest') };
}
export function taxonomyPageFromRows(items: readonly (Category | Brand)[], products: readonly Product[], query: TaxonomyQuery, kind: 'category' | 'brand'): TaxonomyPageResult {
  const counts = new Map<string, { total: number; active: number }>();
  for (const product of products) { const id = kind === 'category' ? product.categoryId : product.brandId; if (!id) continue; const count = counts.get(id) ?? { total: 0, active: 0 }; count.total++; if (product.isActive) count.active++; counts.set(id, count); }
  const children = new Map<string, number>(); const names = new Map(items.map(item => [item.id, item.name]));
  for (const item of items) if ('parentId' in item && item.parentId && item.isActive) children.set(item.parentId, (children.get(item.parentId) ?? 0) + 1);
  const rows: TaxonomyPageRow[] = items.map(item => ({ id: item.id, name: item.name, slug: item.slug, isActive: item.isActive, createdAt: item.createdAt,
    productCount: counts.get(item.id)?.total ?? 0, activeProductCount: counts.get(item.id)?.active ?? 0, activeChildCount: children.get(item.id) ?? 0,
    parentId: 'parentId' in item ? item.parentId : null, parentName: 'parentId' in item && item.parentId ? names.get(item.parentId) ?? null : null }));
  const filtered = filterTaxonomyItems(rows.filter(row => !query.parent || row.parentId === query.parent), query) as TaxonomyPageRow[];
  return { ...paginate(filtered, query), catalogCount: items.length };
}
