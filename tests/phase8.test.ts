import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizePhone } from '@/services/checkout';
import { dhakaYear } from '@/lib/time';
import { createCustomerSchema, createSupplierSchema } from '@/schemas';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Phase 8 customer and checkout decisions', () => {
  it('normalizes customer phone numbers without inventing walk-in records', () => {
    expect(normalizePhone('+880 1712-345678')).toBe('01712345678');
    expect(normalizePhone('1712-345678')).toBe('01712345678');
    expect(normalizePhone('')).toBeNull();
    expect(source('src/services/checkout.ts')).toContain('customerId: customer?.id ?? null');
  });

  it('accepts only Bangladeshi mobile numbers for saved customers', () => {
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '01712345678' }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '+880 1712-345678' }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '01212345678' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '12345' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: 'Mithun', phone: '' }).success).toBe(false);
  });

  it('accepts only Bangladeshi mobile numbers when creating or editing suppliers', () => {
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '01712345678' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '+880 1712-345678' }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: null }).success).toBe(true);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '+14155552671' }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ name: 'Supplier', phone: '12345' }).success).toBe(false);

    const page = source('src/app/(dashboard)/suppliers/page.tsx');
    const editor = source('src/components/suppliers/SupplierEditor.tsx');
    const action = source('src/actions/catalog.ts');
    const repositories = source('src/repositories/types.ts');
    expect(page).toContain("<SupplierRegister suppliers={suppliers} canManage={role !== 'STAFF'} />");
    expect(editor).toContain("t('suppliers.edit')");
    expect(editor).toContain("t('common.saveChanges')");
    expect(action).toContain('export async function updateSupplier');
    expect(action).toContain("action: 'supplier.update'");
    expect(action).toContain('normalizeBangladeshMobile(parsed.data.phone)');
    expect(repositories).toContain("Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>");
  });

  it('does not turn a name-only customer search into an empty phone match', () => {
    const repository = source('src/repositories/prisma/index.ts');
    expect(repository).toContain("const digits = term.replace(/\\D/g, '')");
    expect(repository).toContain('...(digits ? [{ phoneNormalized: { contains: digits } }] : [])');
    expect(repository).not.toContain("phoneNormalized: { contains: term.replace(/\\D/g, '') }");
  });

  it('keeps customer records minimal and provides search plus purchase history', () => {
    const schema = source('prisma/schema.prisma');
    const customerModel = schema.slice(schema.indexOf('model Customer'), schema.indexOf('model CartDraft'));
    expect(customerModel).toContain('name');
    expect(customerModel).toContain('phone');
    expect(customerModel).not.toContain('email');
    expect(customerModel).not.toContain('address');
    expect(customerModel).not.toContain('note');
    expect(source('src/app/(dashboard)/customers/page.tsx')).toContain('db.customers.search');
    expect(source('src/app/(dashboard)/customers/[id]/page.tsx')).toContain('db.sales.findByCustomer');
    const register = source('src/components/customers/CustomerRegister.tsx');
    expect(register).toContain('setFiltering(true)');
    expect(register).toContain('setFiltering(false)');
    expect(register).toContain("t('loading.searchCustomers')");
    expect(register).toContain('window.history.pushState');
    expect(register).toContain('router.refresh()');
  });

  it('numbers invoices by the Dhaka calendar year', () => {
    expect(dhakaYear(new Date('2026-12-31T20:00:00.000Z'))).toBe(2027);
  });

  it('persists one server draft per actor and records payment details', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).toContain('actorId String @unique');
    expect(schema).toContain('paymentMethod PaymentMethod');
    expect(schema).toContain('paymentStatus PaymentStatus');
    expect(schema).toContain('enum PaymentStatus');
  });

  it('lets the owner explicitly discard a persisted draft without changing inventory', () => {
    const service = source('src/services/checkout.ts');
    const action = source('src/actions/checkout.ts');
    const control = source('src/components/checkout/DiscardDraftControl.tsx');
    expect(service).toContain('const cart = await ownedCart(tx, cartId, actorId)');
    expect(service).toContain('await tx.carts.delete(cart.id)');
    expect(action).toContain("action: 'cart.discard'");
    expect(control).toContain('role="alertdialog"');
    expect(control).toContain("t('checkout.inventoryUnchanged')");
  });

  it('allows STAFF checkout while preserving immutable price snapshots', () => {
    const permissions = source('src/lib/permissions.ts');
    const service = source('src/services/checkout.ts');
    expect(permissions).toContain("CHECKOUT: ['ADMIN', 'MANAGER', 'STAFF']");
    expect(service).toContain('listUnitPrice: item.listUnitPrice');
    expect(service).toContain('unitPrice: item.actualUnitPrice');
    expect(service).toContain('discount: subtotal - total');
  });

  it('requires confirmation before completing a sale', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('role="alertdialog"');
    expect(workspace).toMatch(/t\(["']checkout\.confirmTitle["']\)/);
    expect(workspace).toMatch(/t\(["']checkout\.confirmDescription["']/);
    expect(workspace).toContain("formAction={completeAction}");
    expect(workspace).toMatch(/t\(["']checkout\.yesComplete["']\)/);
  });

  it('shows the device identifier instead of an editable quantity for serialized cart lines', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toMatch(/line\.trackingType === ["']SERIAL["']/);
    expect(workspace).toMatch(/t\(["']checkout\.serialImei["']\)/);
    expect(workspace).toContain('<SerialChip serial={line.serialNo} />');
    expect(workspace).toContain('type="hidden" name="quantity" value="1"');
  });

  it('uses a bounded local quantity stepper for bulk cart lines', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('stepQuantity(-1)');
    expect(workspace).toContain('stepQuantity(1)');
    expect(workspace).toMatch(/t\(["']checkout\.decreaseQuantity["']\)/);
    expect(workspace).toMatch(/t\(["']checkout\.increaseQuantity["']\)/);
    expect(workspace).toContain('quantity >= maximumQuantity');
    expect(workspace).toContain('type="hidden" name="quantity" value={quantity}');
  });

  it('auto-saves quantity and selling-price edits before checkout can complete', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('formRef.current?.requestSubmit()');
    expect(workspace).toContain('const queueSave = (delay = 650)');
    expect(workspace).toContain('onPendingChange(line.id, linePending)');
    expect(workspace).toContain('checkingOut || lineUpdatesPending');
    expect(workspace).toMatch(/t\(["']checkout\.waitForLineSave["']\)/);
    expect(workspace).not.toMatch(/t\(["']checkout\.update["']\)/);
  });

  it('places responsive removal controls at the desktop bottom-right and beside the mobile price', () => {
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(workspace).toContain('className="hidden sm:block"');
    expect(workspace).toContain('className="inline-flex h-9 w-9 shrink-0');
    expect(workspace).toContain('className="size-5 shrink-0" strokeWidth={2.25}');
    expect(workspace).toContain('<Trash2 aria-hidden="true" size={15} />');
    expect(workspace).toMatch(/aria-label=\{t\(["']checkout\.remove["']\)\}/);
  });

  it('persists drag ordering from the draft through the immutable invoice', () => {
    const schema = source('prisma/schema.prisma');
    const service = source('src/services/checkout.ts');
    const action = source('src/actions/checkout.ts');
    const repository = source('src/repositories/prisma/index.ts');
    const workspace = source('src/components/checkout/CheckoutWorkspace.tsx');
    expect(schema).toContain('position        Int      @default(0)');
    expect(service).toContain('reorderCartItems');
    expect(service).toContain('position: item.position');
    expect(action).toContain("action: 'cart.items_reorder'");
    expect(repository).toContain("orderBy: [{ position: 'asc' }");
    expect(workspace).toContain('cursor-grab active:cursor-grabbing');
    expect(workspace).toContain('data-cart-line-id={line.id}');
    expect(workspace).toMatch(/closest\(\s*["']input, button, select, textarea, a, label["']/);
    expect(workspace).toContain('onPointerMove');
    expect(workspace).toContain('element.animate(');
    expect(workspace).toContain('duration: 420');
    expect(workspace).toContain('element.offsetHeight / 2');
    expect(workspace).not.toContain('document.elementFromPoint');
    expect(workspace).toContain("prefers-reduced-motion: reduce");
    expect(workspace).toMatch(/event\.key === ["']ArrowUp["']/);
    expect(workspace).toMatch(/event\.key === ["']ArrowDown["']/);
  });
});

describe('Phase 8 stock and invoice invariants', () => {
  const checkout = source('src/services/checkout.ts');

  it('completes the sale inside one repository transaction with concurrency guards', () => {
    expect(checkout).toContain('return db.transaction(async (tx)');
    expect(checkout).toContain("transitionStatus(unit.id, 'IN_STOCK', 'SOLD'");
    expect(checkout).toContain('tx.products._applyQuantityDelta');
    expect(checkout).toContain('tx.movements.record');
    expect(checkout).toContain('tx.sales.createItem');
    expect(checkout).toContain('await tx.carts.delete(cart.id)');
  });

  it('keeps SaleItem lean and derives movement-owned invoice values', () => {
    const schema = source('prisma/schema.prisma');
    const saleItemModel = schema.slice(schema.indexOf('model SaleItem'));
    const repository = source('src/repositories/prisma/index.ts');
    const migration = source('prisma/migrations/20260728215000_simplify_sale_items/migration.sql');

    expect(saleItemModel).toContain('movementId String');
    expect(saleItemModel).toContain('movement   StockMovement');
    expect(saleItemModel).toContain('listUnitPrice');
    expect(saleItemModel).not.toContain('productId');
    expect(saleItemModel).not.toContain('unitId');
    expect(saleItemModel).not.toContain('actualUnitPrice');
    expect(saleItemModel).not.toContain('unitCost');
    expect(saleItemModel).not.toContain('lineTotal');
    expect(repository).toContain('const quantity = Math.abs(row.movement.quantity)');
    expect(repository).toContain('actualUnitPrice: row.movement.unitPrice');
    expect(migration).toContain('DROP COLUMN "unitCost"');
  });

  it('provides A4/PDF and 80 mm thermal invoice output', () => {
    const invoice = source('src/components/invoices/InvoiceView.tsx');
    const css = source('src/app/globals.css');
    expect(invoice).toContain('A4 invoice');
    expect(invoice).toContain('80 mm thermal');
    expect(invoice).toContain('/pdf');
    expect(invoice).toContain('flex flex-wrap items-center gap-2');
    expect(css).toContain('@page invoice-a4');
    expect(css).toContain('@page invoice-thermal');
    expect(css).toContain('width: min(210mm, 100%)');
    expect(css).toContain('container: invoice-preview / inline-size');
    expect(invoice).toContain('className="invoice-preview-viewport"');
    expect(invoice).toContain('aria-label="Scrollable invoice preview"');
    expect(css).toContain('.invoice-preview-viewport');
    expect(css).toContain('overflow: auto');
    expect(css).toContain('@container invoice-preview (max-width: 767px)');
    expect(css).toContain("width: min(72mm, 100%)");
    expect(css).toContain('width: 210mm');
    expect(css).toContain('min-height: 297mm');
  });

  it('filters invoices at the repository boundary instead of in the browser', () => {
    const page = source('src/app/(dashboard)/invoices/page.tsx');
    const register = source('src/components/invoices/InvoiceRegister.tsx');
    const repositories = source('src/repositories/types.ts');
    const prisma = source('src/repositories/prisma/index.ts');
    expect(page).toContain('await db.sales.search(filters, 500)');
    expect(register).toContain('name="paymentStatus"');
    expect(register).toContain('name="paymentMethod"');
    expect(register).toContain('name="customerType"');
    expect(register).toContain("t('invoices.walkInOnly')");
    expect(register).toContain('name="minTotal"');
    expect(register).toContain('name="maxTotal"');
    expect(register).toContain('useTransition');
    expect(register).toContain("t('loading.filterInvoices')");
    expect(register).toContain('setValues(next)');
    expect(register).toContain('setFiltering(true)');
    expect(register).toContain('setFiltering(false)');
    expect(page).toContain('resultVersion={crypto.randomUUID()}');
    expect(register).toContain('window.history.pushState');
    expect(register).toContain('router.refresh()');
    expect(source('src/app/(dashboard)/invoices/loading.tsx')).toContain('Loading invoices…');
    expect(repositories).toContain('search(filters: SaleFilters');
    expect(prisma).toContain('{ invoiceNumber: { contains: query');
    expect(prisma).toContain("filters.customerType === 'WALK_IN'");
    expect(prisma).toContain('total: filters.minTotal');
  });

  it('keeps returns and refunds out of the first implementation', () => {
    const schema = source('prisma/schema.prisma');
    expect(schema).not.toContain('model SaleReturn');
    expect(schema).not.toContain('model ReturnItem');
    expect(source('src/actions/checkout.ts')).not.toContain('refund');
  });

  it('uses Checkout as the only user-facing sale path', () => {
    const stockAction = source('src/actions/stock.ts');
    const stockForm = source('src/components/stock/StockOutForm.tsx');
    expect(stockAction).toContain("if (reason === 'SALE')");
    expect(stockAction).toContain('Use Checkout for every sale');
    expect(stockForm).not.toContain("['SALE', 'Sold to a customer']");
    expect(checkout).toContain("reason: 'SALE'");
  });
});
