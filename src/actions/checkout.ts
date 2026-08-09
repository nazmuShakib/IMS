'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { writeAudit } from '@/lib/audit';
import { parseBDT } from '@/lib/money';
import { requireCapability } from '@/lib/session';
import { db } from '@/repositories';
import {
  addCartItem,
  checkoutCart,
  clearTradeInDraft,
  createCustomer,
  discardCart,
  removeCartItem,
  reorderCartItems,
  updateCartDetails,
  updateCartItem,
} from '@/services/checkout';
import { voidSale } from '@/services/sales';
import { type PaymentMethod, type PaymentStatus } from '@/domain/types';
import { voidInvoiceFieldsSchema } from '@/schemas';

export interface CheckoutActionState {
  error?: string;
  ok?: string;
}

export interface VoidInvoiceActionState extends CheckoutActionState {
  fieldErrors?: Partial<Record<'reason' | 'refundMethod' | 'confirmed', string>>;
}

const voidInvoiceFormSchema = voidInvoiceFieldsSchema.extend({
  saleId: z.string().uuid('The invoice identifier is invalid.'),
  idempotencyKey: z.string().min(8, 'The void request is not ready. Close the dialog and try again.'),
});

function voidFieldErrors(error: z.ZodError): VoidInvoiceActionState['fieldErrors'] {
  const result: VoidInvoiceActionState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === 'reason' || field === 'refundMethod' || field === 'confirmed') && !result[field]) {
      result[field] = issue.message;
    }
  }
  return result;
}

