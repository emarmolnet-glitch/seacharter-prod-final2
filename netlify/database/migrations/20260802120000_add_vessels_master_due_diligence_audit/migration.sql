ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "audit_status" text;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "source_provenance" text;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "status" text;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "origen" text;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "fecha_ultima_actualizacion" timestamp with time zone DEFAULT now();

CREATE INDEX IF NOT EXISTS "vessels_master_audit_status_updated_at_idx"
  ON "vessels_master" ("audit_status", "fecha_ultima_actualizacion" DESC);
