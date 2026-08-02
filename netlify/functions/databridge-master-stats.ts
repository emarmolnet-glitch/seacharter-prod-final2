import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type MasterStatsRow = QueryResultRow & {
  total_vessels: number | string;
};

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const result = await getPool().query<MasterStatsRow>(
      `
        SELECT
          COUNT(*)::integer AS total_vessels
        FROM vessels_master
      `,
    );
    const row = result.rows[0];
    return Response.json({
      success: true,
      totalVessels: Number(row?.total_vessels || 0),
    }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error("[databridge-master-stats] Query failed", error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/databridge-master-stats",
  method: ["GET"],
};
