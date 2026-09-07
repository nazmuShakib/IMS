BEGIN;
-- Preserve the entry timestamps while introducing business-event timestamps.
ALTER TABLE "sales" ADD COLUMN "occurredAt" TIMESTAMP(3);
UPDATE "sales" SET "occurredAt" = "completedAt";
ALTER TABLE "sales" ALTER COLUMN "occurredAt" SET NOT NULL, ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "stock_movements" ADD COLUMN "occurredAt" TIMESTAMP(3);
UPDATE "stock_movements" SET "occurredAt" = "createdAt";
ALTER TABLE "stock_movements" ALTER COLUMN "occurredAt" SET NOT NULL, ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sale_settlements" ADD COLUMN "occurredAt" TIMESTAMP(3);
UPDATE "sale_settlements" SET "occurredAt" = "recordedAt";
ALTER TABLE "sale_settlements" ALTER COLUMN "occurredAt" SET NOT NULL, ALTER COLUMN "occurredAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "sales_occurredAt_idx" ON "sales"("occurredAt");
CREATE INDEX "stock_movements_occurredAt_idx" ON "stock_movements"("occurredAt");
CREATE INDEX "sale_settlements_occurredAt_idx" ON "sale_settlements"("occurredAt");
COMMIT;
