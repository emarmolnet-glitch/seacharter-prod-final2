import { Pool, type Pool as PgPool } from "pg";

export type SessionSyncStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type SessionSyncTask = {
  taskId: string;
  status: SessionSyncStatus;
  requestPayload: unknown;
  result: unknown | null;
  errorMessage: string | null;
  createdAt: unknown | null;
  updatedAt: unknown | null;
};

type SessionSyncColumns = {
  taskId: string;
  status: string;
  requestPayload: string;
  result: string;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const TASK_ID_COLUMNS = ["task_id", "id"];
const STATUS_COLUMNS = ["status", "estado"];
const REQUEST_COLUMNS = ["request_payload", "request", "payload", "data"];
const RESULT_COLUMNS = ["result", "response_payload", "response", "resultado"];
const ERROR_COLUMNS = ["error_message", "error"];
const CREATED_COLUMNS = ["created_at", "created"];
const UPDATED_COLUMNS = ["updated_at", "updated"];

let columnsPromise: Promise<SessionSyncColumns> | null = null;
let pool: PgPool | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("DATABASE_URL no está configurada para sincronizar tareas.");
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });
  return pool;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function pickColumn(available: Set<string>, candidates: string[], label: string) {
  const column = candidates.find((candidate) => available.has(candidate));
  if (!column) {
    throw new Error(`La tabla session_sync no contiene la columna requerida para ${label}.`);
  }
  return column;
}

function pickOptionalColumn(available: Set<string>, candidates: string[]) {
  return candidates.find((candidate) => available.has(candidate)) || null;
}

async function getColumns() {
  columnsPromise ??= (async () => {
    const result = await getPool().query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'session_sync'
      ORDER BY ordinal_position
    `);
    const available = new Set(result.rows.map((row) => String(row.column_name)));
    if (available.size === 0) {
      throw new Error("La tabla session_sync no existe en el esquema activo de Neon.");
    }

    return {
      taskId: pickColumn(available, TASK_ID_COLUMNS, "task_id"),
      status: pickColumn(available, STATUS_COLUMNS, "status"),
      requestPayload: pickColumn(available, REQUEST_COLUMNS, "request_payload"),
      result: pickColumn(available, RESULT_COLUMNS, "result"),
      errorMessage: pickOptionalColumn(available, ERROR_COLUMNS),
      createdAt: pickOptionalColumn(available, CREATED_COLUMNS),
      updatedAt: pickOptionalColumn(available, UPDATED_COLUMNS),
    };
  })();

  return columnsPromise;
}

function selectExpression(column: string | null, alias: string, fallback: string) {
  return column ? `${quoteIdentifier(column)} AS ${quoteIdentifier(alias)}` : `${fallback} AS ${quoteIdentifier(alias)}`;
}

function mapTask(row: Record<string, unknown>): SessionSyncTask {
  return {
    taskId: String(row.task_id),
    status: String(row.status).toUpperCase() as SessionSyncStatus,
    requestPayload: row.request_payload,
    result: row.result ?? null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function selectTask(taskId: string) {
  const columns = await getColumns();
  const result = await getPool().query(
    `
      SELECT
        ${quoteIdentifier(columns.taskId)} AS task_id,
        ${quoteIdentifier(columns.status)} AS status,
        ${quoteIdentifier(columns.requestPayload)} AS request_payload,
        ${quoteIdentifier(columns.result)} AS result,
        ${selectExpression(columns.errorMessage, "error_message", "NULL::text")},
        ${selectExpression(columns.createdAt, "created_at", "NULL::timestamptz")},
        ${selectExpression(columns.updatedAt, "updated_at", "NULL::timestamptz")}
      FROM session_sync
      WHERE ${quoteIdentifier(columns.taskId)} = $1
      LIMIT 1
    `,
    [taskId],
  );
  return result.rows[0] ? mapTask(result.rows[0]) : undefined;
}

export async function createSessionSyncTask(taskId: string, requestPayload: unknown) {
  const columns = await getColumns();
  const insertColumns = [columns.taskId, columns.status, columns.requestPayload];
  const placeholders = ["$1", "$2", "$3"];

  if (columns.result) {
    insertColumns.push(columns.result);
    placeholders.push("NULL");
  }
  if (columns.errorMessage) {
    insertColumns.push(columns.errorMessage);
    placeholders.push("NULL");
  }

  await getPool().query(
    `INSERT INTO session_sync (${insertColumns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders.join(", ")})`,
    [taskId, "PENDING", JSON.stringify(requestPayload)],
  );
  return selectTask(taskId);
}

export async function getSessionSyncTask(taskId: string) {
  return selectTask(taskId);
}

async function updateTask(taskId: string, status: SessionSyncStatus, result: unknown | null, errorMessage: string | null) {
  const columns = await getColumns();
  const assignments = [`${quoteIdentifier(columns.status)} = $2`, `${quoteIdentifier(columns.result)} = $3`];
  const values: unknown[] = [taskId, status, result === null ? null : JSON.stringify(result)];

  if (columns.errorMessage) {
    assignments.push(`${quoteIdentifier(columns.errorMessage)} = $4`);
    values.push(errorMessage ? errorMessage.slice(0, 2000) : null);
  }
  if (columns.updatedAt) {
    assignments.push(`${quoteIdentifier(columns.updatedAt)} = now()`);
  }

  await getPool().query(
    `UPDATE session_sync SET ${assignments.join(", ")} WHERE ${quoteIdentifier(columns.taskId)} = $1`,
    values,
  );
}

export async function markSessionSyncTaskProcessing(taskId: string) {
  const task = await selectTask(taskId);
  await updateTask(taskId, "PROCESSING", task?.result ?? null, null);
}

export async function completeSessionSyncTask(taskId: string, result: unknown) {
  await updateTask(taskId, "COMPLETED", result, null);
}

export async function failSessionSyncTask(taskId: string, errorMessage: string) {
  await updateTask(taskId, "FAILED", null, errorMessage);
}
