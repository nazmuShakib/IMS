import type {
  CartDraft,
  CartItem,
  Customer,
  PaymentMethod,
  PaymentStatus,
  Sale,
  SaleItem,
  Role,
  TradeInCartDraft,
  EmiTerm,
} from '@/domain/types';
import { uuidv7 } from '@/lib/ids';
import { formatBDT } from '@/lib/money';
import { normalizeBangladeshMobile } from '@/lib/phone';
import { db, type Repositories } from '@/repositories';
import {
  cartDetailsSchema,
  cartItemUpdateSchema,
  checkoutSchema,
  createCustomerSchema,
  type CreateCustomerInput,
  acceptUsedDeviceSchema,
  type AcceptUsedDeviceInput,
} from '@/schemas';
import { acceptUsedDeviceInTransaction } from '@/services/used-devices';
import { installmentAmounts, installmentDates } from '@/services/emi';

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
      isEmi: false,
      emiTermMonths: null,
      emiDownPayment: 0,
      emiFirstDueDate: null,
      tradeInDraft: null,
      tradeInAcquisitionId: null,
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
    identificationType: null,
    identificationNumber: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateCustomerIdentification(input: {
  customerId: string;
  identificationType: 'NID' | 'PASSPORT' | 'BIRTH_CERTIFICATE';
  identificationNumber: string;
}): Promise<Customer> {
  const number = input.identificationNumber.trim();
  if (number.length < 3) throw new Error('Enter the customer identification number.');
  return db.customers.update(input.customerId, {
    identificationType: input.identificationType,
    identificationNumber: number,
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
    const cartItems = await tx.carts.findItems(input.cartId);

    const identifier = input.identifier?.trim();
    let unit = input.unitId ? await tx.units.findById(input.unitId) : null;
    if (!unit && identifier) unit = await tx.units.findBySerial(identifier);

    let product = unit ? await tx.products.findById(unit.productId) : null;
    if (!product && input.productId) product = await tx.products.findById(input.productId);
    if (!product && identifier) {
      product = await tx.products.findByBarcode(identifier)
        ?? await tx.products.findBySku(identifier);
    }
    if (!product) throw new Error('No product or device number matches that identifier.');
    if (!product.isActive) throw new Error(`${product.name} is inactive and cannot be sold.`);

    if (product.trackingType === 'SERIAL') {
      if (!unit || unit.productId !== product.id) {
        throw new Error('Scan or select the exact device number/IMEI for this individually tracked product.');
      }
      if (unit.status !== 'IN_STOCK') {
        throw new Error(`Serial ${unit.serialNo} is ${unit.status.replaceAll('_', ' ').toLowerCase()}.`);
      }
      const existing = cartItems.find((item) => item.unitId === unit!.id);
      if (existing) throw new Error(`Device number ${unit.serialNo} is already in this cart.`);
    } else {
      const existing = cartItems.find((item) => item.productId === product!.id && item.unitId === null);
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
      listUnitPrice: unit?.askingPrice ?? (unit?.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice),
      actualUnitPrice: unit?.askingPrice ?? (unit?.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice),
      position: cartItems.reduce((highest, item) => Math.max(highest, item.position ?? 0), -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function reorderCartItems(input: {
  cartId: string;
  actorId: string;
  orderedItemIds: string[];
}): Promise<CartItem[]> {
  return db.transaction(async (tx) => {
    await ownedCart(tx, input.cartId, input.actorId);
    const items = await tx.carts.findItems(input.cartId);
    const currentIds = new Set(items.map((item) => item.id));
    const orderedIds = input.orderedItemIds;

    if (
      orderedIds.length !== items.length
      || new Set(orderedIds).size !== orderedIds.length
      || orderedIds.some((id) => !currentIds.has(id))
    ) {
      throw new Error('The cart changed while it was being reordered. Refresh and try again.');
    }

    const reordered: CartItem[] = [];
    for (const [position, id] of orderedIds.entries()) {
      reordered.push(await tx.carts.updateItem(id, { position }));
    }
    return reordered;
  });
}

export async function updateCartItem(input: {
  cartId: string;
  itemId: string;
  actorId: string;
  actorRole: Role;
  isEmi?: boolean;
  emiTermMonths?: 3 | 6 | 9 | 12 | null;
  emiDownPayment?: number;
  emiFirstDueDate?: string | null;
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
      throw new Error('Individually tracked cart lines always have quantity 1.');
    }
    if (product.trackingType === 'QUANTITY' && parsed.quantity > product.quantityOnHand) {
      throw new Error(`Only ${product.quantityOnHand} × ${product.name} are in stock.`);
    }
    if (input.actorRole === 'STAFF') {
      const minimumPrice = Math.max(0, item.listUnitPrice - product.staffMaxDiscount);
      if (parsed.actualUnitPrice < minimumPrice) {
        throw new Error(`STAFF may not sell this item below ${formatBDT(minimumPrice)}.`);
      }
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
  tradeInAcquisitionId: string | null;
  actorRole: Role;
  isEmi?: boolean;
  emiTermMonths?: EmiTerm | null;
  emiDownPayment?: number;
  emiFirstDueDate?: string | null;
}): Promise<CartDraft> {
  const details = cartDetailsSchema.parse(input);
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, input.cartId, input.actorId);
    if (details.customerId) {
      const customer = await tx.customers.findById(details.customerId);
      if (!customer?.isActive) throw new Error('The selected customer is unavailable.');
    }
    if (details.tradeInAcquisitionId !== cart.tradeInAcquisitionId) {
      if (input.actorRole === 'STAFF') throw new Error('Only a Manager or Admin can apply a trade-in credit.');
      if (cart.tradeInDraft && details.tradeInAcquisitionId) {
        throw new Error('Remove the checkout trade-in draft before selecting a legacy trade-in.');
      }
      if (details.tradeInAcquisitionId) {
        const acquisition = await tx.usedDeviceAcquisitions.findById(details.tradeInAcquisitionId);
        if (!acquisition || acquisition.type !== 'TRADE_IN' || acquisition.tradeInSaleId) {
          throw new Error('The selected trade-in is unavailable.');
        }
      }
    }
    return tx.carts.update(input.cartId, {
      ...details,
      ...(input.isEmi !== undefined ? {
        isEmi: input.isEmi,
        emiTermMonths: input.emiTermMonths ?? null,
        emiDownPayment: input.emiDownPayment ?? 0,
        emiFirstDueDate: input.emiFirstDueDate ?? null,
      } : {}),
    });
  });
}

export async function saveTradeInDraft(raw: AcceptUsedDeviceInput & {
  cartId: string;
}): Promise<CartDraft> {
  const input = acceptUsedDeviceSchema.parse({ ...raw, acquisitionType: 'TRADE_IN' });
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, raw.cartId, input.actorId);
    if (cart.tradeInAcquisitionId) {
      throw new Error('Remove the existing legacy trade-in credit before preparing a new trade-in.');
    }
    const product = await tx.products.findById(input.productId);
    if (!product?.isActive || product.trackingType !== 'SERIAL') {
      throw new Error('Choose an active serial-tracked phone product.');
    }
    const duplicate = await tx.units.findBySerial(input.serialNo);
    if (duplicate && duplicate.status !== 'VOID') {
      throw new Error(`Device number ${input.serialNo} already exists (${duplicate.status.replaceAll('_', ' ').toLowerCase()}).`);
    }
    if (duplicate && duplicate.productId !== input.productId) {
      throw new Error(`Device number ${input.serialNo} belongs to a different product and cannot be revived here.`);
    }
    const draft: TradeInCartDraft = {
      productId: input.productId,
      serialNo: input.serialNo,
      grade: input.grade,
      batteryHealth: input.batteryHealth ?? null,
      inspectionResults: input.inspectionResults,
      knownDefects: input.knownDefects ?? null,
      includedAccessories: input.includedAccessories ?? null,
      askingPrice: input.askingPrice,
      warrantyMonths: input.warrantyMonths ?? null,
      warrantyDays: input.warrantyDays ?? null,
      location: input.location ?? null,
      sellerName: input.sellerName,
      sellerPhone: input.sellerPhone,
      identificationType: input.identificationType ?? null,
      identificationNumber: input.identificationNumber ?? null,
      acquisitionValue: input.acquisitionValue,
      reference: input.reference ?? null,
      note: input.note ?? null,
    };
    return tx.carts.update(cart.id, { tradeInDraft: draft });
  });
}

