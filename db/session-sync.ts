import { Pool, type Pool as PgPool } from "pg";

export const SESSION_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

export type SessionSyncStatus = "PENDING" | "COMPLETED" | "ERROR";

export type SessionSyncTask = {
  taskId: string;
  status: SessionSyncStatus;
  requestPayload: unknown;
  result: unknown | null;
  errorMessage: string | null;
};

type SessionSyncData = {
  request_payload?: unknown;
  result?: unknown;
  error_message?: unknown;
};

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

function mapTask(row: Record<string, unknown>): SessionSyncTask {
  const syncData = (row.last_sync_data || {}) as SessionSyncData;
  return {
    taskId: String(row.user_id),
    status: String(row.last_action_module).toUpperCase() as SessionSyncStatus,
    requestPayload: syncData.request_payload ?? null,
    result: syncData.result ?? null,
    errorMessage: syncData.error_message ? String(syncData.error_message) : null,
  };
}

export async function createSessionSyncTask(requestPayload: unknown) {
  await getPool().query(
    `
      INSERT INTO session_sync (user_id, last_sync_data, last_action_module)
      VALUES ($1, $2::jsonb, 'PENDING')
      ON CONFLICT (user_id) DO UPDATE
      SET last_sync_data = EXCLUDED.last_sync_data,
          last_action_module = EXCLUDED.last_action_module
    `,
    [SESSION_SYNC_USER_ID, JSON.stringify({ request_payload: requestPayload, result: null })],
  );
  return getSessionSyncTask();
}

export async function getSessionSyncTask() {
  const result = await getPool().query(
    `
      SELECT user_id, last_sync_data, last_action_module
      FROM session_sync
      WHERE user_id = $1
      LIMIT 1
    `,
    [SESSION_SYNC_USER_ID],
  );
  return result.rows[0] ? mapTask(result.rows[0]) : undefined;
}

export async function completeSessionSyncTask(result: unknown) {
  const data = { result };
  console.log('[Core PRO] Guardando auditoría en Neon con UUID estático 1111...:', data);
  await getPool().query(
    `
      INSERT INTO session_sync (user_id, last_sync_data, last_action_module)
      VALUES (
        $1,
        jsonb_build_object('result', $2::jsonb, 'error_message', null),
        'COMPLETED'
      )
      ON CONFLICT (user_id) DO UPDATE
      SET last_sync_data = jsonb_set(
            jsonb_set(COALESCE(session_sync.last_sync_data, '{}'::jsonb), '{result}', $2::jsonb, true),
            '{error_message}',
            'null'::jsonb,
            true
          ),
          last_action_module = EXCLUDED.last_action_module
    `,
    [SESSION_SYNC_USER_ID, JSON.stringify(result)],
  );
}

export async function failSessionSyncTask(errorMessage: string) {
  await getPool().query(
    `
      INSERT INTO session_sync (user_id, last_sync_data, last_action_module)
      VALUES ($1, jsonb_build_object('result', null, 'error_message', $2::jsonb), 'ERROR')
      ON CONFLICT (user_id) DO UPDATE
      SET last_sync_data = jsonb_set(
            jsonb_set(COALESCE(session_sync.last_sync_data, '{}'::jsonb), '{result}', 'null'::jsonb, true),
            '{error_message}',
            $2::jsonb,
            true
          ),
          last_action_module = EXCLUDED.last_action_module
    `,
    [SESSION_SYNC_USER_ID, JSON.stringify(errorMessage)],
  );
}
