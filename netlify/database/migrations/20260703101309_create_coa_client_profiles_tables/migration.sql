CREATE TABLE IF NOT EXISTS coa_client_profiles (
  id BIGSERIAL PRIMARY KEY,
  profile_name TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  owner_margin_percent NUMERIC(7, 3) NOT NULL DEFAULT 15.000,
  charterer_margin_percent NUMERIC(7, 3) NOT NULL DEFAULT 10.000,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coa_client_profiles_owner_margin_range
    CHECK (owner_margin_percent >= 0 AND owner_margin_percent <= 95),
  CONSTRAINT coa_client_profiles_charterer_margin_range
    CHECK (charterer_margin_percent >= 0 AND charterer_margin_percent <= 95)
);

CREATE UNIQUE INDEX IF NOT EXISTS coa_client_profiles_single_default_idx
  ON coa_client_profiles (is_default)
  WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS coa_temporary_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id BIGINT REFERENCES coa_client_profiles(id) ON DELETE SET NULL,
  voyage_ref TEXT NOT NULL,
  owner_margin_percent NUMERIC(7, 3) NOT NULL,
  charterer_margin_percent NUMERIC(7, 3) NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Ajuste Temporal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coa_temporary_adjustments_owner_margin_range
    CHECK (owner_margin_percent >= 0 AND owner_margin_percent <= 95),
  CONSTRAINT coa_temporary_adjustments_charterer_margin_range
    CHECK (charterer_margin_percent >= 0 AND charterer_margin_percent <= 95)
);

CREATE INDEX IF NOT EXISTS coa_temporary_adjustments_voyage_ref_idx
  ON coa_temporary_adjustments (voyage_ref);

CREATE TABLE IF NOT EXISTS coa_scenario_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_ref TEXT NOT NULL,
  vessel_name TEXT,
  imo TEXT,
  pol TEXT,
  pod TEXT,
  eta_base_radar TIMESTAMPTZ,
  bunker_index_date DATE,
  target_price NUMERIC(14, 4),
  optimistic_scenario JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_scenario JSONB NOT NULL DEFAULT '{}'::jsonb,
  pessimistic_scenario JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coa_scenario_snapshots_voyage_ref_idx
  ON coa_scenario_snapshots (voyage_ref);

INSERT INTO coa_client_profiles (
  profile_name,
  client_name,
  owner_margin_percent,
  charterer_margin_percent,
  is_default
)
VALUES
  ('Cliente_Spot', 'Cliente Spot', 15.000, 10.000, TRUE),
  ('Cliente_COA_Premium', 'Cliente COA Premium', 12.000, 7.500, FALSE),
  ('Cliente_Frecuente', 'Cliente Frecuente', 13.500, 8.500, FALSE)
ON CONFLICT (profile_name) DO UPDATE SET
  client_name = EXCLUDED.client_name,
  owner_margin_percent = EXCLUDED.owner_margin_percent,
  charterer_margin_percent = EXCLUDED.charterer_margin_percent,
  is_default = EXCLUDED.is_default,
  updated_at = NOW();
