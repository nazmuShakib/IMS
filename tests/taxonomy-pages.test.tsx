import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import CategoriesPage from '@/app/(dashboard)/categories/page';
import BrandsPage from '@/app/(dashboard)/brands/page';
const mocks = vi.hoisted(() => ({ role: 'ADMIN', findPage: vi.fn(), findAll: vi.fn(() => { throw new Error('Full product loading is forbidden'); }), manager: vi.fn() }));
vi.mock('@/repositories', () => ({ db: { categories: { findPage: mocks.findPage }, brands: { findPage: mocks.findPage }, products: { findAll: mocks.findAll } } }));
vi.mock('@/lib/session', () => ({ getSession: async () => ({ role: mocks.role, locale: 'en' }) }));
vi.mock('@/actions/catalog', () => ({ createCategory: vi.fn(), createBrand: vi.fn() }));
vi.mock('@/components/catalog/QuickCreateForm', () => ({ QuickCreateForm: () => <p>Create form</p> }));
vi.mock('@/components/catalog/TaxonomyManager', () => ({ TaxonomyManager: (props: unknown) => { mocks.manager(props); return <p>Register</p>; } }));
beforeEach(() => { vi.clearAllMocks(); mocks.role = 'ADMIN'; mocks.findPage.mockResolvedValue({ rows: [], totalCount: 0, catalogCount: 2, page: 1, pageCount: 1, pageSize: 50 }); });
it.each([CategoriesPage, BrandsPage])('fetches paged counts and keeps STAFF read-only', async page => {
  mocks.role = 'STAFF'; const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ page: '999', pageSize: '50', usage: 'used' }) }));
  expect(mocks.findPage).toHaveBeenCalledWith(expect.objectContaining({ page: 999, pageSize: 50, usage: 'used' }));
  expect(mocks.findAll).not.toHaveBeenCalled(); expect(html).not.toContain('Create form');
  expect(mocks.manager).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, meta: expect.objectContaining({ page: 1 }) }));
});
it.each([CategoriesPage, BrandsPage])('retains creation for catalog managers', async page => {
  mocks.role = 'MANAGER'; expect(renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }))).toContain('Create form');
  expect(mocks.manager).toHaveBeenCalledWith(expect.objectContaining({ canManage: true }));
});
