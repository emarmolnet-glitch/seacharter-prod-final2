-- Restores the historical migration that already exists in deployed database
-- migration history. The statements are idempotent so Prisma can reconcile
-- existing deployments and fresh databases can still reach the expected shape.
DO $$
BEGIN
  IF to_regclass('public.cotizaciones') IS NOT NULL THEN
    ALTER TABLE "cotizaciones"
      ADD COLUMN IF NOT EXISTS "freight" numeric,
      ADD COLUMN IF NOT EXISTS "breakdown" jsonb;
  END IF;
END $$;
