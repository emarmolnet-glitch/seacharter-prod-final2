ALTER TABLE "ais_vessels"
  ADD COLUMN IF NOT EXISTS "audit_status" text DEFAULT 'PENDING' NOT NULL;

UPDATE "ais_vessels"
SET "audit_status" = 'VALIDATED'
WHERE "audit_status" = 'PENDING';
