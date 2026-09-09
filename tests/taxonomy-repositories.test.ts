import { createCategory, createBrand, updateCategory, updateBrand, setCategoryActive, setBrandActive } from '@/actions/catalog';
import { beforeEach, expect, it, vi } from 'vitest';
import { jsonRepositories as db } from '@/repositories/json';
import { taxonomyPageFromRows, taxonomyQuery } from '@/lib/catalog-taxonomy';
import { taxonomyNameSchema, taxonomySlug } from '@/lib/taxonomy-form';
import { products as fixtureProducts } from './catalog-fixtures';
const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('@/repositories', async () => ({ db: (await import('@/repositories/json')).jsonRepositories }));
vi.mock('@/lib/session', () => ({ requireCapability: async () => { if (auth.role === 'STAFF') throw new Error('Forbidden'); return { id: 'actor', role: auth.role }; } }));
vi.mock('@/lib/audit', () => ({ writeAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), unstable_rethrow: vi.fn() }));
const memory = vi.hoisted(() => new Map<string, any[]>());
vi.mock('@/repositories/json/store', async importOriginal => ({ ...await importOriginal<typeof import('@/repositories/json/store')>(), readAll: async (name: string) => memory.get(name) ?? [], writeAll: async (name: string, rows: any[]) => { memory.set(name, rows); } }));
const category = { id: 'c1', name: 'Phones', slug: 'phones', parentId: null, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const brand = { ...category, id: 'b1', name: 'Brand', slug: 'brand' };
const product = { ...fixtureProducts[0]!, categoryId: 'c1', brandId: 'b1', isActive: true };
beforeEach(() => { auth.role = 'ADMIN'; memory.clear(); memory.set('categories', [category]); memory.set('brands', [brand]); });
it('validates after trimming and creates distinct nonempty Unicode slugs', () => {
  expect(taxonomyNameSchema.safeParse('   ').success).toBe(false); expect(taxonomyNameSchema.safeParse('!!!').success).toBe(false); expect(taxonomyNameSchema.parse(' মোবাইল ')).toBe('মোবাইল');
  const occupied = new Set<string>(); for (const [index, name] of ['মোবাইল', 'চার্জার', 'A B', 'A-B'].entries()) { const slug = taxonomySlug(name, String(index), occupied); expect(slug).not.toBe(''); expect(occupied.has(slug)).toBe(false); occupied.add(slug); }
});
it.each(['categories', 'brands'] as const)('rejects duplicate and removed names in %s, with unique slug collision handling', async kind => {
  const original = kind === 'categories' ? category : brand;
  await expect(db[kind].create({ ...original, id: 'new', name: original.name.toUpperCase() })).rejects.toThrow('This name already exists.');
  await db[kind].update(original.id, { isActive: false });
  await expect(db[kind].create({ ...original, id: 'new' })).rejects.toThrow('removed record');
  const created = await db[kind].create({ ...original, id: 'new', name: 'Different' }); expect(created.slug).not.toBe(original.slug);
});
it.each(['categories', 'brands'] as const)('serializes concurrent assignments and removal for %s in both orders', async kind => {
  const id = kind === 'categories' ? 'c1' : 'b1';
  const first = await Promise.allSettled([db.products.create(product), db[kind].update(id, { isActive: false })]);
  expect(first.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  memory.set('products', []);
  const second = await Promise.allSettled([db[kind].update(id, { isActive: false }), db.products.create(product)]);
  expect(second.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
});
it('allows removal with only archived products, blocks active children, and prevents restoring a product onto removed taxonomy', async () => {
  memory.set('products', [{ ...product, isActive: false }]);
  await db.categories.update('c1', { isActive: false }); await expect(db.products.update(product.id, { isActive: true })).rejects.toThrow('category is unavailable');
  await db.categories.update('c1', { isActive: true }); await db.categories.create({ ...category, id: 'child', name: 'Child', slug: 'child', parentId: 'c1' });
  await expect(db.categories.update('c1', { isActive: false })).rejects.toThrow('active child categories');
});
it('filters and sorts before paging, clamps pages, and separates active from archived counts', async () => {
  const items = Array.from({ length: 61 }, (_, i) => ({ ...category, id: `c${i}`, name: `Category ${String(i).padStart(2, '0')}`, slug: `cat-${i}`, isActive: i % 3 !== 0 }));
  memory.set('categories', items); memory.set('products', [{ ...product, categoryId: 'c1' }, { ...product, id: 'archived', categoryId: 'c1', isActive: false }]);
  const q = taxonomyQuery({ status: 'all', page: '2', order: 'name-desc' }); const result = await db.categories.findPage(q);
  expect(result.rows).toHaveLength(25); expect(result.totalCount).toBe(61); expect(result.rows[0]?.id).toBe('c35');
  const used = await db.categories.findPage(taxonomyQuery({ usage: 'used', page: '999' })); expect(used.page).toBe(1); expect(used.rows[0]).toMatchObject({ productCount: 2, activeProductCount: 1 });
  expect(taxonomyQuery({ page: 'oops', pageSize: '10', order: 'invalid' })).toMatchObject({ page: 1, pageSize: 25, order: 'newest' });
  expect(taxonomyPageFromRows([], [], taxonomyQuery({}), 'category')).toMatchObject({ page: 1, totalCount: 0, rows: [] });
});

function form(values: Record<string, string>) { const fd = new FormData(); for (const [key, value] of Object.entries(values)) fd.set(key, value); return fd; }
it.each([['category', createCategory, updateCategory], ['brand', createBrand, updateBrand]] as const)('validates %s actions and reports removed duplicates with a restoration target', async (kind, create, update) => {
  expect(await create({}, form({ name: '   ' }))).toMatchObject({ fieldErrors: { name: 'Enter a name.' } });
  expect(await create({}, form({ name: 'মোবাইল' }))).toMatchObject({ ok: expect.any(String), savedName: 'মোবাইল' });
  const rows = memory.get(kind === 'category' ? 'categories' : 'brands')!;
  const created = rows.find(row => row.name === 'মোবাইল'); expect(created.slug).toBe('মোবাইল');
  expect(await update({}, form({ id: created.id, name: 'New name' }))).toMatchObject({ ok: expect.any(String) });
  expect(memory.get(kind === 'category' ? 'categories' : 'brands')!.find(row => row.id === created.id).slug).toBe('মোবাইল');
  await db[kind === 'category' ? 'categories' : 'brands'].update(created.id, { isActive: false });
  expect(await create({}, form({ name: 'New name' }))).toMatchObject({ existing: { id: created.id, isActive: false }, fieldErrors: { name: expect.stringContaining('removed') } });
});
it.each([createCategory, createBrand, updateCategory, updateBrand, setCategoryActive, setBrandActive])('rejects STAFF mutation before repository writes', async action => {
  auth.role = 'STAFF'; await expect(action({}, form({ id: 'c1', name: 'Changed', active: 'false' }))).rejects.toThrow('Forbidden');
  expect(memory.get('categories')![0].name).toBe('Phones'); expect(memory.get('brands')![0].name).toBe('Brand');
});
it('returns actionable dependency errors and rejects malformed status values', async () => {
  memory.set('products', [product]);
  expect(await setCategoryActive({}, form({ id: 'c1', active: 'false' }))).toEqual({ error: 'Move or archive active products before removing this category.' });
  expect(await setBrandActive({}, form({ id: 'b1', active: 'false' }))).toEqual({ error: 'Move or archive active products before removing this brand.' });
  expect(await setBrandActive({}, form({ id: 'b1', active: 'no' }))).toEqual({ error: 'Invalid brand status' });
});

it('requires restoring a parent before its removed child', async () => {
  await db.categories.create({ ...category, id: 'child', name: 'Child', slug: 'child', parentId: 'c1' });
  await db.categories.update('child', { isActive: false }); await db.categories.update('c1', { isActive: false });
  await expect(db.categories.update('child', { isActive: true })).rejects.toThrow('parent category is unavailable');
  await db.categories.update('c1', { isActive: true }); await expect(db.categories.update('child', { isActive: true })).resolves.toMatchObject({ isActive: true });
});
