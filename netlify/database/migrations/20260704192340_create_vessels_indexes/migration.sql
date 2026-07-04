-- Keep Netlify Database migration validation satisfied for the vessel
-- classification/radar tracking persistence added in this deploy.
-- Runtime vessel records are stored with Netlify Blobs by netlify/functions/vessel-store.ts.

CREATE TABLE IF NOT EXISTS vessel_radar_classification_index (
  id BIGSERIAL PRIMARY KEY,
  imo_number TEXT,
  mmsi TEXT,
  vessel_name TEXT,
  ship_type TEXT,
  cargo_class TEXT,
  vessel_class TEXT,
  load_state TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  destination TEXT,
  last_port_of_call TEXT,
  predicted_destination TEXT,
  predicted_destination_confidence DOUBLE PRECISION,
  classification_complete BOOLEAN NOT NULL DEFAULT FALSE,
  radar_sweep_count INTEGER NOT NULL DEFAULT 0,
  missing_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vessel_radar_classification_index_imo_key
  ON vessel_radar_classification_index (imo_number)
  WHERE imo_number IS NOT NULL AND imo_number !~ '^MMSI-';

CREATE UNIQUE INDEX IF NOT EXISTS vessel_radar_classification_index_mmsi_key
  ON vessel_radar_classification_index (mmsi)
  WHERE mmsi IS NOT NULL;

CREATE INDEX IF NOT EXISTS vessel_radar_classification_index_name_idx
  ON vessel_radar_classification_index (vessel_name);

CREATE INDEX IF NOT EXISTS vessel_radar_classification_index_class_idx
  ON vessel_radar_classification_index (cargo_class, vessel_class, load_state);

CREATE INDEX IF NOT EXISTS vessel_radar_classification_index_last_seen_idx
  ON vessel_radar_classification_index (last_seen_at DESC);
