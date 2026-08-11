import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  UnitStatus,
  User,
  WarrantyClaim,
  WarrantyClaimEvent,
  SupplierWarrantyCase,
  Customer,
  CartDraft,
  CartItem,
  Sale,
  SaleItem,
  InvoiceItem,
  UsedDeviceAcquisition,
  RefurbishmentExpense,
  SupplierReturn,
  ExpenseCategory,
  OperatingExpense,
} from '@/domain/types';
import type { Paisa } from '@/lib/money';
import type {
  BrandRepository,
  CategoryRepository,
  MovementFilters,
  ProductRepository,
  ProductUnitRepository,
  Repositories,
  StockMovementRepository,
  SupplierRepository,
  UserRepository,
  WarrantyRepository,
  CustomerRepository,
  CartRepository,
  SaleRepository,
  UsedDeviceAcquisitionRepository,
  RefurbishmentExpenseRepository,
  SupplierReturnRepository,
  ExpenseCategoryRepository,
  OperatingExpenseRepository,
} from '@/repositories/types';
import { nowIso, readAll, withLock, writeAll } from './store';
import { dhakaYear } from '@/lib/time';

const categories: CategoryRepository = {
  async findAll(filters) {
    const rows = await readAll<Category>('categories');
    return filters?.activeOnly ? rows.filter((row) => row.isActive) : rows;
  },
  async findById(id) {
    return (await readAll<Category>('categories')).find((c) => c.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Category>('categories');
      const row: Category = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('categories', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Category>('categories');
      const index = rows.findIndex((item) => item.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Category not found');
      const row: Category = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('categories', copy);
      return row;
    });
  },
};

const brands: BrandRepository = {
  async findAll(filters) {
    const rows = await readAll<Brand>('brands');
    return filters?.activeOnly ? rows.filter((row) => row.isActive) : rows;
  },
  async findById(id) {
    return (await readAll<Brand>('brands')).find((b) => b.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Brand>('brands');
      const row: Brand = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('brands', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Brand>('brands');
      const index = rows.findIndex((item) => item.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Brand not found');
      const row: Brand = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('brands', copy);
      return row;
    });
  },
};

const suppliers: SupplierRepository = {
  findAll: () => readAll<Supplier>('suppliers'),
  async findById(id) {
    return (await readAll<Supplier>('suppliers')).find((s) => s.id === id) ?? null;
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Supplier>('suppliers');
      const row: Supplier = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('suppliers', [...rows, row]);
      return row;
    });
  },
  async update(id, data) {
    return withLock(async () => {
      const rows = await readAll<Supplier>('suppliers');
      const index = rows.findIndex((supplier) => supplier.id === id);
      const existing = rows[index];
      if (!existing) throw new Error('Supplier not found');
      const row: Supplier = { ...existing, ...data, updatedAt: nowIso() };
      const copy = [...rows];
      copy[index] = row;
      await writeAll('suppliers', copy);
      return row;
    });
  },
};

const users: UserRepository = {
  findAll: () => readAll<User>('users'),
  async findById(id) {
    return (await readAll<User>('users')).find((u) => u.id === id) ?? null;
  },
  async findByEmail(email) {
    const lower = email.toLowerCase();
    return (
      (await readAll<User>('users')).find((u) => u.email.toLowerCase() === lower) ?? null
    );
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<User>('users');
      const row: User = { ...data, createdAt: nowIso(), updatedAt: nowIso() };
      await writeAll('users', [...rows, row]);
      return row;
    });
  },
};

