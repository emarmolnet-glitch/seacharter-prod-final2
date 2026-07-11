import { Pool, type Pool as PgPool } from "pg";

let pool: PgPool | null = null;
let applicationSchemaReady: Promise<void> | null = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("DATABASE_URL no esta configurada para acceder a Neon.");
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

  return pool;
}

export async function ensureApplicationSchema() {
  applicationSchemaReady ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS session_sync (
      user_id UUID PRIMARY KEY,
      last_sync_data JSONB NOT NULL CHECK (jsonb_typeof(last_sync_data) = 'array'),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ia_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status TEXT NOT NULL DEFAULT 'PENDING',
      request_payload JSONB NOT NULL,
      report_data JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).then(() => undefined).catch((error) => {
    applicationSchemaReady = null;
    throw error;
  });

  return applicationSchemaReady;
}
