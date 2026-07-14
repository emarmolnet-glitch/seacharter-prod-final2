import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type Pool as PgPool } from "pg";
import * as schema from "./schema.js";

let pool: PgPool | null = null;
let applicationSchemaReady: Promise<void> | null = null;

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("La conexión de Netlify Database no está configurada.");
  }

  return connectionString;
}

export function getPool() {
  if (pool) return pool;

  const connectionString = getConnectionString();

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

  return pool;
}

export const db = drizzle({ client: getPool(), schema });

export async function ensureApplicationSchema() {
  applicationSchemaReady ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS session_sync (
      user_id TEXT PRIMARY KEY,
      last_sync_data JSONB NOT NULL,
      last_action_module TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT session_sync_payload_object_check
        CHECK (jsonb_typeof(last_sync_data) = 'object')
    );

    ALTER TABLE session_sync
      DROP CONSTRAINT IF EXISTS session_sync_vessel_array_check;

    ALTER TABLE session_sync
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;

    ALTER TABLE session_sync
      ADD COLUMN IF NOT EXISTS last_action_module TEXT;

    UPDATE session_sync
    SET
      last_sync_data = CASE
        WHEN jsonb_typeof(last_sync_data) = 'array'
          THEN jsonb_build_object(
            'vessels', last_sync_data,
            'updated_at', COALESCE(updated_at, NOW())
          )
        WHEN jsonb_typeof(last_sync_data) = 'object' AND NOT (last_sync_data ? 'vessels')
          THEN jsonb_build_object(
            'vessels', '[]'::jsonb,
            'updated_at', COALESCE(updated_at, NOW())
          ) || last_sync_data
        ELSE last_sync_data
      END,
      last_action_module = COALESCE(last_action_module, 'CORE_PRO_MATCHING');

    ALTER TABLE session_sync
      ALTER COLUMN last_action_module SET NOT NULL;

    DO $schema_update$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'session_sync_payload_object_check'
          AND conrelid = 'session_sync'::regclass
      ) THEN
        ALTER TABLE session_sync
          ADD CONSTRAINT session_sync_payload_object_check
          CHECK (jsonb_typeof(last_sync_data) = 'object');
      END IF;
    END
    $schema_update$;

    CREATE TABLE IF NOT EXISTS ia_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status TEXT NOT NULL DEFAULT 'PENDING',
      request_payload JSONB NOT NULL,
      report_data JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).then(() => undefined).catch((error: unknown) => {
    applicationSchemaReady = null;
    throw error;
  });

  return applicationSchemaReady;
}
