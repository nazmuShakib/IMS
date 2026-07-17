'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/repositories';
import { uuidv7 } from '@/lib/ids';
import { parseBDT } from '@/lib/money';
import { requireRole } from '@/lib/session';
import {
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  createSupplierSchema,
} from '@/schemas';

/**
 * Server Actions for the catalog (PLAN.md §16, Phase 1).
 *
 * Two rules hold in every action here:
 *   1. requireRole() FIRST. A hidden button is not a permission (§9.2).
 *   2. Zod parses the FormData before anything touches the repository.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const now = () => new Date().toISOString();

/** FormData gives us strings. Empty string means "not provided", not "". */
function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

function money(fd: FormData, key: string): number {
  const raw = str(fd, key);
  return raw === null ? 0 : parseBDT(raw);
}

function int(fd: FormData, key: string, fallback = 0): number {
  const raw = str(fd, key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) ? n : fallback;
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/* --- Products ------------------------------------------------------------- */

export async function createProduct(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireRole('ADMIN', 'MANAGER');

  let input;
  try {
    input = createProductSchema.parse({
      sku: str(fd, 'sku') ?? '',
      barcode: str(fd, 'barcode'),
      name: str(fd, 'name') ?? '',
      description: str(fd, 'description'),
      model: str(fd, 'model'),
      trackingType: str(fd, 'trackingType') ?? 'SERIAL',
      categoryId: str(fd, 'categoryId') ?? '',
      brandId: str(fd, 'brandId'),
      defaultCostPrice: money(fd, 'defaultCostPrice'),
      defaultSalePrice: money(fd, 'defaultSalePrice'),
      taxRate: 0,
      reorderPoint: int(fd, 'reorderPoint', 5),
      imageUrl: null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: fieldErrors(err) };
    return { error: err instanceof Error ? err.message : 'Could not read the form' };
  }

  let id: string;
  try {
    const created = await db.products.create({
      id: uuidv7(),
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      model: input.model ?? null,
      trackingType: input.trackingType,
      categoryId: input.categoryId,
      brandId: input.brandId ?? null,
      defaultCostPrice: input.defaultCostPrice,
      defaultSalePrice: input.defaultSalePrice,
      taxRate: input.taxRate,
      reorderPoint: input.reorderPoint,
      // Stock starts at zero, always. It can only be moved by the ledger (§5.1).
      quantityOnHand: 0,
      avgCostPrice: 0,
      imageUrl: input.imageUrl ?? null,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    });
    id = created.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the product' };
  }

  revalidatePath('/products');
  redirect(`/products/${id}`);
}

export async function updateProduct(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireRole('ADMIN', 'MANAGER');

  const id = str(fd, 'id');
  if (!id) return { error: 'Missing product id' };

  const existing = await db.products.findById(id);
  if (!existing) return { error: 'Product not found' };

  let input;
  try {
    input = createProductSchema.parse({
      sku: str(fd, 'sku') ?? '',
      barcode: str(fd, 'barcode'),
      name: str(fd, 'name') ?? '',
      description: str(fd, 'description'),
      model: str(fd, 'model'),
      // Tracking type is NOT editable once a product exists — see the form.
      trackingType: existing.trackingType,
      categoryId: str(fd, 'categoryId') ?? '',
      brandId: str(fd, 'brandId'),
      defaultCostPrice: money(fd, 'defaultCostPrice'),
      defaultSalePrice: money(fd, 'defaultSalePrice'),
      taxRate: existing.taxRate,
      reorderPoint: int(fd, 'reorderPoint', existing.reorderPoint),
      imageUrl: existing.imageUrl,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: fieldErrors(err) };
    return { error: err instanceof Error ? err.message : 'Could not read the form' };
  }

  try {
    await db.products.update(id, {
      sku: input.sku,
      barcode: input.barcode ?? null,
      name: input.name,
      description: input.description ?? null,
      model: input.model ?? null,
      categoryId: input.categoryId,
      brandId: input.brandId ?? null,
      defaultCostPrice: input.defaultCostPrice,
      defaultSalePrice: input.defaultSalePrice,
      reorderPoint: input.reorderPoint,
      // NOTE: quantityOnHand and avgCostPrice are absent on purpose. Editing a
      // product must never be able to change stock. Stock moves via the ledger.
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the product' };
  }

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

/** Soft delete. Movements and units reference this row forever (§6). */
export async function archiveProduct(fd: FormData): Promise<void> {
  await requireRole('ADMIN');
  const id = fd.get('id');
  if (typeof id !== 'string') throw new Error('Missing product id');

  await db.products.softDelete(id);
  revalidatePath('/products');
  redirect('/products');
}

export async function restoreProduct(fd: FormData): Promise<void> {
  await requireRole('ADMIN');
  const id = fd.get('id');
  if (typeof id !== 'string') throw new Error('Missing product id');

  await db.products.update(id, { isActive: true });
  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
}

/* --- Categories, brands, suppliers ---------------------------------------- */

export async function createCategory(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireRole('ADMIN', 'MANAGER');

  const parsed = createCategorySchema.safeParse({
    name: str(fd, 'name') ?? '',
    parentId: str(fd, 'parentId'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await db.categories.create({
      id: uuidv7(),
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      parentId: parsed.data.parentId ?? null,
      isActive: true,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the category' };
  }

  revalidatePath('/categories');
  return {};
}

export async function createBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole('ADMIN', 'MANAGER');

  const parsed = createBrandSchema.safeParse({ name: str(fd, 'name') ?? '' });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await db.brands.create({
      id: uuidv7(),
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      isActive: true,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the brand' };
  }

  revalidatePath('/brands');
  return {};
}

export async function createSupplier(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireRole('ADMIN', 'MANAGER');

  const parsed = createSupplierSchema.safeParse({
    name: str(fd, 'name') ?? '',
    phone: str(fd, 'phone'),
    email: str(fd, 'email'),
    address: str(fd, 'address'),
    note: str(fd, 'note'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await db.suppliers.create({
      id: uuidv7(),
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
      note: parsed.data.note ?? null,
      isActive: true,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save the supplier' };
  }

  revalidatePath('/suppliers');
  return {};
}
