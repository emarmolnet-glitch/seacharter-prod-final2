ALTER TABLE "external_priority_records"
ADD COLUMN IF NOT EXISTS "imo" text DEFAULT 'N/A' NOT NULL;
