import type {
  CartDraft,
  CartItem,
  Customer,
  PaymentMethod,
  PaymentStatus,
  Sale,
  SaleItem,
} from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { normalizeBangladeshMobile } from '@/lib/phone';
import { db, type Repositories } from '@/repositories';
import {
  cartDetailsSchema,
  cartItemUpdateSchema,
  checkoutSchema,
  createCustomerSchema,
  type CreateCustomerInput,
} from '@/schemas';

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return normalizeBangladeshMobile(value);
}

export async function getOrCreateCart(actorId: string): Promise<CartDraft> {
  return db.transaction(async (tx) => {
    const existing = await tx.carts.findByActor(actorId);
    if (existing) return existing;
    const now = new Date().toISOString();
    return tx.carts.create({
      id: uuidv7(),
      actorId,
      customerId: null,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      reference: null,
      note: null,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function ownedCart(
  repositories: Repositories,
  cartId: string,
  actorId: string,
): Promise<CartDraft> {
  const cart = await repositories.carts.findById(cartId);
  if (!cart || cart.actorId !== actorId) throw new Error('Draft cart not found.');
  return cart;
}

export async function createCustomer(
  raw: CreateCustomerInput,
  repositories: Repositories = db,
): Promise<Customer> {
  const input = createCustomerSchema.parse(raw);
  const phoneNormalized = normalizePhone(input.phone);
  if (phoneNormalized) {
    const existing = await repositories.customers.findByNormalizedPhone(phoneNormalized);
    if (existing) throw new Error(`That phone number already belongs to ${existing.name}.`);
  }
  const now = new Date().toISOString();
  return repositories.customers.create({
    id: uuidv7(),
    name: input.name,
    phone: input.phone ?? null,
    phoneNormalized,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addCartItem(input: {
  cartId: string;
  actorId: string;
  identifier?: string;
  productId?: string;
  unitId?: string;
}): Promise<CartItem> {
  return db.transaction(async (tx) => {
    await ownedCart(tx, input.cartId, input.actorId);

    const identifier = input.identifier?.trim();
    let unit = input.unitId ? await tx.units.findById(input.unitId) : null;
    if (!unit && identifier) unit = await tx.units.findBySerial(identifier);

    let product = unit ? await tx.products.findById(unit.productId) : null;
    if (!product && input.productId) product = await tx.products.findById(input.productId);
    if (!product && identifier) {
      product = await tx.products.findByBarcode(identifier)
        ?? await tx.products.findBySku(identifier);
    }
    if (!product) throw new Error('No product or serial matches that identifier.');
    if (!product.isActive) throw new Error(`${product.name} is inactive and cannot be sold.`);

    if (product.trackingType === 'SERIAL') {
      if (!unit || unit.productId !== product.id) {
        throw new Error('Scan or select the exact serial/IMEI for this serialized product.');
      }
      if (unit.status !== 'IN_STOCK') {
        throw new Error(`Serial ${unit.serialNo} is ${unit.status.replaceAll('_', ' ').toLowerCase()}.`);
      }
      const existing = (await tx.carts.findItems(input.cartId))
        .find((item) => item.unitId === unit!.id);
      if (existing) throw new Error(`Serial ${unit.serialNo} is already in this cart.`);
    } else {
      const existing = (await tx.carts.findItems(input.cartId))
        .find((item) => item.productId === product!.id && item.unitId === null);
      if (existing) {
        if (existing.quantity + 1 > product.quantityOnHand) {
          throw new Error(`Only ${product.quantityOnHand} × ${product.name} are in stock.`);
        }
        return tx.carts.updateItem(existing.id, {
          quantity: existing.quantity + 1,
          actualUnitPrice: existing.actualUnitPrice,
        });
      }
      if (product.quantityOnHand <= 0) throw new Error(`${product.name} is out of stock.`);
    }

    const now = new Date().toISOString();
    return tx.carts.createItem({
      id: uuidv7(),
      cartId: input.cartId,
      productId: product.id,
      unitId: unit?.id ?? null,
      quantity: 1,
      listUnitPrice: product.defaultSalePrice,
      actualUnitPrice: product.defaultSalePrice,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function updateCartItem(input: {
  cartId: string;
  itemId: string;
  actorId: string;
  quantity: number;
  actualUnitPrice: number;
}): Promise<CartItem> {
  const parsed = cartItemUpdateSchema.parse(input);
  return db.transaction(async (tx) => {
    await ownedCart(tx, input.cartId, input.actorId);
    const item = await tx.carts.findItem(input.itemId);
    if (!item || item.cartId !== input.cartId) throw new Error('Cart item not found.');
    const product = await tx.products.findById(item.productId);
    if (!product) throw new Error('Product not found.');
    if (product.trackingType === 'SERIAL' && parsed.quantity !== 1) {
      throw new Error('Serialized cart lines always have quantity 1.');
    }
    if (product.trackingType === 'QUANTITY' && parsed.quantity > product.quantityOnHand) {
      throw new Error(`Only ${product.quantityOnHand} × ${product.name} are in stock.`);
    }
    return tx.carts.updateItem(item.id, parsed);
  });
}

export async function removeCartItem(cartId: string, itemId: string, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedCart(tx, cartId, actorId);
    const item = await tx.carts.findItem(itemId);
    if (!item || item.cartId !== cartId) throw new Error('Cart item not found.');
    await tx.carts.deleteItem(itemId);
  });
}

export async function discardCart(cartId: string, actorId: string): Promise<{
  cart: CartDraft;
  itemCount: number;
}> {
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, cartId, actorId);
    const itemCount = (await tx.carts.findItems(cart.id)).length;
    await tx.carts.delete(cart.id);
    return { cart, itemCount };
  });
}

export async function updateCartDetails(input: {
  cartId: string;
  actorId: string;
  customerId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  reference: string | null;
  note: string | null;
}): Promise<CartDraft> {
  const details = cartDetailsSchema.parse(input);
  return db.transaction(async (tx) => {
    await ownedCart(tx, input.cartId, input.actorId);
    if (details.customerId) {
      const customer = await tx.customers.findById(details.customerId);
      if (!customer?.isActive) throw new Error('The selected customer is unavailable.');
    }
    return tx.carts.update(input.cartId, details);
  });
}

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

export async function checkoutCart(raw: {
  cartId: string;
  actorId: string;
  actorName: string;
  idempotencyKey: string;
}): Promise<Sale> {
  const input = checkoutSchema.parse(raw);
  return db.transaction(async (tx) => {
    const replay = await tx.sales.findByIdempotencyKey(input.idempotencyKey);
    if (replay) return replay;

    const cart = await ownedCart(tx, input.cartId, input.actorId);
    const items = await tx.carts.findItems(cart.id);
    if (items.length === 0) throw new Error('Add at least one item before checkout.');

    const customer = cart.customerId ? await tx.customers.findById(cart.customerId) : null;
    if (cart.customerId && !customer?.isActive) throw new Error('The selected customer is unavailable.');

    const resolved = [];
    for (const item of items) {
      const product = await tx.products.findById(item.productId);
      if (!product?.isActive) throw new Error('A product in this cart is no longer available.');
      const unit = item.unitId ? await tx.units.findById(item.unitId) : null;
      if (product.trackingType === 'SERIAL') {
        if (!unit || unit.productId !== product.id || unit.status !== 'IN_STOCK') {
          throw new Error(`${product.name} (${unit?.serialNo ?? 'unknown serial'}) is no longer available.`);
        }
        if (item.quantity !== 1) throw new Error('Serialized cart lines must have quantity 1.');
      } else if (item.unitId || item.quantity > product.quantityOnHand) {
        throw new Error(`Only ${product.quantityOnHand} × ${product.name} remain in stock.`);
      }
      resolved.push({ item, product, unit });
    }

    const now = new Date().toISOString();
    const invoiceNumber = await tx.sales.nextInvoiceNumber(new Date(now));
    const subtotal = resolved.reduce(
      (sum, row) => sum + row.item.listUnitPrice * row.item.quantity,
      0,
    );
    const total = resolved.reduce(
      (sum, row) => sum + row.item.actualUnitPrice * row.item.quantity,
      0,
    );
    const sale: Sale = {
      id: uuidv7(),
      invoiceNumber,
      idempotencyKey: input.idempotencyKey,
      status: 'COMPLETED',
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      actorId: input.actorId,
      actorName: raw.actorName,
      paymentMethod: cart.paymentMethod,
      paymentStatus: cart.paymentStatus,
      reference: cart.reference,
      note: cart.note,
      subtotal,
      discount: subtotal - total,
      total,
      completedAt: now,
      createdAt: now,
    };
    await tx.sales.create(sale);

    for (const [index, row] of resolved.entries()) {
      const { item, product, unit } = row;
      const unitCost = unit?.costPrice ?? product.avgCostPrice;
      if (unit) {
        await tx.units.transitionStatus(unit.id, 'IN_STOCK', 'SOLD', {
          salePrice: item.actualUnitPrice,
          soldAt: now,
          warrantyExpiresAt: unit.warrantyMonths
            ? addMonths(now, unit.warrantyMonths)
            : null,
        });
      } else {
        await tx.products._applyQuantityDelta(product.id, -item.quantity);
      }

      const movement = await tx.movements.record({
        id: uuidv7(),
        type: 'OUT',
        reason: 'SALE',
        productId: product.id,
        unitId: unit?.id ?? null,
        quantity: -item.quantity,
        unitCost,
        unitPrice: item.actualUnitPrice,
        supplierId: null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        reference: invoiceNumber,
        note: cart.note,
        actorId: input.actorId,
        idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
        reversesId: null,
        warrantyClaimId: null,
        createdAt: now,
      });

      const saleItem: SaleItem = {
        id: uuidv7(),
        saleId: sale.id,
        movementId: movement.id,
        productName: product.name,
        sku: product.sku,
        serialNo: unit?.serialNo ?? null,
        listUnitPrice: item.listUnitPrice,
        warrantyMonths: unit?.warrantyMonths ?? null,
        createdAt: now,
      };
      await tx.sales.createItem(saleItem);
    }

    await tx.carts.delete(cart.id);
    return sale;
  });
}
