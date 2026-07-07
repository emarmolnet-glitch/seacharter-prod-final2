import { Pool, type Pool as PgPool } from "pg";

let pool: PgPool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("DATABASE_URL no esta configurada para guardar la ingesta.");
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });
  return pool;
}

async function ensureSchema() {
  schemaReady ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS data_bridge_vessel_ingestions (
      id serial PRIMARY KEY,
      source_file_name text,
      source_file_type text NOT NULL,
      source_provider text,
      audit_status text DEFAULT 'PENDIENTE_AUDITORIA' NOT NULL,
      vessel_count integer DEFAULT 0 NOT NULL,
      payload jsonb NOT NULL,
      raw_text text,
      error_message text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `).then(() => undefined);

  return schemaReady;
}

type DataBridgeIngestionInput = {
  sourceFileName: string;
  sourceFileType: string;
  sourceProvider: string;
  auditStatus: string;
  vesselCount: number;
  payload: unknown;
  rawText: string;
  errorMessage: string | null;
};

export async function createDataBridgeVesselIngestion(input: DataBridgeIngestionInput) {
  await ensureSchema();

  const result = await getPool().query<{ id: number }>(
    `
      INSERT INTO data_bridge_vessel_ingestions (
        source_file_name,
        source_file_type,
        source_provider,
        audit_status,
        vessel_count,
        payload,
        raw_text,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      RETURNING id
    `,
    [
      input.sourceFileName,
      input.sourceFileType,
      input.sourceProvider,
      input.auditStatus,
      input.vesselCount,
      JSON.stringify(input.payload),
      input.rawText,
      input.errorMessage,
    ],
  );

  return result.rows[0];
}
