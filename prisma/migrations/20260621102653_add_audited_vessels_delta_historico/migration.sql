ALTER TABLE IF EXISTS "audited_vessels"
  ADD COLUMN IF NOT EXISTS "delta_historico" TEXT;
