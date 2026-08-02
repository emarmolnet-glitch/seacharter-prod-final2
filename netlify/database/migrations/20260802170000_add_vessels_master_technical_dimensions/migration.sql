ALTER TABLE vessels_master
  ADD COLUMN IF NOT EXISTS gross_tonnage NUMERIC,
  ADD COLUMN IF NOT EXISTS loa_meters NUMERIC,
  ADD COLUMN IF NOT EXISTS year_built INT;

ALTER TABLE "vessels_master"
  DROP CONSTRAINT IF EXISTS "vessels_master_gross_tonnage_positive_check";

ALTER TABLE "vessels_master"
  ADD CONSTRAINT "vessels_master_gross_tonnage_positive_check"
  CHECK ("gross_tonnage" IS NULL OR "gross_tonnage" > 0) NOT VALID;

ALTER TABLE "vessels_master"
  DROP CONSTRAINT IF EXISTS "vessels_master_loa_meters_positive_check";

ALTER TABLE "vessels_master"
  ADD CONSTRAINT "vessels_master_loa_meters_positive_check"
  CHECK ("loa_meters" IS NULL OR "loa_meters" > 0) NOT VALID;

CREATE INDEX IF NOT EXISTS "vessels_master_mmsi_lookup_idx"
  ON "vessels_master" ("mmsi")
  WHERE "mmsi" IS NOT NULL;
