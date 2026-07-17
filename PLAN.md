# Electronics Shop — Inventory Management System (IMS)
### Development Plan & Technical Specification — v2

> **Purpose:** A complete build spec for an AI coding assistant (Claude Code, Cursor) to develop from. Save as `PLAN.md` in the project root and reference it in prompts.
>
> **What changed from v1:** This revision is rebuilt around three scoping decisions that v1 got wrong (it was written before they were made):
> 1. **No POS.** The app is back-office only — `Sale`/`SaleItem`/`Customer` models are **removed**.
> 2. **Serial/IMEI tracking is Phase 1, not Phase 2.** It is a core schema concept, not an enhancement.
> 3. **`currentStock` is no longer a mutable column.** Stock is derived from an append-only ledger.
>
> Sections marked ⚠️ are the ones that most commonly get implemented wrong. Read them twice.

---

## 1. Scope

A single-location inventory system for an electronics retail shop. One shop, no branches, no stock transfers.

**In scope (v1):**
- Product catalog with per-unit **serial/IMEI tracking**
- Stock in (goods receipt) and stock out (sale, damage, loss, return)
- Append-only stock movement ledger with a full audit trail
- Dashboard with KPIs, low-stock and dead-stock alerts
- Topbar quick search — by name, SKU, barcode, **and serial/IMEI**
- Financial reports: inventory valuation, revenue, COGS, gross margin, stock aging, shrinkage
- Three user roles with server-enforced permissions

**Explicitly NOT in scope (v1):**
- ❌ Point of sale / cash drawer / receipt printing
- ❌ Purchase orders and supplier ledgers (a lightweight `Supplier` table exists, but no PO workflow)
- ❌ Barcode *scanning* hardware integration (the `barcode` field exists; see §18)
- ❌ VAT / tax-compliant invoices (the `taxRate` field exists but is unused)
- ❌ Customer records, warranty claims / RMA workflow
- ❌ Multi-branch anything

### 1.1 ⚠️ The one thing that needs explaining: "no POS" + "financial reports"

If the app never records a sale, it has no revenue data and the financial reports have nothing to compute from. The resolution is **not** to build a POS. It is:

> **A sale is a `StockMovement` with `type: OUT`, `reason: SALE`, and a `unitPrice`.**

That's a two-field form at the end of the day, not a checkout terminal. It yields revenue, COGS, and exact per-unit margin with zero POS machinery. There is no `Sale` table, no `SaleItem` table, no `Customer` table. If a customer buys three items at once, that's three movement rows sharing a `reference` (memo number).

---

## 2. Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript, `"strict": true` | Money math needs type safety |
| Framework | **Next.js 16** (App Router) | Turbopack default. Node 20.9+ required, 22 LTS recommended. ⚠️ `middleware.ts` is renamed to **`proxy.ts`** — see §9.3 |
| ORM | **Prisma** | Type-safe, mature migrations, best-in-class Next.js docs |
| Database | **PostgreSQL on Neon** (free tier, 512 MB, no expiry, scales to zero) | Relational integrity + real transactions. Stock counts must never silently drift |
| Auth | **Better Auth** | Owns `User`/`Session`/`Account`; extended with a `role` field |
| Money | **Integer minor units (paisa)** | See §17 for why, and the `Decimal` alternative |
| IDs | UUIDv7 (`@default(uuid(7))`, Prisma ≥ 5.16) | Time-sortable, and generated app-side so the JSON→Postgres import needs no ID remapping |
| Unit tracking | **Per-product flag**: `SERIAL` (default) or `QUANTITY` | Serials for phones/laptops/TVs; bulk counts for cables and plugs. Same code paths, one branch |
| Costing | **Exact, per-unit** for SERIAL; weighted-average only for QUANTITY | Each unit carries its own cost, so profit is a subtraction — no FIFO machinery |
| Timezone | Store UTC, render `Asia/Dhaka` | |

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| UI | React 19 + Tailwind + shadcn/ui (copy-in, freely editable) |
| Charts | Recharts |
| Validation | **Zod** — one schema per entity, shared by client form and server action |
| Forms | React Hook Form + `@hookform/resolvers/zod` |
| Password hashing | argon2id (preferred) or bcrypt — handled by Better Auth |
| CSV/PDF export | `papaparse` for CSV, `@react-pdf/renderer` for PDF reports |
| Dates | `date-fns` + `date-fns-tz` |

