-- Restores the historical migration that exists in deployed database history.
-- The migration is intentionally idempotent so existing deployments can keep
-- their applied migration record while fresh databases can build the base tables.

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

CREATE TABLE IF NOT EXISTS "cotizaciones" (
  "id" BIGSERIAL PRIMARY KEY,
  "unique_reference" TEXT NOT NULL,
  "issue_date" DATE,
  "calculation_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "charter_party_standard" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizaciones_unique_reference_key"
  ON "cotizaciones" ("unique_reference");

CREATE INDEX IF NOT EXISTS "cotizaciones_issue_date_idx"
  ON "cotizaciones" ("issue_date");
