import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  UnitStatus,
  User,
  MovementReason,
  MovementType,
  WarrantyClaim,
  WarrantyClaimEvent,
  SupplierWarrantyCase,
  RmaStatus,
  Customer,
  CartDraft,
  CartItem,
  Sale,
  SaleItem,
  InvoiceItem,
  PaymentMethod,
  PaymentStatus,
} from '@/domain/types';
import type { Paisa } from '@/lib/money';

/**
 * THE SEAM. PLAN.md §13.2.
 *
 * Everything above this line (services, server actions, UI) imports only from
 * `@/repositories`. Nothing above this line knows whether the data lives in JSON
 * files or in Postgres. That is what makes Phase 1 a config change instead of a
 * rewrite.
 *
 * Every method is async EVEN IN THE JSON IMPLEMENTATION, so that no call site
 * changes when Prisma takes over.
 */

export interface CategoryRepository {
  findAll(filters?: { activeOnly?: boolean }): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  create(data: Omit<Category, 'createdAt' | 'updatedAt'>): Promise<Category>;
  update(
    id: string,
    data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Category>;
}

export interface BrandRepository {
  findAll(filters?: { activeOnly?: boolean }): Promise<Brand[]>;
  findById(id: string): Promise<Brand | null>;
  create(data: Omit<Brand, 'createdAt' | 'updatedAt'>): Promise<Brand>;
  update(
    id: string,
    data: Partial<Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Brand>;
}

export interface SupplierRepository {
  findAll(): Promise<Supplier[]>;
  findById(id: string): Promise<Supplier | null>;
  create(data: Omit<Supplier, 'createdAt' | 'updatedAt'>): Promise<Supplier>;
  update(
    id: string,
    data: Partial<Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Supplier>;
}

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User>;
}

export interface ProductRepository {
  findAll(filters?: { categoryId?: string; brandId?: string; activeOnly?: boolean }): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findByBarcode(barcode: string): Promise<Product | null>;
  search(query: string, limit?: number): Promise<Product[]>;
  create(data: Product): Promise<Product>;
  update(
    id: string,
    data: Partial<Omit<Product, 'id' | 'trackingType' | 'quantityOnHand' | 'avgCostPrice' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Product>;
  softDelete(id: string): Promise<void>;

  /**
   * ⚠️ Cache maintenance for QUANTITY products ONLY. Called exclusively from
   * inside the stock service's transaction, never from a route or UI.
   *
   * ⚠️ NOTE WHAT IS *NOT* HERE: there is deliberately no `adjustStock(id, delta)`
   * public method. Stock may only move via StockMovementRepository.record().
   * If a caller can change stock without writing a ledger row, the ledger is a lie.
   * See PLAN.md §5.1.
   */
  _applyQuantityDelta(id: string, delta: number, newAvgCost?: Paisa): Promise<Product>;
}

export interface ProductUnitRepository {
  findById(id: string): Promise<ProductUnit | null>;
  findBySerial(serialNo: string): Promise<ProductUnit | null>;
  findByProduct(productId: string, status?: UnitStatus): Promise<ProductUnit[]>;
  countInStock(productId: string): Promise<number>;
  findAllInStock(): Promise<ProductUnit[]>;
  createMany(units: ProductUnit[]): Promise<ProductUnit[]>;

