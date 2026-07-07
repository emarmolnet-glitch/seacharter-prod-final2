-- Restores the historical cotizaciones migration that is already present in
-- deployed database migration history.
CREATE TABLE IF NOT EXISTS "cotizaciones" (
  "id" bigserial PRIMARY KEY,
  "unique_reference" text NOT NULL,
  "issue_date" text NOT NULL,
  "calculation_data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizaciones_unique_reference_idx"
  ON "cotizaciones" ("unique_reference");

CREATE INDEX IF NOT EXISTS "cotizaciones_issue_date_idx"
  ON "cotizaciones" ("issue_date");
