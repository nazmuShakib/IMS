'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/repositories';
import { parseBDT } from '@/lib/money';
import { requireCapability, getSession, canSeeCosts } from '@/lib/session';
import { toProductUnitDTO, type ProductUnitDTO } from '@/lib/dto';
import { requestAuditIp, writeAudit } from '@/lib/audit';
import { receiptFieldsSchema, receiptFormInput, receiptFieldErrors, serialBatchSchema, type StockReceipt } from '@/lib/stock-receipt';
import { correctMovement, receiveStock } from '@/services/stock';
import { removeStock } from '@/services/stock-removal';
import { removalFieldsSchema, removalFormInput, removalFieldErrors, removalSerialSchema, RemovalValidationError, type RemovalActionState } from '@/lib/stock-removal';
import type { UnitStatus } from '@/domain/types';

/**
 * Phase 2 (PLAN.md §16). These are thin — every one of them just validates the
 * form and hands off to `src/services/stock.ts`, which owns the transaction, the
 * ledger write and the concurrency guard.
 *
 * Business logic does NOT live here. If you find yourself writing a stock rule in
 * this file, it belongs in the service.
 */

export interface StockActionState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  labelReceiptId?: string;
  receipt?: StockReceipt;
  supplierReturn?: {
    id: string;
    returnNumber: string;
    productName: string;
    sku: string;
    serialNo: string | null;
    quantity: number;
  };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join('.') || '_'] ??= i.message;
  return out;
}

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? 'Invalid input';
  return err instanceof Error ? err.message : 'Something went wrong';
}

/* --- Serial lookup: the counter flow -------------------------------------- */

export interface SerialLookup {
  unit: ProductUnitDTO;
  productId: string;
  productName: string;
  sku: string;
  suggestedPrice: number;
  isActive: boolean;
}

/**
 * A customer puts a device on the counter. You type its IMEI. This is that.
 * Resolves the serial to its unit AND its product, so the operator never has to
 * know which product row it belongs to.
 */
export async function lookupSerial(
  _prev: { error?: string; found?: SerialLookup },
  fd: FormData,
): Promise<{ error?: string; found?: SerialLookup }> {
  const actor = await requireCapability('REMOVE_STOCK');
  const { role } = actor;
  const parsed = removalSerialSchema.safeParse(str(fd, 'serialNo') ?? '');
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'removal.invalid' };
  try {
    const unit = await db.units.findBySerial(parsed.data);
    if (!unit) return { error: 'removal.serialNotFound' };
    if (unit.status !== 'IN_STOCK') return { error: 'removal.deviceUnavailable' };
    const product = await db.products.findById(unit.productId);
    if (!product) return { error: 'removal.productUnavailable' };
    return { found: { unit: toProductUnitDTO(unit, role), productId: product.id, productName: product.name,
      sku: product.sku, suggestedPrice: product.defaultSalePrice, isActive: product.isActive } };
  } catch {
    return { error: 'removal.lookupFailed' };
  }
}

/* --- Stock in -------------------------------------------------------------- */

export interface StockSerialConflict {
  serialNo: string;
  status: UnitStatus;
}

export async function preflightStockSerials(input: {
  productId: string;
  serialNumbers: string[];
}): Promise<{ conflicts?: StockSerialConflict[]; error?: string }> {
  await requireCapability('MOVE_STOCK');

  const parsed = z.object({
    productId: z.string().uuid(),
    serialNumbers: serialBatchSchema,
  }).safeParse(input);
  if (!parsed.success) return { error: 'Invalid device-number check request.' };

  const product = await db.products.findById(parsed.data.productId);
  if (!product?.isActive || product.trackingType !== 'SERIAL') {
    return { error: 'The selected serialized product is unavailable.' };
  }

  const existing = await db.units.findBySerials(parsed.data.serialNumbers);
  return {
    conflicts: existing
      .filter((unit) => unit.status !== 'VOID' || unit.productId !== product.id)
      .map((unit) => ({ serialNo: unit.serialNo, status: unit.status })),
  };
}