  /**
   * Optimistic concurrency: succeeds ONLY if the unit is currently in `expectedStatus`.
   * Throws otherwise. This is what stops two staff selling the same IMEI at once.
   * In Prisma this becomes `where: { id, status: expectedStatus }`. PLAN.md §8.1.
   */
  transitionStatus(
    id: string,
    expectedStatus: UnitStatus,
    next: UnitStatus,
    patch?: Partial<ProductUnit>,
  ): Promise<ProductUnit>;
}

export interface CustomerRepository {
  findAll(activeOnly?: boolean): Promise<Customer[]>;
  findById(id: string): Promise<Customer | null>;
  findByNormalizedPhone(phoneNormalized: string): Promise<Customer | null>;
  search(query: string, limit?: number): Promise<Customer[]>;
  create(value: Customer): Promise<Customer>;
}

export interface CartRepository {
  findByActor(actorId: string): Promise<CartDraft | null>;
  findById(id: string): Promise<CartDraft | null>;
  create(value: CartDraft): Promise<CartDraft>;
  update(id: string, patch: Partial<Pick<CartDraft, 'customerId' | 'paymentMethod' | 'paymentStatus' | 'reference' | 'note'>>): Promise<CartDraft>;
  findItems(cartId: string): Promise<CartItem[]>;
  findItem(id: string): Promise<CartItem | null>;
  createItem(value: CartItem): Promise<CartItem>;
  updateItem(id: string, patch: Pick<CartItem, 'quantity' | 'actualUnitPrice'>): Promise<CartItem>;
  deleteItem(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SaleRepository {
  nextInvoiceNumber(now: Date): Promise<string>;
  findAll(limit?: number): Promise<Sale[]>;
  search(filters: SaleFilters, limit?: number): Promise<Sale[]>;
  findById(id: string): Promise<Sale | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Sale | null>;
  findByIdempotencyKey(key: string): Promise<Sale | null>;
  findByCustomer(customerId: string): Promise<Sale[]>;
  create(value: Sale): Promise<Sale>;
  createItem(value: SaleItem): Promise<SaleItem>;
  findItems(saleId: string): Promise<InvoiceItem[]>;
}

export interface SaleFilters {
  query?: string;
  from?: Date;
  to?: Date;
  customerType?: 'WALK_IN' | 'REGISTERED';
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  minTotal?: Paisa;
  maxTotal?: Paisa;
}

export interface MovementFilters {
  productId?: string;
  type?: MovementType;
  reason?: MovementReason;
  actorId?: string;
}

export interface StockMovementRepository {
  /** Append-only. There is no update() and no delete(). By design. */
  record(movement: StockMovement): Promise<StockMovement>;
  findById(id: string): Promise<StockMovement | null>;
  findByIdempotencyKey(key: string): Promise<StockMovement | null>;
  findByProduct(productId: string): Promise<StockMovement[]>;
  findByDateRange(from: Date, to: Date, filters?: MovementFilters): Promise<StockMovement[]>;
  /** The invariant: this must always equal on-hand. PLAN.md §8.4. */
  sumQuantity(productId: string): Promise<number>;
}

export interface WarrantyRepository {
  nextClaimNumber(now: Date): Promise<string>;
  findAll(filters?: { status?: RmaStatus; unitId?: string; assignedToId?: string }): Promise<WarrantyClaim[]>;
  findById(id: string): Promise<WarrantyClaim | null>;
  findByIdempotencyKey(key: string): Promise<WarrantyClaim | null>;
  findActiveByUnit(unitId: string): Promise<WarrantyClaim | null>;
  create(claim: WarrantyClaim): Promise<WarrantyClaim>;
  transition(id: string, expectedStatus: RmaStatus, patch: Partial<WarrantyClaim>): Promise<WarrantyClaim>;
  findEvents(claimId: string): Promise<WarrantyClaimEvent[]>;
  findEventByIdempotencyKey(key: string): Promise<WarrantyClaimEvent | null>;
  createEvent(event: WarrantyClaimEvent): Promise<WarrantyClaimEvent>;
  findSupplierCase(claimId: string): Promise<SupplierWarrantyCase | null>;
  upsertSupplierCase(value: SupplierWarrantyCase): Promise<SupplierWarrantyCase>;
}

/**
 * Runs `fn` atomically. In the JSON phase this is a process-level mutex and is
 * NOT crash-safe (PLAN.md §13.1). In Phase 1 it becomes `prisma.$transaction`.
 * Services call this and don't care which they got.
 */
export type Transactor = <T>(fn: (repositories: Repositories) => Promise<T>) => Promise<T>;

export interface Repositories {
  categories: CategoryRepository;
  brands: BrandRepository;
  suppliers: SupplierRepository;
  users: UserRepository;
  products: ProductRepository;
  units: ProductUnitRepository;
  movements: StockMovementRepository;
  warranties: WarrantyRepository;
  customers: CustomerRepository;
  carts: CartRepository;
  sales: SaleRepository;
  transaction: Transactor;
}
