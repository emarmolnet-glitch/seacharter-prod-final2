import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type OpenShipsStatusRow = QueryResultRow & {
  recent_vessels: string | number;
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
      SELECT COUNT(DISTINCT mmsi) AS recent_vessels
      FROM ais_telemetry_buffer
      WHERE fetched_at >= NOW() - INTERVAL '24 hours';
    `);
    const recentVessels = Number(result.rows[0]?.recent_vessels ?? 0);

    return Response.json(
      { recent_vessels: recentVessels },
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
