DO $$
BEGIN
  IF to_regclass('public.audited_vessels') IS NOT NULL THEN
    ALTER TABLE audited_vessels
      ADD COLUMN IF NOT EXISTS audit_status TEXT NOT NULL DEFAULT 'Approved';

    CREATE INDEX IF NOT EXISTS audited_vessels_audit_status_idx
      ON audited_vessels (audit_status);
  END IF;
END $$;
