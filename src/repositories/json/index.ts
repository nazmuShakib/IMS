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
} from '@/repositories/types';
import { nowIso, readAll, withLock, writeAll } from './store';

const categories: CategoryRepository = {
  findAll: () => readAll<Category>('categories'),
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
};

const brands: BrandRepository = {
  findAll: () => readAll<Brand>('brands'),
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
        throw new Error(`SKU already exists: ${data.sku}`);
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
  async findByProduct(productId, status) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && (!status || u.status === status));
  },
  async countInStock(productId) {
    const rows = await readAll<ProductUnit>('product-units');
    return rows.filter((u) => u.productId === productId && u.status === 'IN_STOCK').length;
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

export const jsonRepositories: Repositories = {
  categories,
  brands,
  suppliers,
  users,
  products,
  units,
  movements,
  warranties,
  transaction: (fn) => withLock(() => fn(jsonRepositories)),
};

export type { UnitStatus };
