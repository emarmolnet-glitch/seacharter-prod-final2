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

export type MatchingSourceSystem = "DATABRIDGE" | "AIS_LIVE" | "OPENSHIPS";

export type PaginatedMatchingSourceRow = QueryResultRow & {
  source_system: MatchingSourceSystem;
  payload: Record<string, unknown>;
  total_count: string | number;
};

export type PaginatedMatchingSources = {
  rows: PaginatedMatchingSourceRow[];
  totalCount: number;
  limit: number;
  offset: number;
};

const MATCHING_SOURCE_SYSTEMS = new Set<MatchingSourceSystem>(["DATABRIDGE", "AIS_LIVE", "OPENSHIPS"]);

export function normalizeAllowedMatchingSources(value: unknown): MatchingSourceSystem[] {
  if (!Array.isArray(value)) return ["DATABRIDGE", "AIS_LIVE"];
  const normalized = [...new Set(value
    .map((source) => String(source || "").trim().toUpperCase())
    .filter((source): source is MatchingSourceSystem => MATCHING_SOURCE_SYSTEMS.has(source as MatchingSourceSystem)))];
  return normalized.length > 0 ? normalized : ["DATABRIDGE", "AIS_LIVE"];
}

export async function listPaginatedMatchingSources(
  allowedSources: MatchingSourceSystem[],
  latitude: number | null,
  longitude: number | null,
  radiusNm: number,
  limit = 50,
  offset = 0,
): Promise<PaginatedMatchingSources> {
  const safeSources = normalizeAllowedMatchingSources(allowedSources);
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const safeOffset = Math.min(100000, Math.max(0, Math.trunc(offset)));
  const safeRadius = Math.min(5000, Math.max(1, radiusNm));
  const safeLatitude = Number.isFinite(latitude) ? latitude : null;
  const safeLongitude = Number.isFinite(longitude) ? longitude : null;
  const result = await getPool().query<PaginatedMatchingSourceRow>(
    `
      WITH source_rows AS (
        SELECT
          'DATABRIDGE'::text AS source_system,
          to_jsonb(vm) AS payload,
          vm.fecha_ultima_actualizacion AS sort_at,
          NULL::double precision AS distance_nm
        FROM vessels_master vm
        WHERE vm.status = 'EN_CARTERA'
          OR vm.validation_status = 'VALIDADO'

        UNION ALL

        SELECT
          'AIS_LIVE'::text AS source_system,
          to_jsonb(av) || jsonb_build_object(
            'distance_nm', CASE
              WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
              ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
                POWER(SIN(RADIANS(av.latitude - $2) / 2), 2) +
                COS(RADIANS($2)) * COS(RADIANS(av.latitude)) *
                POWER(SIN(RADIANS(av.longitude - $3) / 2), 2)
              )))
            END
          ) AS payload,
          av.last_seen_at AS sort_at,
          CASE
            WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
            ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(av.latitude - $2) / 2), 2) +
              COS(RADIANS($2)) * COS(RADIANS(av.latitude)) *
              POWER(SIN(RADIANS(av.longitude - $3) / 2), 2)
            )))
          END AS distance_nm
        FROM ais_vessels av
        WHERE av.audit_status = 'VALIDATED'

        UNION ALL

        SELECT
          'OPENSHIPS'::text AS source_system,
          COALESCE(os.raw_data, '{}'::jsonb) || jsonb_build_object(
            'storage_key', os.vessel_key,
            'vessel_key', os.vessel_key,
            'mmsi', os.mmsi,
            'vessel_name', os.vessel_name,
            'latitude', os.latitude,
            'longitude', os.longitude,
            'speed_over_ground', os.speed_over_ground,
            'course_over_ground', os.course_over_ground,
            'heading', os.heading,
            'vessel_type', os.vessel_type,
            'observed_at', os.observed_at,
            'fetched_at', os.fetched_at,
            'distance_nm', CASE
              WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
              ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
                POWER(SIN(RADIANS(os.latitude::double precision - $2) / 2), 2) +
                COS(RADIANS($2)) * COS(RADIANS(os.latitude::double precision)) *
                POWER(SIN(RADIANS(os.longitude::double precision - $3) / 2), 2)
              )))
            END
          ) AS payload,
          COALESCE(os.observed_at, os.fetched_at, os.updated_at) AS sort_at,
          CASE
            WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
            ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(os.latitude::double precision - $2) / 2), 2) +
              COS(RADIANS($2)) * COS(RADIANS(os.latitude::double precision)) *
              POWER(SIN(RADIANS(os.longitude::double precision - $3) / 2), 2)
            )))
          END AS distance_nm
        FROM ais_telemetry_buffer os
        WHERE os.fetched_at >= NOW() - INTERVAL '24 hours'
          AND os.latitude IS NOT NULL
          AND os.longitude IS NOT NULL
      ), filtered_sources AS (
        SELECT *
        FROM source_rows
        WHERE source_system = ANY($1::text[])
          AND (source_system = 'DATABRIDGE' OR distance_nm <= $4)
      ), active_source AS (
        SELECT source_system
        FROM filtered_sources
        GROUP BY source_system
        ORDER BY CASE source_system
          WHEN 'OPENSHIPS' THEN 1
          WHEN 'AIS_LIVE' THEN 2
          WHEN 'DATABRIDGE' THEN 3
          ELSE 4
        END
        LIMIT 1
      ), ranked_sources AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY source_system
          ORDER BY sort_at DESC NULLS LAST, payload->>'mmsi', payload->>'vessel_name'
        ) AS source_position
        FROM filtered_sources
        WHERE source_system = (SELECT source_system FROM active_source)
      )
      SELECT source_system, payload, COUNT(*) OVER() AS total_count
      FROM ranked_sources
      ORDER BY source_position, source_system
      LIMIT $5
      OFFSET $6
    `,
    [safeSources, safeLatitude, safeLongitude, safeRadius, safeLimit, safeOffset],
  );
  return {
    rows: result.rows,
    totalCount: Number(result.rows[0]?.total_count ?? safeOffset),
    limit: safeLimit,
    offset: safeOffset,
  };
}

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
