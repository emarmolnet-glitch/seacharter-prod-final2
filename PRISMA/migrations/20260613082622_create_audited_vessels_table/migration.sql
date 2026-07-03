-- Restores the historical audited_vessels migration that exists in deployed
-- database migration history.

CREATE TABLE IF NOT EXISTS "audited_vessels" (
  "id" BIGSERIAL PRIMARY KEY,
  "imo_number" TEXT NOT NULL,
  "vessel_name" TEXT,
  "ship_type" TEXT,
  "dwt" DOUBLE PRECISION,
  "year_built" INTEGER,
  "loa" DOUBLE PRECISION,
  "beam" DOUBLE PRECISION,
  "draft" DOUBLE PRECISION,
  "flag" TEXT,
  "source" TEXT,
  "raw_data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "audited_vessels_imo_number_key"
  ON "audited_vessels" ("imo_number");

CREATE INDEX IF NOT EXISTS "audited_vessels_vessel_name_idx"
  ON "audited_vessels" ("vessel_name");
