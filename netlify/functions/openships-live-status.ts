import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

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
    const result = await getPool().query<OpenShipsStatusRow>(`
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
      { recent_vessels: vessels.length, vessels },
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
