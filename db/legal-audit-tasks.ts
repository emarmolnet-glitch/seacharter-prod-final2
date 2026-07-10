import { Pool, type Pool as PgPool } from "pg";

export type LegalAuditTaskStatus = "queued" | "processing" | "completed" | "failed";

export type LegalAuditTask = {
  id: string;
  status: LegalAuditTaskStatus;
  requestPayload: unknown;
  result: unknown | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

let pool: PgPool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("La conexión de base de datos no está configurada para la auditoría legal.");
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
    CREATE TABLE IF NOT EXISTS legal_audit_tasks (
      id uuid PRIMARY KEY,
      status text DEFAULT 'queued' NOT NULL,
      request_payload jsonb NOT NULL,
      result jsonb,
      error_message text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      started_at timestamp with time zone,
      completed_at timestamp with time zone
    );
    CREATE INDEX IF NOT EXISTS legal_audit_tasks_status_idx ON legal_audit_tasks (status);
    CREATE INDEX IF NOT EXISTS legal_audit_tasks_created_at_idx ON legal_audit_tasks (created_at);
  `).then(() => undefined);

  return schemaReady;
}

function mapTask(row: Record<string, unknown>): LegalAuditTask {
  return {
    id: String(row.id),
    status: row.status as LegalAuditTaskStatus,
    requestPayload: row.request_payload,
    result: row.result ?? null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    startedAt: (row.started_at as Date | null) ?? null,
    completedAt: (row.completed_at as Date | null) ?? null,
  };
}

export async function createLegalAuditTask(id: string, requestPayload: unknown) {
  await ensureSchema();
  const result = await getPool().query(
    `
      INSERT INTO legal_audit_tasks (id, status, request_payload)
      VALUES ($1, 'queued', $2::jsonb)
      RETURNING *
    `,
    [id, JSON.stringify(requestPayload)],
  );
  return mapTask(result.rows[0]);
}

export async function getLegalAuditTask(id: string) {
  await ensureSchema();
  const result = await getPool().query("SELECT * FROM legal_audit_tasks WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? mapTask(result.rows[0]) : undefined;
}

export async function markLegalAuditTaskProcessing(id: string) {
  await ensureSchema();
  await getPool().query(
    `
      UPDATE legal_audit_tasks
      SET status = 'processing', started_at = now(), updated_at = now(), error_message = NULL
      WHERE id = $1
    `,
    [id],
  );
}

export async function completeLegalAuditTask(id: string, result: unknown) {
  await ensureSchema();
  await getPool().query(
    `
      UPDATE legal_audit_tasks
      SET status = 'completed', result = $2::jsonb, completed_at = now(), updated_at = now(), error_message = NULL
      WHERE id = $1
    `,
    [id, JSON.stringify(result)],
  );
}

export async function failLegalAuditTask(id: string, errorMessage: string) {
  await ensureSchema();
  await getPool().query(
    `
      UPDATE legal_audit_tasks
      SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now()
      WHERE id = $1
    `,
    [id, errorMessage.slice(0, 2000)],
  );
}
