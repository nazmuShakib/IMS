# Electronics Shop — Inventory Management System

Phases 0–2 complete: the data layer, the catalog UI, and stock operations, running
against JSON files. Full spec in `PLAN.md`.

## Requirements

- **Node.js 22 LTS** (https://nodejs.org). Next.js 16 needs 20.9+; 22 is recommended.
- Nothing else. No database required for Phase 0.

## Run it

```bash
npm install
npm run seed                 # build demo stock: phones, laptops, cables
npx tsx scripts/verify.ts    # prove the invariants hold
npm run dev                  # http://localhost:3000
```

`verify` runs the five tests that matter (PLAN.md §15) — including two staff
trying to sell the same IMEI simultaneously, where exactly one must win.

## What's here

```
src/
  domain/types.ts        entity types (mirror the Prisma schema)
  schemas/index.ts       Zod — the validation boundary
  lib/money.ts           integer paisa. never floats.
  lib/ids.ts             UUIDv7, generated app-side
  repositories/
    types.ts             ⭐ THE SEAM — swap JSON for Postgres here
    json/                Phase 0 implementation (local dev only)
    index.ts             the one file that changes in Phase 6
  services/stock.ts      ⭐ THE CORE — receiveStock, recordStockOut, reconcile
scripts/
  seed.ts                demo data
  verify.ts              invariant tests
prisma/schema.prisma     ready for Phase 6
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
6. In `src/lib/session.ts`, change `'ADMIN'` to `'STAFF'` and reload. Cost prices,
   stock valuation and the profit column disappear — not hidden with CSS, *absent
   from the HTML*. That's PLAN.md §9.2, enforced by TypeScript.

## Next

Open Claude Code in this folder and say:

> Read PLAN.md and CLAUDE.md. Implement Phase 3 (Better Auth + roles + audit log)
> only. Replace the stub in src/lib/session.ts without changing its signature.
> Stop when done.