export async function receiveStockAction(
  _prev: StockActionState,
  fd: FormData,
): Promise<StockActionState> {
  const actor = await requireCapability('MOVE_STOCK');

  const productId = str(fd, 'productId');
  if (!productId) return { fieldErrors: { productId: 'Choose a product' } };

  const product = await db.products.findById(productId);
  if (!product) return { error: 'Product not found' };

  const parsed = receiptFieldsSchema.safeParse(receiptFormInput(fd, product.trackingType));
  if (!parsed.success) return { fieldErrors: receiptFieldErrors(parsed.error) };

  let receipt: StockReceipt;
  try {
    const result = await receiveStock({ ...parsed.data, actorId: actor.id }, db, await requestAuditIp());
    receipt = result.receipt;
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: receiptFieldErrors(err) };
    if (err && typeof err === 'object' && 'code' in err && (err.code === 'P2034' || err.code === 'P2002')) {
      return { error: 'Stock changed during this request. Retry the same receipt.' };
    }
    return { error: message(err) };
  }

  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  revalidatePath('/stock/in');
  revalidatePath('/stock/movements');
  revalidatePath('/suppliers/returns');
  revalidatePath('/suppliers/analytics');

  return {
    ok: `Received ${receipt.count} × ${receipt.productName} into stock.`,
    labelReceiptId: receipt.id,
    receipt,
  };
}

/* --- Stock out ------------------------------------------------------------- */

export async function stockOutAction(
  _prev: RemovalActionState,
  fd: FormData,
): Promise<RemovalActionState> {
  const actor = await requireCapability('REMOVE_STOCK');
  // Checkout remains the only sale path; this form cannot post legacy reasons.
  const parsed = removalFieldsSchema.safeParse(removalFormInput(fd));
  if (!parsed.success) return { outcome: 'rejected', fieldErrors: removalFieldErrors(parsed.error) };
  let result: Awaited<ReturnType<typeof removeStock>>;
  try {
    result = await removeStock({ ...parsed.data, actorId: actor.id }, db, await requestAuditIp());
  } catch (err) {
    if (err instanceof RemovalValidationError) return { outcome: 'rejected', fieldErrors: { [err.field]: err.message },
      available: err.available, unavailableSerial: err.field === 'serialNo' };
    if (err instanceof z.ZodError) return { outcome: 'rejected', fieldErrors: removalFieldErrors(err) };
    if (err instanceof Error && err.message === 'removal.keyMismatch') return { outcome: 'rejected', error: err.message };
    // A lost response or commit acknowledgement is not proof that stock stayed unchanged.
    console.error('Stock removal could not be confirmed:', err);
    return { outcome: 'unconfirmed', error: 'removal.unconfirmed' };
  }
  // Cache failures must not turn a committed removal into a reported failure.
  try {
    for (const path of ['/', '/products', `/products/${result.receipt.productId}`, '/stock/out', '/stock/movements', '/suppliers/returns', '/suppliers/analytics']) revalidatePath(path);
  } catch (err) { console.error('Stock removal refresh failed:', err); }
  return result;
}

/* --- Corrections ----------------------------------------------------------- */

/**
 * The ONLY way to undo a movement. Writes an opposing ledger entry — it never
 * edits or deletes the original. PLAN.md §8.3.
 */
export async function reverseMovementAction(
  _prev: StockActionState,
  fd: FormData,
): Promise<StockActionState> {
  const actor = await requireCapability('CORRECT_STOCK');

  const movementId = str(fd, 'movementId');
  const note = str(fd, 'note');
  if (!movementId) return { error: 'Missing movement' };
  if (!note) return { fieldErrors: { note: 'Say why this is being reversed — it goes in the audit trail' } };

  try {
    const correction = await correctMovement({
      movementId,
      note,
      actorId: actor.id,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    await writeAudit({
      actorId: actor.id,
      action: 'stock.correct',
      entity: 'StockMovement',
      entityId: correction.id,
      after: correction,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return { fieldErrors: zodErrors(err) };
    return { error: message(err) };
  }

  revalidatePath('/products');
  revalidatePath('/stock/movements');
  return { ok: 'Reversed. The original entry is still in the ledger, with the correction beneath it.' };
}

/* --- Reconciliation -------------------------------------------------------- */

export async function runReconcile(): Promise<void> {
  await requireCapability('CORRECT_STOCK');
  revalidatePath('/stock/reconcile');
  redirect('/stock/reconcile');
}

export async function canViewCosts(): Promise<boolean> {
  const { role } = await getSession();
  return canSeeCosts(role);
}
