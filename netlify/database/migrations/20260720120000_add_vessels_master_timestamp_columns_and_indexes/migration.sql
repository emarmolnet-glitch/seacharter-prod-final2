ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "source" text;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "vessels_master_imo_number_sync_key"
  ON "vessels_master" ("imo_number");

CREATE INDEX IF NOT EXISTS "vessels_master_updated_at_idx"
  ON "vessels_master" ("updated_at" DESC);
