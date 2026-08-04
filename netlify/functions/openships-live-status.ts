import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { parseAisGeofence } from "./ais-geofence.js";

type OpenShipsStatusRow = QueryResultRow & {
  vessel: Record<string, unknown>;
};

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const url = new URL(req.url);
    const geofence = parseAisGeofence(url);
    const result = geofence
      ? await getPool().query<OpenShipsStatusRow>(`
      WITH latest AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(mmsi::text, ''), vessel_key))
          vessel_key,
          mmsi,
          vessel_name,
          latitude,
          longitude,
          speed_over_ground,
          course_over_ground,
          heading,
          vessel_type,
          observed_at,
          fetched_at,
          raw_data
        FROM ais_telemetry_buffer
        WHERE fetched_at >= NOW() - INTERVAL '24 hours'
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        ORDER BY COALESCE(NULLIF(mmsi::text, ''), vessel_key),
          COALESCE(observed_at, fetched_at, updated_at) DESC NULLS LAST
      ), candidates AS (
        SELECT *,
          3440.065 * 2 * ASIN(SQRT(LEAST(1,
            POWER(SIN(RADIANS(latitude - $1) / 2), 2) +
            COS(RADIANS($1)) * COS(RADIANS(latitude)) *
            POWER(SIN(RADIANS(longitude - $2) / 2), 2)
          ))) AS distance_nm
        FROM latest
        WHERE latitude BETWEEN $3 AND $4
          AND (($7 = FALSE AND longitude BETWEEN $5 AND $6)
            OR ($7 = TRUE AND (longitude >= $5 OR longitude <= $6)))
      )
      SELECT COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
        'storage_key', vessel_key,
        'vessel_key', vessel_key,
        'mmsi', mmsi,
        'vessel_name', vessel_name,
        'latitude', latitude,
        'longitude', longitude,
        'speed_over_ground', speed_over_ground,
        'course_over_ground', course_over_ground,
        'heading', heading,
        'vessel_type', vessel_type,
        'observed_at', observed_at,
        'fetched_at', fetched_at,
        'distance_to_pol_nm', distance_nm,
        'source', 'OPENSHIPS',
        'source_origin', 'OPENSHIPS',
        'source_origins', jsonb_build_array('OPENSHIPS'),
        'data_source', 'OPENSHIPS'
      ) AS vessel
      FROM candidates
      WHERE distance_nm <= $8
      ORDER BY distance_nm ASC, COALESCE(observed_at, fetched_at) DESC NULLS LAST
      LIMIT $9;
    `, [
        geofence.latitude,
        geofence.longitude,
        geofence.minLatitude,
        geofence.maxLatitude,
        geofence.minLongitude,
        geofence.maxLongitude,
        geofence.crossesAntimeridian,
        geofence.radiusNm,
        geofence.limit,
      ])
      : await getPool().query<OpenShipsStatusRow>(`
      SELECT DISTINCT ON (COALESCE(NULLIF(mmsi::text, ''), vessel_key))
        COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
          'storage_key', vessel_key,
          'vessel_key', vessel_key,
          'mmsi', mmsi,
          'vessel_name', vessel_name,
          'latitude', latitude,
          'longitude', longitude,
          'speed_over_ground', speed_over_ground,
          'course_over_ground', course_over_ground,
          'heading', heading,
          'vessel_type', vessel_type,
          'observed_at', observed_at,
          'fetched_at', fetched_at,
          'source', 'OPENSHIPS',
          'source_origin', 'OPENSHIPS',
          'source_origins', jsonb_build_array('OPENSHIPS'),
          'data_source', 'OPENSHIPS'
        ) AS vessel
      FROM ais_telemetry_buffer
      WHERE fetched_at >= NOW() - INTERVAL '24 hours'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY COALESCE(NULLIF(mmsi::text, ''), vessel_key),
        COALESCE(observed_at, fetched_at, updated_at) DESC NULLS LAST;
    `);
    const vessels = result.rows
      .map((row) => row.vessel)
      .filter((vessel) => vessel && typeof vessel === "object");

    return Response.json(
      {
        success: true,
        source: "OPENSHIPS",
        recent_vessels: vessels.length,
        count: vessels.length,
        openshipsCount: vessels.length,
        geofence: geofence
          ? { polLat: geofence.latitude, polLon: geofence.longitude, radiusNm: geofence.radiusNm }
          : null,
        vessels,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[openships-live-status] Unable to load recent vessel count.",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { error: "Unable to load OpenShips live status." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};

export const config: Config = {
  path: "/api/openships/live-status",
  method: "GET",
};
