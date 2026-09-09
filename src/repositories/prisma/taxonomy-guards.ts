import { Prisma, type PrismaClient } from '@prisma/client';
import { taxonomySlug } from '@/lib/taxonomy-form';
type Client = PrismaClient | Prisma.TransactionClient;
/** Shared by taxonomy writes and product assignments. The lock lasts until commit. */
export async function withCatalogLock<T>(client: Client, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73190421)`;
    return operation(tx);
  };
  return '$transaction' in client ? client.$transaction(run, { timeout: 15_000 }) : run(client);
}
export async function guardTaxonomyWrite(tx: Prisma.TransactionClient, kind: 'category' | 'brand', data: { name?: string; slug?: string; isActive?: boolean; parentId?: string | null }, id: string, creating = false) {
  // Both models expose the same scalar fields used by these lookups.
  if (data.name !== undefined) {
    const duplicate = kind === 'category'
      ? await tx.category.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: id } }, select: { isActive: true } })
      : await tx.brand.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: id } }, select: { isActive: true } });
    if (duplicate) throw new Error(duplicate.isActive ? 'This name already exists.' : 'This name belongs to a removed record. Restore it instead.');
  }
  if (creating && data.slug !== undefined) {
    const slugs = kind === 'category' ? await tx.category.findMany({ select: { slug: true } }) : await tx.brand.findMany({ select: { slug: true } });
    if (slugs.some(row => row.slug === data.slug)) data.slug = taxonomySlug(data.name ?? '', id, new Set(slugs.map(row => row.slug)));
  }
  const parentId = data.parentId === undefined && kind === 'category' && data.isActive === true && !creating
    ? (await tx.category.findUnique({ where: { id }, select: { parentId: true } }))?.parentId : data.parentId;
  if (kind === 'category' && parentId) {
    const parent = await tx.category.findUnique({ where: { id: parentId } });
    if (!parent?.isActive) throw new Error('The selected parent category is unavailable.');
  }
  if (data.isActive === false && !creating) {
    const count = await tx.product.count({ where: { ...(kind === 'category' ? { categoryId: id } : { brandId: id }), isActive: true } });
    if (count) throw new Error(`Move or archive active products before removing this ${kind}.`);
    if (kind === 'category' && await tx.category.count({ where: { parentId: id, isActive: true } })) throw new Error('Move or remove active child categories before removing this category.');
  }
}
export async function guardProductTaxonomy(tx: Prisma.TransactionClient, next: { categoryId: string; brandId: string | null; isActive: boolean }, before?: { categoryId: string; brandId: string | null; isActive: boolean }) {
  const restoring = Boolean(before && !before.isActive && next.isActive);
  const category = await tx.category.findUnique({ where: { id: next.categoryId }, select: { isActive: true } });
  if (!category || (!category.isActive && (!before || before.categoryId !== next.categoryId || restoring))) throw new Error('The selected category is unavailable.');
  if (next.brandId) {
    const brand = await tx.brand.findUnique({ where: { id: next.brandId }, select: { isActive: true } });
    if (!brand || (!brand.isActive && (!before || before.brandId !== next.brandId || restoring))) throw new Error('The selected brand is unavailable.');
  }
}
