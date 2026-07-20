import type { Config } from "@netlify/functions";
import type { PoolClient } from "pg";
import { getPool } from "../../db/index.js";

const RADAR_BUFFER_TABLE = "vessel_radar_feed";

type PostgreSqlError = Error & {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  constraint?: string;
};

function databaseErrorDetails(error: unknown) {
  const databaseError = error as PostgreSqlError;
  return {
    message: databaseError instanceof Error ? databaseError.message : "Unknown database error",
    code: databaseError.code || null,
    severity: databaseError.severity || null,
    detail: databaseError.detail || null,
    hint: databaseError.hint || null,
    schema: databaseError.schema || null,
    table: databaseError.table || null,
    constraint: databaseError.constraint || null,
  };
}

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  if (!process.env.DATABASE_URL) {
    console.error("[test-db-write] DATABASE_URL is not available to the function runtime.");
    return Response.json({
      ok: false,
      databaseUrlAvailable: false,
      poolConnected: false,
      error: "DATABASE_URL is not configured",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (error) {
    const details = databaseErrorDetails(error);
    console.error("[test-db-write] Neon pool connection failed.", details);
    return Response.json({
      ok: false,
      databaseUrlAvailable: true,
      poolConnected: false,
      error: details.message,
      databaseErrorCode: details.code,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  try {
    await client.query("BEGIN");
    const result = await client.query<{
      table_exists: boolean;
      can_select: boolean;
      can_insert: boolean;
    }>(`
      SELECT
        to_regclass('public.vessel_radar_feed') IS NOT NULL AS table_exists,
        COALESCE(has_table_privilege(current_user, to_regclass('public.vessel_radar_feed'), 'SELECT'), FALSE) AS can_select,
        COALESCE(has_table_privilege(current_user, to_regclass('public.vessel_radar_feed'), 'INSERT'), FALSE) AS can_insert
    `);
    const access = result.rows[0];

    if (!access?.table_exists) {
      const error = new Error(`Database table public.${RADAR_BUFFER_TABLE} does not exist`) as PostgreSqlError;
      error.code = "42P01";
      error.table = RADAR_BUFFER_TABLE;
      throw error;
    }
    if (!access.can_select || !access.can_insert) {
      const error = new Error(`Database role cannot write to public.${RADAR_BUFFER_TABLE}`) as PostgreSqlError;
      error.code = "42501";
      error.table = RADAR_BUFFER_TABLE;
      throw error;
    }

    await client.query(`LOCK TABLE public.${RADAR_BUFFER_TABLE} IN ROW EXCLUSIVE MODE NOWAIT`);
    await client.query("ROLLBACK");

    return Response.json({
      ok: true,
      databaseUrlAvailable: true,
      poolConnected: true,
      buffer: {
        table: RADAR_BUFFER_TABLE,
        exists: true,
        readable: true,
        writable: true,
        writeLockVerified: true,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const details = databaseErrorDetails(error);
    console.error("[test-db-write] Neon write diagnostic failed.", details);
    return Response.json({
      ok: false,
      databaseUrlAvailable: true,
      poolConnected: true,
      buffer: RADAR_BUFFER_TABLE,
      error: details.message,
      databaseErrorCode: details.code,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  } finally {
    client.release();
  }
};

export const config: Config = {
  path: "/api/test-db-write",
  method: ["GET", "POST"],
};
