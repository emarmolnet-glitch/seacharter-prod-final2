CREATE TABLE IF NOT EXISTS coa_client_profiles (
  id BIGSERIAL PRIMARY KEY,
  profile_name TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  owner_margin_percent NUMERIC(6, 3) NOT NULL DEFAULT 15.000,
  charterer_margin_percent NUMERIC(6, 3) NOT NULL DEFAULT 10.000,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coa_temporary_adjustments (
  id UUID PRIMARY KEY,
  client_profile_id BIGINT REFERENCES coa_client_profiles(id) ON DELETE SET NULL,
  voyage_ref TEXT NOT NULL,
  owner_margin_percent NUMERIC(6, 3) NOT NULL DEFAULT 15.000,
  charterer_margin_percent NUMERIC(6, 3) NOT NULL DEFAULT 10.000,
  reason TEXT NOT NULL DEFAULT 'Ajuste Temporal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coa_temporary_adjustments_voyage_ref_idx
  ON coa_temporary_adjustments (voyage_ref);

CREATE UNIQUE INDEX IF NOT EXISTS coa_client_profiles_single_default_idx
  ON coa_client_profiles (is_default)
  WHERE is_default;