export async function clearTradeInDraft(cartId: string, actorId: string): Promise<CartDraft> {
  return db.transaction(async (tx) => {
    const cart = await ownedCart(tx, cartId, actorId);
    return tx.carts.update(cart.id, { tradeInDraft: null });
  });
}

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export async function checkoutCart(raw: {
  cartId: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
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
          throw new Error(`${product.name} (${unit?.serialNo ?? 'unknown device number'}) is no longer available.`);
        }
        if (item.quantity !== 1) throw new Error('Individually tracked cart lines must have quantity 1.');
      } else if (item.unitId || item.quantity > product.quantityOnHand) {
        throw new Error(`Only ${product.quantityOnHand} × ${product.name} remain in stock.`);
      }
      resolved.push({ item, product, unit });
    }

    let saleRows = resolved;
    if (cart.isEmi) {
      if (!customer) throw new Error('Choose a saved customer for an EMI sale.');
      if (!customer.identificationType || !customer.identificationNumber) {
        throw new Error('Add the customer identification type and number before an EMI sale.');
      }
      if (![3, 6, 9, 12].includes(cart.emiTermMonths ?? 0)) throw new Error('Choose a valid EMI term.');
      if (!cart.emiFirstDueDate) throw new Error('Choose the first installment date.');
      const firstDueDate = new Date(cart.emiFirstDueDate);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const latest = new Date(today); latest.setDate(latest.getDate() + 31); latest.setHours(23, 59, 59, 999);
      if (firstDueDate < today || firstDueDate > latest) throw new Error('First installment date must be today or within the next 31 days.');
    }

    // Re-check each product's live STAFF allowance inside the same transaction
    // that writes the sale. A stale cart cannot bypass an ADMIN reduction.
    // This prevents a stale cart or a crafted Server Action request from using a
    // discount that an ADMIN has since disallowed.
    if (raw.actorRole === 'STAFF') {
      for (const { item, product } of saleRows) {
        const minimumPrice = Math.max(0, item.listUnitPrice - product.staffMaxDiscount);
        if (item.actualUnitPrice < minimumPrice) {
          throw new Error(`${product.name} must be at least ${formatBDT(minimumPrice)} for STAFF.`);
        }
      }
    }

    const now = new Date().toISOString();
    const invoiceNumber = await tx.sales.nextInvoiceNumber(new Date(now));
    const subtotal = saleRows.reduce(
      (sum, row) => sum + row.item.listUnitPrice * row.item.quantity,
      0,
    );
    const total = saleRows.reduce(
      (sum, row) => sum + row.item.actualUnitPrice * row.item.quantity,
      0,
    );
    const legacyTradeIn = cart.tradeInAcquisitionId
      ? await tx.usedDeviceAcquisitions.findById(cart.tradeInAcquisitionId)
      : null;
    if (cart.tradeInAcquisitionId && (!legacyTradeIn || legacyTradeIn.type !== 'TRADE_IN' || legacyTradeIn.tradeInSaleId)) {
      throw new Error('The selected trade-in is no longer available.');
    }
    if (cart.tradeInDraft && legacyTradeIn) throw new Error('A checkout cannot use two trade-ins.');
    const tradeInCredit = cart.tradeInDraft?.acquisitionValue ?? legacyTradeIn?.acquisitionValue ?? 0;
    if (tradeInCredit > total) {
      throw new Error('Trade-in credit cannot exceed the sale total in this version.');
    }
    if (cart.isEmi && (cart.emiDownPayment ?? 0) + tradeInCredit > total) {
      throw new Error('Down payment and trade-in credit cannot exceed the EMI total.');
    }
    if (cart.isEmi && [total, cart.emiDownPayment ?? 0, tradeInCredit].some((amount) => amount % 100 !== 0)) {
      throw new Error('EMI price, down payment, and trade-in credit must use whole-taka amounts.');
    }
    const acceptedTradeIn = cart.tradeInDraft
      ? await acceptUsedDeviceInTransaction({
          ...cart.tradeInDraft,
          acquisitionType: 'TRADE_IN',
          ownershipConfirmed: true,
          actorId: input.actorId,
          idempotencyKey: `${input.idempotencyKey}:trade-in`,
        } as AcceptUsedDeviceInput, tx)
      : null;
    const legacyTradeInUnit = legacyTradeIn ? await tx.units.findById(legacyTradeIn.unitId) : null;
    const incomingTradeInUnit = acceptedTradeIn?.unit ?? legacyTradeInUnit;
    const incomingTradeInProduct = incomingTradeInUnit
      ? await tx.products.findById(incomingTradeInUnit.productId)
      : null;
    if ((cart.tradeInDraft || legacyTradeIn) && (!incomingTradeInUnit || !incomingTradeInProduct || !incomingTradeInUnit.usedGrade)) {
      throw new Error('The trade-in device details are incomplete.');
    }
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
      paymentStatus: cart.isEmi && total - tradeInCredit - (cart.emiDownPayment ?? 0) > 0 ? 'UNPAID' : cart.paymentStatus,
      reference: cart.reference,
      note: cart.note,
      subtotal,
      discount: subtotal - total,
      total,
      tradeInCredit,
      tradeInDetails: incomingTradeInUnit && incomingTradeInProduct && incomingTradeInUnit.usedGrade
        ? {
            productName: incomingTradeInProduct.name,
            sku: incomingTradeInProduct.sku,
            serialNo: incomingTradeInUnit.serialNo,
            grade: incomingTradeInUnit.usedGrade,
            acquisitionValue: tradeInCredit,
          }
        : null,
      completedAt: now,
      createdAt: now,
      voidedAt: null,
      voidedById: null,
      voidedByName: null,
      voidReason: null,
      refundAmount: null,
      refundMethod: null,
      voidIdempotencyKey: null,
    };
    await tx.sales.create(sale);
    if (acceptedTradeIn) await tx.usedDeviceAcquisitions.attachToSale(acceptedTradeIn.acquisition.id, sale.id);
    if (legacyTradeIn) await tx.usedDeviceAcquisitions.attachToSale(legacyTradeIn.id, sale.id);

    for (const [index, row] of saleRows.entries()) {
      const { item, product, unit } = row;
      const unitCost = unit?.costPrice ?? product.avgCostPrice;
      if (unit) {
        await tx.units.transitionStatus(unit.id, 'IN_STOCK', 'SOLD', {
          salePrice: item.actualUnitPrice,
          soldAt: now,
          warrantyExpiresAt: unit.warrantyDays
            ? addDays(now, unit.warrantyDays)
            : unit.warrantyMonths
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
        warrantyDays: unit?.warrantyDays ?? null,
        usedGrade: unit?.usedGrade ?? null,
        knownDefects: unit?.knownDefects ?? null,
        position: item.position,
        createdAt: now,
      };
      await tx.sales.createItem(saleItem);
    }

    if (cart.isEmi) {
      const termMonths = cart.emiTermMonths as 3 | 6 | 9 | 12;
      const financedAmount = total - tradeInCredit - (cart.emiDownPayment ?? 0);
      const contractId = uuidv7();
      const contract = {
        id: contractId,
        contractNumber: await tx.emi.nextContractNumber(new Date(now)),
        saleId: sale.id,
        customerId: customer!.id,
        status: financedAmount === 0 ? 'PAID' as const : 'ACTIVE' as const,
        termMonths,
        normalPrice: subtotal,
        emiTotal: total,
        downPayment: cart.emiDownPayment ?? 0,
        tradeInCredit,
        financedAmount,
        firstDueDate: cart.emiFirstDueDate!,
        createdById: input.actorId,
        createdByName: raw.actorName,
        createdAt: now,
        updatedAt: now,
        completedAt: financedAmount === 0 ? now : null,
        voidedAt: null,
      };
      await tx.emi.createContract(contract);
      const dates = installmentDates(new Date(cart.emiFirstDueDate!), termMonths);
      const amounts = installmentAmounts(financedAmount, termMonths);
      for (let index = 0; index < termMonths; index += 1) {
        await tx.emi.createInstallment({
          id: uuidv7(), contractId, sequence: index + 1, dueDate: dates[index]!.toISOString(), amountDue: amounts[index]!, amountPaid: 0,
          status: financedAmount === 0 ? 'PAID' : 'UPCOMING', paidAt: financedAmount === 0 ? now : null, createdAt: now, updatedAt: now,
        });
      }
    }

    await tx.carts.delete(cart.id);
    return sale;
  });
}