const products: ProductRepository = {
  async findAll(filters) {
    const rows = await readAll<Product>('products');
    return rows.filter(
      (p) =>
        (!filters?.categoryId || p.categoryId === filters.categoryId) &&
        (!filters?.brandId || p.brandId === filters.brandId) &&
        (!filters?.activeOnly || p.isActive),
    );
  },
  async findById(id) {
    return (await readAll<Product>('products')).find((p) => p.id === id) ?? null;
  },
  async findBySku(sku) {
    const lower = sku.toLowerCase();
    return (
      (await readAll<Product>('products')).find((p) => p.sku.toLowerCase() === lower) ?? null
    );
  },
  async findByBarcode(barcode) {
    const lower = barcode.toLowerCase().trim();
    return (await readAll<Product>('products')).find(
      (product) => product.barcode?.toLowerCase() === lower,
    ) ?? null;
  },
  /**
   * Phase 0 search: naive substring match. Phase 1 replaces this with pg_trgm +
   * GIN (PLAN.md §7). The *interface* is identical, so nothing above changes.
   */
  async search(query, limit = 10) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const rows = await readAll<Product>('products');
    return rows
      .filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode?.toLowerCase().includes(q) ?? false) ||
            (p.model?.toLowerCase().includes(q) ?? false)),
      )
      .slice(0, limit);
  },
  async create(data) {
    return withLock(async () => {
      const rows = await readAll<Product>('products');
      if (rows.some((p) => p.sku.toLowerCase() === data.sku.toLowerCase())) {
        throw new Error(`Product code (SKU) already exists: ${data.sku}`);
      }
      await writeAll('products', [...rows, data]);
      return data;
    });
  },
  async update(id, patch) {
    return withLock(async () => {
      const rows = await readAll<Product>('products');
      const idx = rows.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Product not found: ${id}`);
      const next: Product = { ...rows[idx]!, ...patch, updatedAt: nowIso() };
      const copy = [...rows];
      copy[idx] = next;
      await writeAll('products', copy);
      return next;
    });
  },
  async softDelete(id) {
    await this.update(id, { isActive: false });
  },
  async _applyQuantityDelta(id, delta, newAvgCost?: Paisa) {
    const rows = await readAll<Product>('products');
    const idx = rows.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Product not found: ${id}`);
    const current = rows[idx]!;
    const nextQty = current.quantityOnHand + delta;

    // Mirrors the CHECK constraint in PLAN.md §7. Fail loudly, don't go negative.
    if (nextQty < 0) {
      throw new Error(
        `Insufficient stock for ${current.sku}: have ${current.quantityOnHand}, tried to remove ${-delta}`,
      );
    }

    const next: Product = {
      ...current,
      quantityOnHand: nextQty,
      avgCostPrice: newAvgCost ?? current.avgCostPrice,
      updatedAt: nowIso(),
    };
    const copy = [...rows];
    copy[idx] = next;
    await writeAll('products', copy);
    return next;
  },
};

const units: ProductUnitRepository = {
  async findById(id) {
    return (await readAll<ProductUnit>('product-units')).find((u) => u.id === id) ?? null;
  },
  async findBySerial(serialNo) {
    const lower = serialNo.toLowerCase().trim();
    return (
      (await readAll<ProductUnit>('product-units')).find(
        (u) => u.serialNo.toLowerCase() === lower,
      ) ?? null
    );
  },
  async findBySerials(serialNos) {
    const wanted = new Set(serialNos.map((value) => value.toLowerCase().trim()).filter(Boolean));
    return (await readAll<ProductUnit>('product-units')).filter(
      (unit) => wanted.has(unit.serialNo.toLowerCase()),
    );
  },
  async findByProduct(productId, status) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && (!status || u.status === status));
  },
  async countInStock(productId) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && u.status === 'IN_STOCK').length;
  },
  async findAllInStock() {
    return (await readAll<ProductUnit>('product-units'))
      .filter((unit) => unit.status === 'IN_STOCK')
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  },
  async createMany(newUnits) {
    const rows = await readAll<ProductUnit>('product-units');
    const existing = new Set(rows.map((u) => u.serialNo.toLowerCase()));
    for (const u of newUnits) {
      if (existing.has(u.serialNo.toLowerCase())) {
        throw new Error(`Serial number already in the system: ${u.serialNo}`);
      }
    }
    await writeAll('product-units', [...rows, ...newUnits]);
    return newUnits;
  },
  async updateDetails(id, patch) {
    const rows = await readAll<ProductUnit>('product-units');
    const index = rows.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error(`Unit not found: ${id}`);
    const updated = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows];
    copy[index] = updated;
    await writeAll('product-units', copy);
    return updated;
  },
  /**
   * ⚠️ THE CONCURRENCY GUARD. PLAN.md §8.1.
   * If the unit is not in `expectedStatus`, this throws instead of overwriting.
   * Two staff selling the same IMEI: the second one fails. Do not "fix" this.
   * In Prisma it becomes: where: { id, status: expectedStatus }.
   */
  async transitionStatus(id, expectedStatus, next, patch) {
    const rows = await readAll<ProductUnit>('product-units');
    const idx = rows.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error(`Unit not found: ${id}`);

    const current = rows[idx]!;
    if (current.status !== expectedStatus) {
      throw new Error(
        `Unit ${current.serialNo} is ${current.status}, expected ${expectedStatus}. ` +
          `Someone may have just processed it.`,
      );
    }

    const updated: ProductUnit = { ...current, ...patch, status: next, updatedAt: nowIso() };
    const copy = [...rows];
    copy[idx] = updated;
    await writeAll('product-units', copy);
    return updated;
  },
};

