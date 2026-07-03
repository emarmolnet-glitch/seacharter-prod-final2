CREATE TABLE IF NOT EXISTS coa_snapshots (
  id TEXT PRIMARY KEY,
  voyage_ref TEXT NOT NULL,
  vessel_name TEXT,
  imo TEXT,
  pol TEXT,
  pod TEXT,
  eta_base_radar TEXT,
  bunker_index_date TEXT,
  target_price TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coa_snapshots_created_at_idx
  ON coa_snapshots (created_at DESC);

CREATE INDEX IF NOT EXISTS coa_snapshots_voyage_ref_idx
  ON coa_snapshots (voyage_ref);
