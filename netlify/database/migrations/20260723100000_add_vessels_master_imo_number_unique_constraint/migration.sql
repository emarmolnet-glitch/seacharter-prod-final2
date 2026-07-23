DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vessels_master_imo_number_unique'
      AND conrelid = 'vessels_master'::regclass
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'vessels_master'::regclass
      AND i.indisunique
      AND a.attname = 'imo_number'
  ) THEN
    ALTER TABLE "vessels_master"
      ADD CONSTRAINT "vessels_master_imo_number_unique" UNIQUE ("imo_number");
  END IF;
END
$migration$;
