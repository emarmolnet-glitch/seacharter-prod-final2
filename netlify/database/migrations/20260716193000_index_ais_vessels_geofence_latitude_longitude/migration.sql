CREATE INDEX IF NOT EXISTS ais_vessels_geofence_idx
  ON ais_vessels (latitude, longitude);

CREATE INDEX IF NOT EXISTS ais_vessels_audit_last_seen_idx
  ON ais_vessels (audit_status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS ais_vessels_type_idx
  ON ais_vessels (vessel_type);
