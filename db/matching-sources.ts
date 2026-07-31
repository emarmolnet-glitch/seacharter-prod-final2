import type { QueryResultRow } from "pg";
import { getPool } from "./index.js";
import type { VesselMasterRow } from "./vessels-master.js";

export type AisMatchingRow = QueryResultRow & {
  storage_key: string;
  imo_number: string | null;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  source: string | null;
  audit_status: string;
  raw_data: unknown;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  distance_nm: number;
};

const DATA_BRIDGE_COLUMNS = `
  imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
  draft_meters, flag, eta, last_port, current_destination, year_built,
  owner_manager, has_gears, process_status, source_payload,
  status, validation_status, origen, fecha_ultima_actualizacion AS updated_at
`;

export async function listDataBridgePortfolioVessels(limit = 2000) {
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query<VesselMasterRow>(
    `
      SELECT ${DATA_BRIDGE_COLUMNS}
      FROM vessels_master
      WHERE status = 'EN_CARTERA'
        OR validation_status = 'VALIDADO'
      ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

export async function listValidatedAisVesselsNearPol(
  latitude: number,
  longitude: number,
  radiusNm: number,
  limit = 2000,
) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const safeRadius = Math.min(5000, Math.max(1, radiusNm));
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const latitudeDelta = safeRadius / 60;
  const longitudeScale = Math.max(Math.cos(latitude * Math.PI / 180), 0.01);
  const longitudeDelta = Math.min(180, safeRadius / (60 * longitudeScale));
  const minLatitude = Math.max(-90, latitude - latitudeDelta);
  const maxLatitude = Math.min(90, latitude + latitudeDelta);
  const rawMinLongitude = longitude - longitudeDelta;
  const rawMaxLongitude = longitude + longitudeDelta;
  const crossesAntimeridian = rawMinLongitude < -180 || rawMaxLongitude > 180;
  const minLongitude = rawMinLongitude < -180 ? rawMinLongitude + 360 : rawMinLongitude;
  const maxLongitude = rawMaxLongitude > 180 ? rawMaxLongitude - 360 : rawMaxLongitude;

  const result = await getPool().query<AisMatchingRow>(
    `
      WITH candidates AS (
        SELECT *,
          3440.065 * 2 * ASIN(SQRT(LEAST(1,
            POWER(SIN(RADIANS(latitude - $1) / 2), 2) +
            COS(RADIANS($1)) * COS(RADIANS(latitude)) *
            POWER(SIN(RADIANS(longitude - $2) / 2), 2)
          ))) AS distance_nm
        FROM ais_vessels
        WHERE latitude BETWEEN $3 AND $4
          AND (($7 = FALSE AND longitude BETWEEN $5 AND $6)
            OR ($7 = TRUE AND (longitude >= $5 OR longitude <= $6)))
          AND audit_status = 'VALIDATED'
      )
      SELECT *
      FROM candidates
      WHERE distance_nm <= $8
      ORDER BY distance_nm ASC, last_seen_at DESC
      LIMIT $9
    `,
    [
      latitude,
      longitude,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
      crossesAntimeridian,
      safeRadius,
      safeLimit,
    ],
  );
  return result.rows;
}
