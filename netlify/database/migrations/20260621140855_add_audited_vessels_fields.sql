-- Restores the historical migration that already exists in deployed database history.
-- The fields are idempotent so deploy reconciliation succeeds for existing
-- databases and fresh databases can still converge on the expected schema.

DO $$
BEGIN
  IF to_regclass('public.external_priority_records') IS NOT NULL THEN
    ALTER TABLE "external_priority_records"
      ADD COLUMN IF NOT EXISTS "imo" text DEFAULT 'N/A' NOT NULL,
      ADD COLUMN IF NOT EXISTS "open_country" text DEFAULT 'N/A' NOT NULL,
      ADD COLUMN IF NOT EXISTS "dwt" integer DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS "pol" text DEFAULT 'N/A' NOT NULL,
      ADD COLUMN IF NOT EXISTS "pod" text DEFAULT 'N/A' NOT NULL,
      ADD COLUMN IF NOT EXISTS "cargo_quantity" numeric DEFAULT '0' NOT NULL,
      ADD COLUMN IF NOT EXISTS "laycan" text DEFAULT 'N/A' NOT NULL,
      ADD COLUMN IF NOT EXISTS "owner_cost" numeric DEFAULT '0' NOT NULL,
      ADD COLUMN IF NOT EXISTS "owner_internal_price" numeric DEFAULT '0' NOT NULL,
      ADD COLUMN IF NOT EXISTS "charterer_sale_freight" numeric DEFAULT '0' NOT NULL,
      ADD COLUMN IF NOT EXISTS "raw_payload" jsonb,
      ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
  END IF;
END $$;
