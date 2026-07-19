ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "latitude" double precision;

ALTER TABLE "vessels_master"
  ADD COLUMN IF NOT EXISTS "longitude" double precision;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vessels_master_latitude_range_check'
      AND conrelid = 'vessels_master'::regclass
  ) THEN
    ALTER TABLE "vessels_master"
      ADD CONSTRAINT "vessels_master_latitude_range_check"
      CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vessels_master_longitude_range_check'
      AND conrelid = 'vessels_master'::regclass
  ) THEN
    ALTER TABLE "vessels_master"
      ADD CONSTRAINT "vessels_master_longitude_range_check"
      CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS "vessels_master_coordinates_idx"
  ON "vessels_master" ("latitude", "longitude");