const movements: StockMovementRepository = {
  async record(movement) {
    if (movement.quantity === 0) {
      throw new Error('A zero-quantity movement is meaningless'); // mirrors CHECK qty_nonzero
    }
    const rows = await readAll<StockMovement>('stock-movements');
    await writeAll('stock-movements', [...rows, movement]);
    return movement;
  },
  async findById(id) {
    return (await readAll<StockMovement>('stock-movements')).find((m) => m.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (
      (await readAll<StockMovement>('stock-movements')).find(
        (m) => m.idempotencyKey === key,
      ) ?? null
    );
  },
  async findByProduct(productId) {
    const rows = await readAll<StockMovement>('stock-movements');
    return rows
      .filter((m) => m.productId === productId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async findByDateRange(from, to, filters?: MovementFilters) {
    const rows = await readAll<StockMovement>('stock-movements');
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    return rows.filter(
      (m) =>
        m.createdAt >= fromIso &&
        m.createdAt <= toIso &&
        (!filters?.productId || m.productId === filters.productId) &&
        (!filters?.type || m.type === filters.type) &&
        (!filters?.reason || m.reason === filters.reason) &&
        (!filters?.actorId || m.actorId === filters.actorId),
    );
  },
  async sumQuantity(productId) {
    const rows = await readAll<StockMovement>('stock-movements');
    return rows
      .filter((m) => m.productId === productId)
      .reduce((sum, m) => sum + m.quantity, 0);
  },
};

const warranties: WarrantyRepository = {
  async nextClaimNumber(now) {
    const year = now.getUTCFullYear();
    const prefix = `RMA-${year}-`;
    const rows = await readAll<WarrantyClaim>('warranty-claims');
    const next = rows.reduce((max, claim) => claim.claimNumber.startsWith(prefix)
      ? Math.max(max, Number(claim.claimNumber.slice(prefix.length)) || 0)
      : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(filters) {
    return (await readAll<WarrantyClaim>('warranty-claims'))
      .filter((claim) => (!filters?.status || claim.status === filters.status)
        && (!filters?.unitId || claim.unitId === filters.unitId)
        && (!filters?.assignedToId || claim.assignedToId === filters.assignedToId))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  },
  async findById(id) {
    return (await readAll<WarrantyClaim>('warranty-claims')).find((claim) => claim.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<WarrantyClaim>('warranty-claims')).find((claim) => claim.idempotencyKey === key) ?? null;
  },
  async findActiveByUnit(unitId) {
    const terminal = new Set(['REJECTED', 'REPLACED', 'COMPLETED', 'CANCELLED']);
    return (await readAll<WarrantyClaim>('warranty-claims')).find(
      (claim) => claim.unitId === unitId && !terminal.has(claim.status),
    ) ?? null;
  },
  async create(claim) {
    await writeAll('warranty-claims', [...await readAll<WarrantyClaim>('warranty-claims'), claim]);
    return claim;
  },
  async transition(id, expectedStatus, patch) {
    const rows = await readAll<WarrantyClaim>('warranty-claims');
    const index = rows.findIndex((claim) => claim.id === id && claim.status === expectedStatus);
    if (index < 0) throw new Error('Claim changed while you were working. Refresh and try again.');
    const updated = { ...rows[index]!, ...patch, id, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('warranty-claims', copy);
    return updated;
  },
  async findEvents(claimId) {
    return (await readAll<WarrantyClaimEvent>('warranty-claim-events'))
      .filter((event) => event.claimId === claimId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async findEventByIdempotencyKey(key) {
    return (await readAll<WarrantyClaimEvent>('warranty-claim-events')).find((event) => event.idempotencyKey === key) ?? null;
  },
  async createEvent(event) {
    await writeAll('warranty-claim-events', [...await readAll<WarrantyClaimEvent>('warranty-claim-events'), event]);
    return event;
  },
  async findSupplierCase(claimId) {
    return (await readAll<SupplierWarrantyCase>('supplier-warranty-cases')).find((item) => item.claimId === claimId) ?? null;
  },
  async upsertSupplierCase(value) {
    const rows = await readAll<SupplierWarrantyCase>('supplier-warranty-cases');
    const index = rows.findIndex((item) => item.claimId === value.claimId);
    const copy = [...rows];
    if (index < 0) copy.push(value); else copy[index] = value;
    await writeAll('supplier-warranty-cases', copy);
    return value;
  },
};

const customers: CustomerRepository = {
  async findAll(activeOnly = false) {
    return (await readAll<Customer>('customers'))
      .filter((item) => !activeOnly || item.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async findById(id) {
    return (await readAll<Customer>('customers')).find((item) => item.id === id) ?? null;
  },
  async findByNormalizedPhone(phoneNormalized) {
    return (await readAll<Customer>('customers'))
      .find((item) => item.phoneNormalized === phoneNormalized) ?? null;
  },
  async search(query, limit = 20) {
    const term = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    return (await readAll<Customer>('customers'))
      .filter((item) => item.isActive && (
        item.name.toLowerCase().includes(term)
        || item.phone?.includes(term)
        || Boolean(digits && item.phoneNormalized?.includes(digits))
      ))
      .slice(0, limit);
  },
  async create(value) {
    const rows = await readAll<Customer>('customers');
    if (value.phoneNormalized && rows.some((item) => item.phoneNormalized === value.phoneNormalized)) {
      throw new Error('A customer with this phone number already exists.');
    }
    await writeAll('customers', [...rows, value]);
    return value;
  },
};

const carts: CartRepository = {
  async findByActor(actorId) {
    return (await readAll<CartDraft>('cart-drafts')).find((item) => item.actorId === actorId) ?? null;
  },
  async findById(id) {
    return (await readAll<CartDraft>('cart-drafts')).find((item) => item.id === id) ?? null;
  },
  async create(value) {
    const rows = await readAll<CartDraft>('cart-drafts');
    if (rows.some((item) => item.actorId === value.actorId)) {
      throw new Error('This user already has a draft cart.');
    }
    await writeAll('cart-drafts', [...rows, value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<CartDraft>('cart-drafts');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Draft cart not found.');
    const next = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = next;
    await writeAll('cart-drafts', copy);
    return next;
  },
  async findItems(cartId) {
    return (await readAll<CartItem>('cart-items'))
      .filter((item) => item.cartId === cartId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  },
  async findItem(id) {
    return (await readAll<CartItem>('cart-items')).find((item) => item.id === id) ?? null;
  },
  async createItem(value) {
    const rows = await readAll<CartItem>('cart-items');
    await writeAll('cart-items', [...rows, value]);
    return value;
  },
  async updateItem(id, patch) {
    const rows = await readAll<CartItem>('cart-items');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Cart item not found.');
    const next = { ...rows[index]!, ...patch, updatedAt: nowIso() };
    const copy = [...rows]; copy[index] = next;
    await writeAll('cart-items', copy);
    return next;
  },
  async deleteItem(id) {
    await writeAll('cart-items', (await readAll<CartItem>('cart-items')).filter((item) => item.id !== id));
  },
  async delete(id) {
    await writeAll('cart-items', (await readAll<CartItem>('cart-items')).filter((item) => item.cartId !== id));
    await writeAll('cart-drafts', (await readAll<CartDraft>('cart-drafts')).filter((item) => item.id !== id));
  },
};

const sales: SaleRepository = {
  async nextInvoiceNumber(now) {
    const year = dhakaYear(now);
    const prefix = `INV-${year}-`;
    const next = (await readAll<Sale>('sales')).reduce((max, item) =>
      item.invoiceNumber.startsWith(prefix)
        ? Math.max(max, Number(item.invoiceNumber.slice(prefix.length)) || 0)
        : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(limit = 100) {
    return (await readAll<Sale>('sales'))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, limit);
  },
  async search(filters, limit = 200) {
    const query = filters.query?.trim().toLowerCase();
    return (await readAll<Sale>('sales'))
      .filter((item) => (
        (!filters.status || item.status === filters.status)
        && (!filters.from || new Date(item.completedAt) >= filters.from)
        && (!filters.to || new Date(item.completedAt) <= filters.to)
        && (
          !filters.customerType
          || (filters.customerType === 'WALK_IN' ? item.customerId === null : item.customerId !== null)
        )
        && (!filters.paymentStatus || item.paymentStatus === filters.paymentStatus)
        && (!filters.paymentMethod || item.paymentMethod === filters.paymentMethod)
        && (filters.minTotal === undefined || item.total >= filters.minTotal)
        && (filters.maxTotal === undefined || item.total <= filters.maxTotal)
        && (!query || [
          item.invoiceNumber,
          item.customerName,
          item.customerPhone,
          item.reference,
          item.actorName,
        ].some((value) => value?.toLowerCase().includes(query)))
      ))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  },
  async findById(id) {
    return (await readAll<Sale>('sales')).find((item) => item.id === id) ?? null;
  },
  async findByInvoiceNumber(invoiceNumber) {
    return (await readAll<Sale>('sales')).find((item) => item.invoiceNumber === invoiceNumber) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<Sale>('sales')).find((item) => item.idempotencyKey === key) ?? null;
  },
  async findByCustomer(customerId) {
    return (await readAll<Sale>('sales'))
      .filter((item) => item.customerId === customerId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },
  async create(value) {
    await writeAll('sales', [...await readAll<Sale>('sales'), value]);
    return value;
  },
  async markVoided(id, patch) {
    const rows = await readAll<Sale>('sales');
    const index = rows.findIndex((item) => item.id === id && item.status === 'COMPLETED');
    if (index < 0) throw new Error('This invoice is no longer eligible to be voided.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('sales', copy);
    return updated;
  },
  async createItem(value) {
    await writeAll('sale-items', [...await readAll<SaleItem>('sale-items'), value]);
    return value;
  },
  async findItems(saleId) {
    const [items, movementRows] = await Promise.all([
      readAll<SaleItem>('sale-items'),
      readAll<StockMovement>('stock-movements'),
    ]);
    const movementById = new Map(movementRows.map((movement) => [movement.id, movement]));
    return items
      .filter((item) => item.saleId === saleId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((item): InvoiceItem => {
      const movement = movementById.get(item.movementId);
      if (!movement || movement.unitPrice === null) {
        throw new Error(`Invoice movement ${item.movementId} has no selling price.`);
      }
      const quantity = Math.abs(movement.quantity);
      return {
        ...item,
        quantity,
        actualUnitPrice: movement.unitPrice,
        discount: (item.listUnitPrice - movement.unitPrice) * quantity,
        lineTotal: movement.unitPrice * quantity,
      };
      });
  },
};

const usedDeviceAcquisitions: UsedDeviceAcquisitionRepository = {
  async findById(id) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.id === id) ?? null;
  },
  async findByIdempotencyKey(key) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.idempotencyKey === key) ?? null;
  },
  async findByUnit(unitId) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .filter((item) => item.unitId === unitId)
      .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  },
  async findBySale(saleId) {
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .find((item) => item.tradeInSaleId === saleId) ?? null;
  },
  async findAvailableTradeIns() {
    const claimedByDraft = new Set((await readAll<CartDraft>('cart-drafts')).map((cart) => cart.tradeInAcquisitionId).filter(Boolean));
    return (await readAll<UsedDeviceAcquisition>('used-device-acquisitions'))
      .filter((item) => item.type === 'TRADE_IN' && item.tradeInSaleId === null && !claimedByDraft.has(item.id))
      .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt));
  },
  async create(value) {
    const rows = await readAll<UsedDeviceAcquisition>('used-device-acquisitions');
    await writeAll('used-device-acquisitions', [...rows, value]);
    return value;
  },
  async attachToSale(id, saleId) {
    const rows = await readAll<UsedDeviceAcquisition>('used-device-acquisitions');
    const index = rows.findIndex((item) => item.id === id);
    const current = rows[index];
    if (!current || current.type !== 'TRADE_IN' || current.tradeInSaleId) {
      throw new Error('That trade-in has already been used or is unavailable.');
    }
    const updated = { ...current, tradeInSaleId: saleId };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('used-device-acquisitions', copy);
    return updated;
  },
};

const refurbishmentExpenses: RefurbishmentExpenseRepository = {
  async findByUnit(unitId) {
    return (await readAll<RefurbishmentExpense>('refurbishment-expenses'))
      .filter((item) => item.unitId === unitId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async create(value) {
    const rows = await readAll<RefurbishmentExpense>('refurbishment-expenses');
    await writeAll('refurbishment-expenses', [...rows, value]);
    return value;
  },
};

const supplierReturns: SupplierReturnRepository = {
  async nextReturnNumber(now) {
    const year = dhakaYear(now);
    const prefix = `SRT-${year}-`;
    const next = (await readAll<SupplierReturn>('supplier-returns')).reduce((maximum, item) =>
      item.returnNumber.startsWith(prefix)
        ? Math.max(maximum, Number(item.returnNumber.slice(prefix.length)) || 0)
        : maximum, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll() {
    return (await readAll<SupplierReturn>('supplier-returns'))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  },
  async findById(id) {
    return (await readAll<SupplierReturn>('supplier-returns')).find((item) => item.id === id) ?? null;
  },
  async findByMovement(movementId) {
    return (await readAll<SupplierReturn>('supplier-returns')).find((item) => item.movementId === movementId) ?? null;
  },
  async create(value) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    await writeAll('supplier-returns', [...rows, value]);
    return value;
  },
  async settle(id, patch) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    const index = rows.findIndex((item) => item.id === id && item.status === 'PENDING');
    if (index < 0) throw new Error('This supplier return has already been settled or is unavailable.');
    const updated: SupplierReturn = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('supplier-returns', copy);
    return updated;
  },
  async cancel(id, patch) {
    const rows = await readAll<SupplierReturn>('supplier-returns');
    const index = rows.findIndex((item) => item.id === id && item.status === 'PENDING');
    if (index < 0) throw new Error('This supplier return is no longer pending.');
    const updated: SupplierReturn = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('supplier-returns', copy);
    return updated;
  },
};

const expenseCategories: ExpenseCategoryRepository = {
  async findAll() {
    return (await readAll<ExpenseCategory>('expense-categories'))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  },
  async findById(id) {
    return (await readAll<ExpenseCategory>('expense-categories')).find((item) => item.id === id) ?? null;
  },
  async create(value) {
    const rows = await readAll<ExpenseCategory>('expense-categories');
    if (rows.some((item) => item.name.toLowerCase() === value.name.toLowerCase())) {
      throw new Error('An expense category with this name already exists.');
    }
    await writeAll('expense-categories', [...rows, value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<ExpenseCategory>('expense-categories');
    const index = rows.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Expense category not found.');
    if (rows.some((item) => item.id !== id && item.name.toLowerCase() === patch.name.toLowerCase())) {
      throw new Error('An expense category with this name already exists.');
    }
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('expense-categories', copy);
    return updated;
  },
};

const operatingExpenses: OperatingExpenseRepository = {
  async nextExpenseNumber(now) {
    const year = dhakaYear(now);
    const prefix = `EXP-${year}-`;
    const next = (await readAll<OperatingExpense>('operating-expenses')).reduce((max, item) =>
      item.expenseNumber.startsWith(prefix)
        ? Math.max(max, Number(item.expenseNumber.slice(prefix.length)) || 0)
        : max, 0) + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },
  async findAll(filters, limit = 500) {
    const query = filters?.query?.trim().toLowerCase();
    const rows = (await readAll<OperatingExpense>('operating-expenses')).filter((item) => (
      (!filters?.from || new Date(item.expenseDate) >= filters.from)
      && (!filters?.to || new Date(item.expenseDate) <= filters.to)
      && (!filters?.categoryId || item.categoryId === filters.categoryId)
      && (!filters?.paymentMethod || item.paymentMethod === filters.paymentMethod)
      && (!filters?.recordedById || item.recordedById === filters.recordedById)
      && (!filters?.status || item.status === filters.status)
      && (filters?.minAmount === undefined || item.amount >= filters.minAmount)
      && (filters?.maxAmount === undefined || item.amount <= filters.maxAmount)
      && (!query || [item.expenseNumber, item.description, item.paidTo, item.reference]
        .some((value) => value?.toLowerCase().includes(query)))
    ));
    rows.sort((a, b) => {
      if (filters?.order === 'oldest') return a.expenseDate.localeCompare(b.expenseDate);
      if (filters?.order === 'amount-desc') return b.amount - a.amount;
      if (filters?.order === 'amount-asc') return a.amount - b.amount;
      return b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt);
    });
    return rows.slice(0, Math.max(1, Math.min(limit, 2_000)));
  },
  async findById(id) {
    return (await readAll<OperatingExpense>('operating-expenses')).find((item) => item.id === id) ?? null;
  },
  async create(value) {
    await writeAll('operating-expenses', [...await readAll<OperatingExpense>('operating-expenses'), value]);
    return value;
  },
  async update(id, patch) {
    const rows = await readAll<OperatingExpense>('operating-expenses');
    const index = rows.findIndex((item) => item.id === id && item.status === 'ACTIVE');
    if (index < 0) throw new Error('Only an active expense can be edited.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('operating-expenses', copy);
    return updated;
  },
  async void(id, patch) {
    const rows = await readAll<OperatingExpense>('operating-expenses');
    const index = rows.findIndex((item) => item.id === id && item.status === 'ACTIVE');
    if (index < 0) throw new Error('This expense is already voided or unavailable.');
    const updated = { ...rows[index]!, ...patch };
    const copy = [...rows]; copy[index] = updated;
    await writeAll('operating-expenses', copy);
    return updated;
  },
};

export const jsonRepositories: Repositories = {
  categories,
  brands,
  suppliers,
  users,
  products,
  units,
  movements,
  warranties,
  customers,
  carts,
  sales,
  usedDeviceAcquisitions,
  refurbishmentExpenses,
  supplierReturns,
  expenseCategories,
  operatingExpenses,
  transaction: (fn) => withLock(() => fn(jsonRepositories)),
};

export type { UnitStatus };
