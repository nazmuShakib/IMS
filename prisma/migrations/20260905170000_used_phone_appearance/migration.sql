BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "product_units" ADD COLUMN "cosmeticCondition" JSONB;
ALTER TABLE "sale_items" ADD COLUMN "cosmeticCondition" JSONB;
COMMIT;