### 3.1 Architecture

```mermaid
flowchart LR
    A[Browser - React] -->|Server Actions| B[Next.js Server]
    A -->|fetch| C[Route Handlers - /api/search]
    B --> S[Service Layer]
    C --> S
    S --> R[Repository Layer]
    R --> J[(JSON files - Phase 0)]
    R --> P[Prisma Client]
    P --> D[(PostgreSQL / Neon)]
    B --> F[Better Auth]
```

**⚠️ The layering rule that makes the whole plan work:**

- **UI / Server Actions** never touch Prisma directly.
- **Services** hold business logic and transactions (`recordStockOut`, `receiveStock`).
- **Repositories** are the only thing that knows whether data lives in JSON or Postgres.

This is what makes Phase 0 → Phase 1 a one-line change per repository instead of a rewrite. See §13–14.

**Server Actions vs Route Handlers:** Server Actions for form-driven mutations. Route Handlers for on-demand JSON — the quick-search endpoint especially.

---

## 4. Getting Started

```bash
npx create-next-app@latest inventory-system \
  --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd inventory-system

npm install prisma --save-dev
npm install @prisma/client
npx prisma init --datasource-provider postgresql

npm install better-auth
npm install zod react-hook-form @hookform/resolvers
npx shadcn@latest init
npm install recharts lucide-react date-fns date-fns-tz cmdk
npm install papaparse @react-pdf/renderer
```

`.env.local`:

```bash
# Neon POOLED connection (host contains "-pooler") — used at runtime
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Neon DIRECT connection (no "-pooler") — used by `prisma migrate`.
# ⚠️ Migrations cannot run through PgBouncer. Omitting this WILL break migrations.
DATABASE_URL_UNPOOLED="postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"

BETTER_AUTH_SECRET="generate with: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"

# Inventory: JSON through Phase 5, PostgreSQL from Phase 6.
# Better Auth and audit logs use PostgreSQL from Phase 3.
DATA_SOURCE="json"
```

> **Building the JSON prototype first?** Skip Prisma/Neon setup for now and go straight to §13.

---

## 5. ⚠️ Domain Model & Core Invariants

**Read this section before writing any code.** Everything else follows from it.

### 5.1 The ledger is the source of truth

`StockMovement` is an **append-only** table. Never `UPDATE`. Never `DELETE`. A mistake is corrected by writing a **new, opposing entry** with `reason: CORRECTION`.

`StockMovement.quantity` is **signed**: positive = into stock, negative = out of stock. Therefore:

```
on-hand(product) = SUM(stock_movements.quantity WHERE product_id = ...)
```

For SERIAL products, quantity is always exactly `+1` or `-1`.

If you ever find yourself writing `currentStock = currentStock - 1` without an accompanying ledger row, **stop** — you have just made the inventory unauditable.

### 5.2 The one deliberate denormalization

`Product.quantityOnHand` is a **cache**, authoritative *only* for `trackingType = QUANTITY` (so a page listing 500 cables doesn't sum the ledger 500 times).

- It **must** be written inside the *same transaction* as the movement insert.
- For SERIAL products it stays `0` and is ignored — on-hand is `COUNT(units WHERE status = 'IN_STOCK')`.
- A reconciliation job (§8.4) compares it against `SUM(quantity)` and reports drift.

### 5.3 Two units of stock

| `trackingType` | Physical row | On-hand | Costing |
|---|---|---|---|
| `SERIAL` | One `ProductUnit` per item, unique serial/IMEI | `COUNT(units WHERE IN_STOCK)` | Exact — each unit's own `costPrice` |
| `QUANTITY` | No unit rows | `Product.quantityOnHand` | Weighted average |

Default new products to `SERIAL`. Use `QUANTITY` for cables, adapters, screws — things where inventing 400 serials would be absurd.

---

## 6. Prisma Schema

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  // Prisma 6: driverAdapters is GA. On Prisma 5, add:
  //   previewFeatures = ["driverAdapters"]
  // Then use @prisma/adapter-neon for HTTP queries on serverless.
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // pooled
  directUrl = env("DATABASE_URL_UNPOOLED") // unpooled — required by `prisma migrate`
}

