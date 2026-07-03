DO $$
BEGIN
  IF to_regclass('public.audited_vessels') IS NOT NULL THEN
    ALTER TABLE audited_vessels
      ADD COLUMN IF NOT EXISTS destination TEXT;

    CREATE INDEX IF NOT EXISTS audited_vessels_destination_idx
      ON audited_vessels (destination);
  END IF;
END $$;
