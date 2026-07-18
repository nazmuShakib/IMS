# Electronics Shop — Inventory Management System

Phases 0–5 complete: the JSON inventory layer, catalog UI, stock operations,
Better Auth/RBAC/audit logging, dashboard, command-palette search, and protected
financial reports with CSV/PDF export. Full spec in `PLAN.md`.

## Requirements

- **Node.js 22 LTS** (https://nodejs.org). Next.js 16 needs 20.9+; 22 is recommended.
- A Neon PostgreSQL project. Auth users, sessions, and audit logs live there;
  inventory remains in JSON until Phase 6.

## Run it

```bash
npm install
npx neon env pull           # writes ignored .env.local connection variables
# Add BETTER_AUTH_SECRET and INITIAL_ADMIN_* to .env.local
npm run auth:bootstrap      # one time only
npm run seed                 # build demo stock: phones, laptops, cables
npm test                     # security, dashboard, search, and UI checks
npx tsx scripts/verify.ts    # prove the invariants hold
npm run dev                  # http://localhost:3000
```

`verify` runs the critical inventory invariants (PLAN.md §15) — including two staff
trying to sell the same IMEI simultaneously, where exactly one must win.

## What's here

```
src/
  domain/types.ts        entity types (mirror the Prisma schema)
  schemas/index.ts       Zod — the validation boundary
  lib/money.ts           integer paisa. never floats.
  lib/ids.ts             UUIDv7, generated app-side
  lib/auth.ts            Better Auth configuration
  lib/session.ts         database-backed session + current role checks
  lib/audit.ts           append-only audit writer
  lib/search.ts          exact serial-first, role-filtered inventory search
  lib/report-export.ts   shared CSV/PDF export matrix
  repositories/
    types.ts             ⭐ THE SEAM — swap JSON for Postgres here
    json/                Phase 0 implementation (local dev only)
    index.ts             the one file that changes in Phase 6
  services/stock.ts      ⭐ THE CORE — receiveStock, recordStockOut, reconcile
  services/dashboard.ts  ledger-derived dashboard metrics and alerts
  services/reports.ts    seven ledger-derived financial reports
scripts/
  seed.ts                demo data
  verify.ts              invariant tests
prisma/schema.prisma     ready for Phase 6
src/proxy.ts             coarse cookie redirect (not authorization)
```

## ⚠️ Two things to know

1. **JSON writes don't work on Vercel** — serverless filesystems are read-only.
   Phase 0 is a local-development prototype. Don't deploy it.
2. **Stock only ever moves via the ledger.** There is no `adjustStock()` method,
   on purpose. See `CLAUDE.md`.

## Try this

1. `npm run dev`, open http://localhost:3000.
2. **Receive stock** → pick the Galaxy A55, paste three IMEIs one per line. Three
   units appear on the product page, each with its own cost.
3. **Stock out** → type one of those IMEIs. The app finds the device and tells you
   what it is. Record the sale, and the exact profit appears against that unit —
   no FIFO, no averaging, because the unit carries its own cost.
4. **Movement ledger** → hit "Reverse" on that sale. The original entry stays put and
   a correction is written beneath it. The unit goes back into stock. There is no
   delete button anywhere, on purpose.
5. **Reconciliation** → on-hand vs SUM(ledger), for every product. It should say the
   books add up. That is the invariant the whole system rests on.
6. Sign in as a STAFF account. Cost prices, stock valuation and the profit column
   are not hidden with CSS; they are absent from the server payload and HTML.
7. Click the topbar search or press `Ctrl+K` / `⌘K`. Search a product or enter an
   exact IMEI to jump directly to that physical unit.
8. As ADMIN or MANAGER, open **Reports**, apply filters, and export the identical
   result as CSV or PDF. STAFF cannot access report pages or export endpoints.

## Next

The next milestone is:

> Read PLAN.md and CLAUDE.md. Implement Phase 6 (swap inventory repositories from JSON to Neon) only.
> Stop when done.
