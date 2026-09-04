-- Older invoice voids predate explicit trade-in cash recovery settlements.
-- Backfill one immutable recovery for every historical payout whose invoice is
-- already voided, while leaving any recovery recorded by the application intact.
INSERT INTO "sale_settlements" (
  "id",
  "receiptNumber",
  "idempotencyKey",
  "saleId",
  "type",
  "amount",
  "paymentMethod",
  "reference",
  "note",
  "recordedById",
  "recordedByName",
  "recordedAt",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  'TIR-MIG-' || payout."receiptNumber",
  'migration:trade-in-payout-recovery:' || payout."id",
  payout."saleId",
  'TRADE_IN_PAYOUT_RECOVERY'::"SaleSettlementType",
  payout."amount",
  payout."paymentMethod",
  payout."receiptNumber",
  'Historical recovery backfilled for a previously voided invoice.',
  COALESCE(void_actor."id", payout."recordedById"),
  COALESCE(void_actor."name", sale."voidedByName", payout."recordedByName"),
  COALESCE(sale."voidedAt", payout."recordedAt"),
  COALESCE(sale."voidedAt", payout."recordedAt")
FROM "sale_settlements" AS payout
JOIN "sales" AS sale
  ON sale."id" = payout."saleId"
LEFT JOIN "users" AS void_actor
  ON void_actor."id" = sale."voidedById"
WHERE payout."type" = 'TRADE_IN_PAYOUT'
  AND sale."status" = 'VOIDED'
  AND NOT EXISTS (
    SELECT 1
    FROM "sale_settlements" AS recovery
    WHERE recovery."saleId" = payout."saleId"
      AND recovery."type" = 'TRADE_IN_PAYOUT_RECOVERY'
      AND recovery."reference" = payout."receiptNumber"
  )
ON CONFLICT ("idempotencyKey") DO NOTHING;