// ===========================================================================
//  ENUMS
// ===========================================================================

enum Role {
  ADMIN   // everything: cost prices, margins, financial reports, user management
  MANAGER // all stock ops + reports; no user management, no destructive actions
  STAFF   // record stock in/out, view stock. ⚠️ COST PRICES HIDDEN — see §9.2
}

enum TrackingType {
  SERIAL   // one ProductUnit row per physical item
  QUANTITY // counted in bulk, no serials
}

enum UnitStatus {
  IN_STOCK
  RESERVED
  SOLD
  RETURNED // customer brought it back; awaiting inspection or restocked
  DAMAGED
  LOST
  VOID     // created in error and reversed out. Not stock, not a sale.
}

enum MovementType {
  IN
  OUT
  ADJUST
}

enum MovementReason {
  INITIAL_STOCK      // opening balance when first loading the system   (IN)
  PURCHASE           // goods received from a supplier                  (IN)
  CUSTOMER_RETURN    // customer returned an item                       (IN)
  SALE               // sold to a customer                              (OUT)
  RETURN_TO_SUPPLIER // sent back / RMA                                 (OUT)
  DAMAGE             // broken, unsellable                              (OUT)
  LOSS               // theft, shrinkage, unexplained                   (OUT)
  INTERNAL_USE       // shop's own use, demo unit, gift                 (OUT)
  CORRECTION         // reverses an earlier bad entry               (ADJUST)
  STOCK_COUNT        // physical count reconciliation               (ADJUST)
}

// ===========================================================================
//  AUTH  (Better Auth owns the shape of User/Session/Account/Verification)
//  Run Better Auth's schema generator, then add `role` + business relations.
// ===========================================================================

model User {
  id            String    @id            // Better Auth generates this — no @default
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          Role      @default(STAFF)
  isActive      Boolean   @default(true)
  banned        Boolean   @default(false) // Better Auth admin plugin; mirrors !isActive
  banReason     String?
  banExpires    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions  Session[]
  accounts  Account[]
  movements StockMovement[] @relation("MovementActor")
  auditLogs AuditLog[]

  @@index([role])
  @@map("users")
}

model Session {
  id        String   @id
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  impersonatedBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model Account {
  id                    String    @id
  userId                String
  accountId             String
  providerId            String
  password              String?   // hashed by Better Auth for email/password auth
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("accounts")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verifications")
}

/// Who did what, when. Written on every mutating action.
model AuditLog {
  id        String   @id @default(uuid(7))
  actorId   String?
  actor     User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  action    String   // "product.create", "stock.out", "user.role_change"
  entity    String   // "Product", "ProductUnit", "User"
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())

  @@index([entity, entityId])
  @@index([actorId, createdAt])
  @@index([createdAt])
  @@map("audit_logs")
}

// ===========================================================================
//  CATALOG
// ===========================================================================

model Category {
  id        String     @id @default(uuid(7))
  name      String     @unique
  slug      String     @unique
  parentId  String?
  parent    Category?  @relation("SubCategories", fields: [parentId], references: [id], onDelete: SetNull)
  children  Category[] @relation("SubCategories")
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  products Product[]

  @@map("categories")
}

model Brand {
  id        String   @id @default(uuid(7))
  name      String   @unique
  slug      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  products Product[]

  @@map("brands")
}

model Supplier {
  id        String   @id @default(uuid(7))
  name      String
  phone     String?
  email     String?
  address   String?
  note      String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  units     ProductUnit[]
  movements StockMovement[]

  @@index([name])
  @@map("suppliers")
}

