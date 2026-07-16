ALTER TABLE "ia_reports"
  ADD COLUMN IF NOT EXISTS "progress" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

CREATE INDEX IF NOT EXISTS "ia_reports_status_updated_at_idx"
  ON "ia_reports" ("status", "updated_at" DESC);
