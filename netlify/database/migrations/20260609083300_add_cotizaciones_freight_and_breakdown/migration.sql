-- Restore the historical Prisma migration that was already applied in production.
-- The statements are idempotent so a fresh or partially migrated database can
-- tolerate the migration while existing production databases keep their history.
ALTER TABLE IF EXISTS "cotizaciones"
  ADD COLUMN IF NOT EXISTS "freight_buy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freight_sell" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "freight_spread" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "breakdown" JSONB;

ALTER TABLE IF EXISTS "cotizaciones"
  ADD COLUMN IF NOT EXISTS "flete_compra" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "flete_venta" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "desglose" JSONB;