model Product {
  id           String       @id @default(uuid(7))
  sku          String       @unique
  barcode      String?      @unique // field exists now; scanning is v2 (§18)
  name         String
  description  String?
  model        String?      // e.g. "A2882", "UN55TU8000"
  trackingType TrackingType @default(SERIAL)

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brandId    String?
  brand      Brand?   @relation(fields: [brandId], references: [id], onDelete: SetNull)

  /// Defaults that pre-fill the stock-in form. The REAL cost/price lives on the
  /// ProductUnit (SERIAL) or on the StockMovement (QUANTITY) — never here.
  defaultCostPrice Int @default(0) // paisa
  defaultSalePrice Int @default(0) // paisa

  taxRate      Int @default(0) // basis points (1500 = 15.00%). Unused in v1 — see §18.
  reorderPoint Int @default(5)

  /// ⚠️ DENORMALIZED CACHE. Authoritative ONLY for trackingType = QUANTITY.
  /// Must be written in the SAME transaction as the StockMovement insert.
  /// For SERIAL products this stays 0. See §5.2.
  quantityOnHand Int @default(0)

  /// Weighted-average cost. Maintained ONLY for trackingType = QUANTITY (§8.2).
  avgCostPrice Int @default(0) // paisa

  imageUrl String? // URL only. ⚠️ Never store image bytes in Postgres (512 MB tier).

  isActive  Boolean  @default(true) // soft delete — history references this row forever
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  units     ProductUnit[]
  movements StockMovement[]

  @@index([categoryId])
  @@index([brandId])
  @@index([isActive])
  @@index([name]) // btree; trigram index for fuzzy search lives in §7
  @@map("products")
}

// ===========================================================================
//  UNITS — one row per physical item. The heart of serial tracking.
// ===========================================================================

model ProductUnit {
  id String @id @default(uuid(7))

  /// IMEI / serial number. Globally unique — an IMEI never belongs to two items.
  serialNo String @unique

  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  status UnitStatus @default(IN_STOCK)

  /// EXACT costing. Every unit carries its own cost, so profit is a subtraction.
  costPrice Int  // paisa — what YOU paid
  salePrice Int? // paisa — what it actually sold for (null until sold)

  supplierId String?
  supplier   Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  receivedAt DateTime  @default(now())
  soldAt     DateTime?

  warrantyMonths    Int?
  warrantyExpiresAt DateTime? // computed at sale: soldAt + warrantyMonths

  location String? // "Shelf B3", "Back room"
  note     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  movements StockMovement[]

  @@index([productId, status]) // on-hand counts
  @@index([status])
  @@index([supplierId])
  @@index([receivedAt])        // stock-aging report
  @@index([soldAt])            // sales reports
  @@index([warrantyExpiresAt]) // expiring-warranty widget
  @@map("product_units")
}

// ===========================================================================
//  THE LEDGER — append-only. Your source of truth.
// ===========================================================================

model StockMovement {
  id String @id @default(uuid(7))

  type   MovementType
  reason MovementReason

  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict)

  /// Set for SERIAL products, null for QUANTITY products.
  unitId String?
  unit   ProductUnit? @relation(fields: [unitId], references: [id], onDelete: Restrict)

  /// ⚠️ SIGNED. Positive = into stock, negative = out.
  /// Always exactly +1 / -1 for SERIAL products. Never zero (CHECK constraint, §7).
  quantity Int

  /// Snapshot the economics ON the movement, so every financial report is
  /// computable from this table alone, without joining to mutable rows.
  unitCost  Int  // paisa — cost at the moment of the movement
  unitPrice Int? // paisa — selling price (only when reason = SALE)

  supplierId String?
  supplier   Supplier? @relation(fields: [supplierId], references: [id], onDelete: SetNull)

  /// Lightweight buyer info without a Customer table (that's v2).
  customerName  String?
  customerPhone String?

  reference String? // memo / challan / invoice no. Groups multi-item sales.
  note      String?

  actorId String?
  actor   User?   @relation("MovementActor", fields: [actorId], references: [id], onDelete: SetNull)

  /// Guards against double-submits and retried Server Actions.
  idempotencyKey String? @unique

  /// If this entry reverses an earlier one (reason = CORRECTION).
  reversesId String?

  /// ⚠️ No updatedAt. This table is append-only by design.
  createdAt DateTime @default(now())

  @@index([productId, createdAt])
  @@index([createdAt])
  @@index([type, reason, createdAt])
  @@index([unitId])
  @@index([actorId])
  @@index([supplierId])
  @@map("stock_movements")
}
```

---

## 7. What Prisma Can't Express (hand-written migration)

Run `npx prisma migrate dev --create-only --name constraints_and_search`, then paste this into the generated SQL file:

```sql
-- === CHECK constraints: Prisma has no @@check ===

-- A zero-quantity movement is meaningless.
ALTER TABLE stock_movements ADD CONSTRAINT qty_nonzero CHECK (quantity <> 0);

