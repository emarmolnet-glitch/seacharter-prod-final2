DO $$
BEGIN
  IF to_regclass('public.audited_vessels') IS NOT NULL THEN
    ALTER TABLE audited_vessels
      ADD COLUMN IF NOT EXISTS mmsi TEXT;

    CREATE INDEX IF NOT EXISTS audited_vessels_mmsi_idx
      ON audited_vessels (mmsi);
  END IF;
END $$;
