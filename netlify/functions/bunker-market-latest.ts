import type { Config } from "@netlify/functions";
import { getDatabase } from "netlify-database-client";

type BunkerPriceRow = {
  hub_name: string;
  fuel_grade: string;
  price: number | string;
  source: string | null;
  created_at: string;
};

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function getConnectionString() {
  return process.env.DATABASE_URL
    || process.env.NETLIFY_DATABASE_URL
    || process.env.NETLIFY_DB_URL;
}

export default async function handler(request: Request) {
  if (request.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    return Response.json({ success: false, error: "Database unavailable" }, { status: 503, headers });
  }

  try {
    const database = getDatabase({ connectionString });
    const pool = database.pool as unknown as {
      query: <Row>(query: string) => Promise<{ rows: Row[] }>;
    };
    const result = await pool.query<BunkerPriceRow>(`
      SELECT DISTINCT ON (
        UPPER(BTRIM(hub_name)),
        UPPER(REPLACE(BTRIM(fuel_grade), ' ', ''))
      )
        BTRIM(hub_name) AS hub_name,
        UPPER(REPLACE(BTRIM(fuel_grade), ' ', '')) AS fuel_grade,
        price::float8 AS price,
        source,
        created_at
      FROM bunker_prices_log
      WHERE price IS NOT NULL
        AND price > 0
        AND NULLIF(BTRIM(hub_name), '') IS NOT NULL
        AND NULLIF(BTRIM(fuel_grade), '') IS NOT NULL
      ORDER BY
        UPPER(BTRIM(hub_name)),
        UPPER(REPLACE(BTRIM(fuel_grade), ' ', '')),
        created_at DESC,
        id DESC
    `);
    const bunkers = result.rows.map((row) => ({
      ...row,
      price: Number(row.price),
    }));

    return Response.json({
      success: true,
      data: { bunkers },
      bunkers,
      updated_at: bunkers.reduce<string | null>((latest, row) => {
        if (!latest || new Date(row.created_at).getTime() > new Date(latest).getTime()) return row.created_at;
        return latest;
      }, null),
    }, { headers });
  } catch (error) {
    console.error("[bunker-market-latest] Database query failed", error);
    return Response.json({ success: false, error: "Bunker market data unavailable" }, { status: 500, headers });
  }
}

export const config: Config = {
  path: "/api/market/bunkers-latest",
};