-- Serial-tracked movements are always exactly one unit.
ALTER TABLE stock_movements ADD CONSTRAINT serial_qty_is_one
  CHECK (unit_id IS NULL OR quantity IN (1, -1));

-- Money is never negative.
ALTER TABLE stock_movements ADD CONSTRAINT cost_nonneg  CHECK (unit_cost >= 0);
ALTER TABLE stock_movements ADD CONSTRAINT price_nonneg CHECK (unit_price IS NULL OR unit_price >= 0);
ALTER TABLE product_units   ADD CONSTRAINT unit_cost_nonneg CHECK (cost_price >= 0);

-- Quantity-tracked stock can never go negative.
ALTER TABLE products ADD CONSTRAINT qty_on_hand_nonneg CHECK (quantity_on_hand >= 0);

-- === Fuzzy search indexes for the topbar (§11) ===
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX products_name_trgm ON products USING GIN (name gin_trgm_ops);
CREATE INDEX products_sku_trgm  ON products USING GIN (sku  gin_trgm_ops);
```

---

## 8. ⚠️ Business Logic (Service Layer)

**Every stock-affecting operation is a single transaction.** The unit status, the ledger row, and the cached quantity move together or not at all.

### 8.1 Stock Out (the important one)

```typescript
// src/services/stock.ts
export async function recordStockOut(input: {
  productId: string;
  serialNo?: string;      // required for SERIAL products
  quantity?: number;      // required for QUANTITY products (positive number)
  reason: 'SALE' | 'DAMAGE' | 'LOSS' | 'INTERNAL_USE' | 'RETURN_TO_SUPPLIER';
  salePrice?: number;     // paisa — required when reason = SALE
  customerName?: string;
  reference?: string;
  actorId: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });

    if (product.trackingType === 'SERIAL') {
      // ⚠️ The `status: 'IN_STOCK'` in the WHERE clause is optimistic concurrency.
      // If two staff try to sell the same serial at once, the second throws
      // instead of corrupting the books. Do not remove it.
      const unit = await tx.productUnit.update({
        where: { serialNo: input.serialNo!, status: 'IN_STOCK' },
        data: {
          status: input.reason === 'SALE' ? 'SOLD'
                : input.reason === 'DAMAGE' ? 'DAMAGED'
                : input.reason === 'LOSS' ? 'LOST' : 'RETURNED',
          salePrice: input.salePrice,
          soldAt: input.reason === 'SALE' ? new Date() : undefined,
          warrantyExpiresAt: /* soldAt + warrantyMonths, if SALE */ undefined,
        },
      });

      return tx.stockMovement.create({
        data: {
          type: 'OUT', reason: input.reason,
          productId: product.id, unitId: unit.id,
          quantity: -1,                    // SIGNED
          unitCost: unit.costPrice,        // exact cost — no weighted average needed
          unitPrice: input.salePrice,
          customerName: input.customerName,
          reference: input.reference,
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    }

    // QUANTITY path
    const qty = input.quantity!;
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { quantityOnHand: { decrement: qty } }, // CHECK constraint blocks going negative
    });

    return tx.stockMovement.create({
      data: {
        type: 'OUT', reason: input.reason,
        productId: product.id,
        quantity: -qty,                   // SIGNED
        unitCost: product.avgCostPrice,
        unitPrice: input.salePrice,
        reference: input.reference,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}
```

### 8.2 Stock In (goods receipt)

- **SERIAL:** the form takes a product, a supplier, a unit cost, and **a list of serial numbers**. Create N `ProductUnit` rows + N movements of `+1`. Reject duplicate serials up front (the unique index will catch them anyway, but a clean error is better UX).
- **QUANTITY:** one movement of `+n`, increment `quantityOnHand`, and recompute weighted-average cost:

```
newAvgCost = ((oldQty * oldAvgCost) + (newQty * newUnitCost)) / (oldQty + newQty)
```

### 8.3 Corrections
Never edit or delete a movement. Write a new one with `reason: CORRECTION`, the opposite sign, and `reversesId` pointing at the original.

### 8.4 Reconciliation job
An admin-only page that, per product, compares the cache against the ledger and reports drift:

```
SERIAL:   COUNT(units WHERE status='IN_STOCK')  vs  SUM(movements.quantity)
QUANTITY: products.quantityOnHand               vs  SUM(movements.quantity)
```
If these ever disagree, a transaction boundary was missed somewhere. The ledger wins.

---

## 9. Auth & Authorization

### 9.1 Roles

| Capability | ADMIN | MANAGER | STAFF |
|---|:--:|:--:|:--:|
| View stock levels, product details | ✅ | ✅ | ✅ |
| Record stock in / stock out | ✅ | ✅ | ✅ |
| **See cost prices & profit margins** | ✅ | ✅ | ❌ |
| Create / edit products, categories, suppliers | ✅ | ✅ | ❌ |
| Financial reports | ✅ | ✅ | ❌ |
| Corrections & reconciliation | ✅ | ✅ | ❌ |
| User management, role changes | ✅ | ❌ | ❌ |
| Soft-delete products | ✅ | ❌ | ❌ |

### 9.2 ⚠️ Hiding cost prices from STAFF

Do **not** do this by hiding a `<div>`. Strip the fields **server-side** before the data ever leaves the server:

```typescript
// src/lib/dto.ts
export function toProductDTO(p: Product, role: Role) {
  const base = { id: p.id, sku: p.sku, name: p.name, /* ... */ };
  if (role === 'STAFF') return base;              // costs never serialized
  return { ...base, costPrice: p.defaultCostPrice, avgCostPrice: p.avgCostPrice };
}
```

A hidden button is not a permission. Every Server Action re-checks the session role before mutating — no exceptions.

### 9.3 ⚠️ `proxy.ts`, not `middleware.ts`

Next.js 16 renamed `middleware.ts` → `proxy.ts` (the exported function is renamed too; there's a codemod: `npx @next/codemod@latest rename-middleware-to-proxy .`). It runs on the Node.js runtime.

**Use it only for the coarse check** — "is there a session? no? → `/login`". Next.js 16 explicitly steers heavy logic (database checks, role resolution) *out* of this layer and into the Data Access Layer / Route Handlers. Role enforcement belongs in the service layer, not the proxy.

---

## 10. Dashboard

**KPI cards:**
- Total stock value **at cost** and **at retail** (and the implied potential margin)
- Units in stock / distinct SKUs
- Low stock (on-hand ≤ `reorderPoint`) and out-of-stock counts
- This month: revenue, COGS, gross profit

**Panels:**
- **Low-stock alerts** — actionable list with a "reorder" note
- **Dead stock** ⚠️ — products with **no OUT movement in 60/90 days**. This is the single most valuable widget for an electronics shop: it's capital sitting on a shelf while the model depreciates.
- **Recent activity** — live feed of the last 20 movements, with actor
- **Expiring warranties** — units whose `warrantyExpiresAt` is within 30 days
- **Top movers / slow movers** (last 30 days)

**Charts (Recharts):** stock value over time, daily in vs. out, revenue & margin trend.

---

## 11. Quick Search (topbar)

- `⌘K` / `Ctrl+K` palette, `cmdk` + shadcn. Debounce 250 ms. Route Handler at `/api/search`.
- **⚠️ Search order matters.** Query **serial/IMEI with an exact equality match FIRST** — it hits the unique index and returns in microseconds. Only if that misses, fall back to trigram matching on name / SKU / barcode.

  This is the real-world flow: a customer walks in with a broken phone, you type the IMEI, and you instantly get *that unit* — when it was received, from which supplier, what it cost, when it sold, and whether it's still under warranty.
- Results are grouped: **Units** (exact serial hits) above **Products** (fuzzy hits).
- Respect the DTO rule from §9.2 — a STAFF search result must not contain cost prices in the JSON payload.

---

## 12. Financial Reports

Every one of these is computable **from `stock_movements` alone**, because the economics are snapshotted onto each row.

| Report | Definition |
|---|---|
| **Inventory valuation** | SERIAL: `SUM(costPrice)` of `IN_STOCK` units. QUANTITY: `qty × avgCost`. Grouped by category / brand. This is your balance-sheet number. |
| **Revenue / COGS / gross margin** | Over `reason = SALE`: revenue `= SUM(-quantity × unitPrice)`, COGS `= SUM(-quantity × unitCost)`, profit = the difference. By day / month / category / brand. |
| **Profit per product** | Exact, thanks to per-unit costing. Sortable — shows what's actually worth stocking. |
| **Purchase spend** | Over `reason = PURCHASE`, by supplier and period. |
| **Stock aging** ⚠️ | `now − receivedAt`, bucketed 0–30 / 31–60 / 61–90 / 90+ days, valued at cost. Tells you how much capital is stuck in old stock. |
| **Shrinkage** | `DAMAGE` + `LOSS` movements, valued at cost. Watch this number. |
| **Movement audit** | Full filterable ledger: date, product, type, reason, actor. |

All reports export to CSV (`papaparse`) and PDF (`@react-pdf/renderer`).

---

## 13. Phase 0 — JSON Prototype

### 13.1 ⚠️ Two things to know before you start

1. **JSON writes do not work on Vercel.** Serverless filesystems are read-only. Phase 0 is a **local-development prototype only**. Do not attempt to deploy it.
2. **JSON files have no transactions.** Read-modify-write is not atomic; two concurrent requests can clobber each other. Fine for solo local dev, but it's exactly why §8 wraps everything in `prisma.$transaction` later.

### 13.2 The repository interface (written once, used by both backends)

```typescript
// src/repositories/types.ts
export interface ProductRepository {
  findAll(filters?: { categoryId?: string; activeOnly?: boolean }): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  search(query: string): Promise<Product[]>;
  create(data: CreateProductInput): Promise<Product>;
  update(id: string, data: Partial<CreateProductInput>): Promise<Product>;
  softDelete(id: string): Promise<void>;
  // ⚠️ NOTE: there is deliberately NO `adjustStock(id, delta)` method.
  // Stock can ONLY move via StockMovementRepository.record(). If a caller can
  // change stock without writing a ledger row, the ledger is a lie.
}

export interface ProductUnitRepository {
  findBySerial(serialNo: string): Promise<ProductUnit | null>;
  findByProduct(productId: string, status?: UnitStatus): Promise<ProductUnit[]>;
  countInStock(productId: string): Promise<number>;
  createMany(units: CreateUnitInput[]): Promise<ProductUnit[]>;
  updateStatus(id: string, status: UnitStatus, data?: Partial<ProductUnit>): Promise<ProductUnit>;
}

export interface StockMovementRepository {
  record(input: CreateMovementInput): Promise<StockMovement>; // append-only
  findByProduct(productId: string): Promise<StockMovement[]>;
  findByDateRange(from: Date, to: Date, filters?: MovementFilters): Promise<StockMovement[]>;
  sumQuantity(productId: string): Promise<number>; // the on-hand invariant
}
```

Define one per entity, mirroring §6. Every method is `async` **even in the JSON implementation** — that way not a single call site changes in Phase 1.

### 13.3 JSON implementation notes

```
data/
├── products.json
├── product-units.json
├── stock-movements.json
├── categories.json
├── brands.json
├── suppliers.json
└── users.json
```

⚠️ **Write atomically** — write to a temp file, then `rename()`. Otherwise a crashed process leaves you with a truncated, unparseable `products.json`:

```typescript
async function writeAll<T>(file: string, rows: T[]): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
  await fs.rename(tmp, file); // atomic on POSIX
}
```

Serialize writes through a simple in-process queue/mutex, and generate IDs with UUIDv7 app-side so they carry over to Postgres unchanged.

### 13.4 The switch

```typescript
// src/repositories/index.ts — the only file that changes when you migrate
const impl = process.env.DATA_SOURCE === 'postgres' ? prismaRepos : jsonRepos;
export const { productRepository, productUnitRepository, stockMovementRepository } = impl;
```

Nothing above this file — services, Server Actions, UI — ever imports `json/` or `prisma/` directly.

---

## 14. Phase 1 — Migration to Neon

1. Create the Neon project; copy **both** the pooled and direct connection strings into `.env.local`.
2. `npx prisma migrate dev --name init`, then apply the §7 SQL migration.
3. Write `scripts/migrate-json-to-pg.ts`: read each JSON file and insert in FK-safe order. Catalog, unit, and movement IDs were generated app-side, so they need no remapping. Auth users already live in PostgreSQL from Phase 3; map any legacy JSON `actorId` values to Better Auth users by email before inserting old movements.
4. **Verify before trusting it:** run the §8.4 reconciliation. `SUM(movements.quantity)` must equal on-hand for every single product. If one product disagrees, stop and find out why.
5. Flip `DATA_SOURCE=postgres`. Delete `data/`.

### 14.1 Neon specifics
- ⚠️ `PrismaClient` **must be a global singleton** in dev, or Next.js hot-reload will open a new connection on every save and exhaust the pool.
- Neon's free tier **auto-suspends** after inactivity — expect a cold-start delay on the first query. Normal; don't debug it.
- 512 MB is ample for structured rows. Protect it: images go to blob storage (URL only), and archive `audit_logs` to CSV yearly.
- **Back up.** Neon's free tier has a limited restore window. Add a weekly CSV export of all tables — it costs nothing and it's the difference between an inconvenience and a catastrophe.

---

## 15. Testing

Prioritize by blast radius. The money and stock paths are the ones that matter:

- **`recordStockOut` concurrency** — two simultaneous sales of the same serial. The second **must** throw. This is the single most important test in the codebase.
- **Ledger invariant** — after any sequence of operations, `SUM(quantity) == on-hand`, always.
- **Idempotency** — replaying the same `idempotencyKey` creates exactly one movement.
- **RBAC** — a STAFF session hitting an admin Server Action gets rejected, and STAFF API payloads contain no cost fields.
- **Weighted-average cost** math for QUANTITY products.

Vitest for units/services, Playwright for the critical flows.

---

## 16. Milestones

| Phase | Deliverable |
|---|---|
| **0** | Zod schemas + repository interfaces + JSON adapters + seed data. No UI. |
| **1** | Catalog CRUD (products, categories, brands, suppliers) |
| **2** | Stock in (with serial entry) + stock out. **The §8 service layer.** |
| **3** | Better Auth + roles + `proxy.ts` + audit log |
| **4** | Dashboard + quick search |
| **5** | Financial reports + CSV/PDF export |
| **6** | **Swap to Neon** (§14). Should be a boring afternoon if §13.2 was respected. |
| **7** | v2 features (§18) |

---

## 17. Decision Log

**PostgreSQL/Neon over DynamoDB.** DynamoDB's Always Free tier (25 GB, no expiry) was genuinely tempting. It lost on two counts: every report in §12 needs filtering and aggregation across relations (trivial in SQL; requires upfront GSI design plus app-side aggregation or maintained summary records in DynamoDB), and the quick search in §11 needs partial-match text search, which DynamoDB has no native answer for (it would need OpenSearch alongside it, via Streams). Neon matches DynamoDB's defining property — a free tier that never expires — while keeping joins, aggregation, and `pg_trgm`. At this app's data volume (structured rows, no media), 512 MB is not a near-term constraint.

**Integer paisa over `Decimal(10,2)`.** Both are correct — Postgres `Decimal` is exact, not floating-point, so there's no bug either way. Integers win on one practical point: Prisma returns `Decimal` as a `Prisma.Decimal` object (decimal.js), which is **not serializable across the Server → Client Component boundary**. Every value must be `.toNumber()`-ed before it reaches a client component, and forgetting once is a runtime error. Integers sidestep that entirely. Format at the display layer: `(85000 / 100).toLocaleString('en-BD')` → `৳850.00`.

**Serial-per-unit as a Phase 1 concept.** It changes what a *unit of stock is*, so it cannot be bolted on later without backfilling serials for all existing stock and rewriting every stock operation. It also pays for itself: per-unit costing makes profit exact and deletes the entire FIFO/weighted-average problem for serialized goods.

---

## 18. Deferred to v2

- **Barcode scanning** — a USB scanner is just a keyboard: it types the barcode and presses Enter. The `barcode` field and the §11 search box already handle this; it needs no new backend work, just a focused input.
- **Purchase orders & supplier ledger** — payables, partial deliveries, PO → receipt matching.
- **VAT / tax invoices** — the `taxRate` field (basis points) is already on `Product`.
- **Warranty claims / RMA workflow** — the data (`warrantyExpiresAt` per unit) is already captured; this is the UI and status machine on top.
- **Customer records** — promote `customerName`/`customerPhone` on movements into a real table.
- **Multi-branch** — would need a `Location` table, a `locationId` on `ProductUnit`, and stock-transfer movements. The current schema is deliberately single-location.