function str(fd: FormData, key: string): string | null {
  const value = fd.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Invalid input.';
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export async function addCartItemAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const item = await addCartItem({
      cartId: str(fd, 'cartId') ?? '',
      actorId: actor.id,
      identifier: str(fd, 'identifier') ?? undefined,
      productId: str(fd, 'productId') ?? undefined,
      unitId: str(fd, 'unitId') ?? undefined,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'cart.item_add',
      entity: 'CartItem',
      entityId: item.id,
      after: { cartId: item.cartId, productId: item.productId, unitId: item.unitId, quantity: item.quantity },
    });
    revalidatePath('/checkout');
    return { ok: 'Item added to the draft cart.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function updateCartItemAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const item = await updateCartItem({
      cartId: str(fd, 'cartId') ?? '',
      itemId: str(fd, 'itemId') ?? '',
      actorId: actor.id,
      quantity: Number(str(fd, 'quantity') ?? '0'),
      actualUnitPrice: parseBDT(str(fd, 'actualUnitPrice') ?? ''),
    });
    await writeAudit({
      actorId: actor.id,
      action: 'cart.item_update',
      entity: 'CartItem',
      entityId: item.id,
      after: { quantity: item.quantity, actualUnitPrice: item.actualUnitPrice },
    });
    revalidatePath('/checkout');
    return { ok: 'Cart line updated.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function removeCartItemAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  const cartId = str(fd, 'cartId') ?? '';
  const itemId = str(fd, 'itemId') ?? '';
  try {
    await removeCartItem(cartId, itemId, actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'cart.item_remove',
      entity: 'CartItem',
      entityId: itemId,
      before: { cartId },
    });
    revalidatePath('/checkout');
    return { ok: 'Item removed.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function reorderCartItemsAction(fd: FormData): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  const cartId = str(fd, 'cartId') ?? '';
  try {
    const rawIds = JSON.parse(str(fd, 'orderedItemIds') ?? '[]') as unknown;
    if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string')) {
      throw new Error('Invalid cart order.');
    }
    const items = await reorderCartItems({
      cartId,
      actorId: actor.id,
      orderedItemIds: rawIds,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'cart.items_reorder',
      entity: 'CartDraft',
      entityId: cartId,
      after: { orderedItemIds: items.map((item) => item.id) },
    });
    revalidatePath('/checkout');
    return { ok: 'Cart order saved.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function discardCartAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const discarded = await discardCart(str(fd, 'cartId') ?? '', actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'cart.discard',
      entity: 'CartDraft',
      entityId: discarded.cart.id,
      before: {
        customerId: discarded.cart.customerId,
        paymentMethod: discarded.cart.paymentMethod,
        paymentStatus: discarded.cart.paymentStatus,
        tradeInAcquisitionId: discarded.cart.tradeInAcquisitionId,
        itemCount: discarded.itemCount,
      },
    });
    revalidatePath('/checkout');
    return { ok: 'Draft discarded. A fresh empty draft is ready.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function clearTradeInDraftAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('MANAGE_USED_DEVICES');
  try {
    const cart = await clearTradeInDraft(str(fd, 'cartId') ?? '', actor.id);
    await writeAudit({
      actorId: actor.id,
      action: 'trade_in.draft_discard',
      entity: 'CartDraft',
      entityId: cart.id,
    });
    revalidatePath('/checkout');
    return { ok: 'Trade-in removed from this checkout.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function updateCartDetailsAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  try {
    const cart = await updateCartDetails({
      cartId: str(fd, 'cartId') ?? '',
      actorId: actor.id,
      customerId: str(fd, 'customerId'),
      paymentMethod: (str(fd, 'paymentMethod') ?? 'CASH') as PaymentMethod,
      paymentStatus: (str(fd, 'paymentStatus') ?? 'PAID') as PaymentStatus,
      reference: str(fd, 'reference'),
      note: str(fd, 'note'),
      tradeInAcquisitionId: str(fd, 'tradeInAcquisitionId'),
      actorRole: actor.role,
    });
    await writeAudit({
      actorId: actor.id,
      action: 'cart.details_update',
      entity: 'CartDraft',
      entityId: cart.id,
      after: {
        customerId: cart.customerId,
        paymentMethod: cart.paymentMethod,
        paymentStatus: cart.paymentStatus,
        reference: cart.reference,
        tradeInAcquisitionId: cart.tradeInAcquisitionId,
      },
    });
    revalidatePath('/checkout');
    return { ok: 'Checkout details saved.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function createCustomerAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('MANAGE_CUSTOMERS');
  try {
    const customer = await createCustomer({
      name: str(fd, 'name') ?? '',
      phone: str(fd, 'phone') ?? '',
    });
    const cartId = str(fd, 'cartId');
    if (cartId) {
      const cart = await db.carts.findById(cartId);
      if (!cart || cart.actorId !== actor.id) throw new Error('Draft cart not found.');
      await updateCartDetails({
        ...cart,
        cartId: cart.id,
        actorId: actor.id,
        customerId: customer.id,
        actorRole: actor.role,
      });
    }
    await writeAudit({
      actorId: actor.id,
      action: 'customer.create',
      entity: 'Customer',
      entityId: customer.id,
      after: { name: customer.name, phone: customer.phone },
    });
    revalidatePath('/checkout');
    revalidatePath('/customers');
    return { ok: cartId ? `${customer.name} created and selected.` : `${customer.name} created.` };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function checkoutAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState> {
  const actor = await requireCapability('CHECKOUT');
  let saleId: string;
  try {
    const cartId = str(fd, 'cartId') ?? '';
    await updateCartDetails({
      cartId,
      actorId: actor.id,
      customerId: str(fd, 'customerId'),
      paymentMethod: (str(fd, 'paymentMethod') ?? 'CASH') as PaymentMethod,
      paymentStatus: (str(fd, 'paymentStatus') ?? 'PAID') as PaymentStatus,
      reference: str(fd, 'reference'),
      note: str(fd, 'note'),
      tradeInAcquisitionId: str(fd, 'tradeInAcquisitionId'),
      actorRole: actor.role,
    });
    const sale = await checkoutCart({
      cartId,
      actorId: actor.id,
      actorName: actor.name,
      idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    });
    saleId = sale.id;
    await writeAudit({
      actorId: actor.id,
      action: 'sale.complete',
      entity: 'Sale',
      entityId: sale.id,
      after: {
        invoiceNumber: sale.invoiceNumber,
        customerId: sale.customerId,
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        tradeInCredit: sale.tradeInCredit,
      },
    });
  } catch (error) {
    return { error: message(error) };
  }

  revalidatePath('/');
  revalidatePath('/checkout');
  revalidatePath('/invoices');
  revalidatePath('/products');
  revalidatePath('/stock/movements');
  redirect(`/invoices/${saleId}`);
}

export async function recordInvoicePrintAction(
  _previous: CheckoutActionState,
  fd: FormData,
): Promise<CheckoutActionState & { printNonce?: string }> {
  const actor = await requireCapability('VIEW_INVOICES');
  const saleId = str(fd, 'saleId') ?? '';
  const layout = str(fd, 'layout') === 'thermal' ? 'thermal' : 'a4';
  const sale = await db.sales.findById(saleId);
  if (!sale) return { error: 'Invoice not found.' };
  await writeAudit({
    actorId: actor.id,
    action: 'invoice.print',
    entity: 'Sale',
    entityId: sale.id,
    after: { invoiceNumber: sale.invoiceNumber, layout },
  });
  return { printNonce: crypto.randomUUID() };
}

export async function voidInvoiceAction(
  _previous: VoidInvoiceActionState,
  fd: FormData,
): Promise<VoidInvoiceActionState> {
  const actor = await requireCapability('VIEW_INVOICES');
  const parsed = voidInvoiceFormSchema.safeParse({
    saleId: str(fd, 'saleId') ?? '',
    idempotencyKey: str(fd, 'idempotencyKey') ?? '',
    reason: str(fd, 'reason') ?? '',
    refundMethod: str(fd, 'refundMethod'),
    confirmed: str(fd, 'confirmed') === 'yes',
  });
  if (!parsed.success) {
    const fieldErrors = voidFieldErrors(parsed.error);
    const hiddenIssue = parsed.error.issues.find((issue) => (
      issue.path[0] === 'saleId' || issue.path[0] === 'idempotencyKey'
    ));
    return { fieldErrors, error: hiddenIssue?.message };
  }

  try {
    const before = await db.sales.findById(parsed.data.saleId);
    if (before?.paymentStatus === 'PAID'
      && before.total - before.tradeInCredit > 0
      && !parsed.data.refundMethod) {
      return { fieldErrors: { refundMethod: 'Choose how the customer was refunded.' } };
    }
    const sale = await voidSale({
      saleId: parsed.data.saleId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      reason: parsed.data.reason,
      refundMethod: parsed.data.refundMethod as PaymentMethod | null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    try {
      await writeAudit({
        actorId: actor.id,
        action: 'sale.void',
        entity: 'Sale',
        entityId: sale.id,
        before: before ? { status: before.status } : undefined,
        after: {
          invoiceNumber: sale.invoiceNumber,
          status: sale.status,
          reason: sale.voidReason,
          refundAmount: sale.refundAmount,
          refundMethod: sale.refundMethod,
        },
      });
    } catch (auditError) {
      // The immutable Sale record already contains the actor, reason, refund,
      // and timestamp. Do not report the atomic void as failed if this secondary
      // request-metadata log is temporarily unavailable.
      console.error('Invoice void audit-log write failed', auditError);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: voidFieldErrors(error), error: message(error) };
    }
    return { error: message(error) };
  }

  revalidatePath('/');
  revalidatePath('/invoices');
  revalidatePath(`/invoices/${parsed.data.saleId}`);
  revalidatePath('/products');
  revalidatePath('/stock/movements');
  revalidatePath('/reports');
  revalidatePath('/customers');
  return { ok: 'Invoice voided. Inventory and financial records were reversed together.' };
}
