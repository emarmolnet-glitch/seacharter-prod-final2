-- Restores the historical migration that already exists in deployed database history.
-- The migration is idempotent so existing databases keep their applied migration
-- record while fresh databases can create the quote history table.

CREATE TABLE IF NOT EXISTS "cotizaciones" (
  "id" BIGSERIAL PRIMARY KEY,
  "unique_reference" TEXT NOT NULL,
  "issue_date" DATE,
  "calculation_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizaciones_unique_reference_key"
  ON "cotizaciones" ("unique_reference");

CREATE INDEX IF NOT EXISTS "cotizaciones_issue_date_idx"
  ON "cotizaciones" ("issue_date");
