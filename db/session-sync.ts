import { Pool, type Pool as PgPool } from "pg";

export const SESSION_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";
export const CORE_PRO_MATCHING_MODULE = "CORE_PRO_MATCHING";

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

type SessionSyncInput = {
  userId: string;
  lastActionModule: string;
  lastSyncData: unknown;
};

type SessionSyncRow = {
  userId: string;
  lastSyncData: unknown;
  lastActionModule: string;
  updatedAt: Date;
};

let pool: PgPool | null = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString === "tu_valor_real_de_la_variable") {
    throw new Error("DATABASE_URL no esta configurada para sincronizar session_sync.");
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });
  return pool;
}

function mapTask(row: SessionSyncRow): SessionSyncTask {
  const syncData = (row.lastSyncData || {}) as SessionSyncData;
  return {
    taskId: row.userId,
    status: row.lastActionModule.toUpperCase() as SessionSyncStatus,
    requestPayload: syncData.request_payload ?? null,
    result: syncData.result ?? null,
    errorMessage: syncData.error_message ? String(syncData.error_message) : null,
  };
}

export async function upsertSessionSync(input: SessionSyncInput) {
  const result = await getPool().query<SessionSyncRow>(
    `
      INSERT INTO session_sync (
        user_id,
        last_sync_data,
        last_action_module,
        updated_at
      )
      VALUES ($1::uuid, $2::jsonb, $3, now())
      ON CONFLICT (user_id) DO UPDATE SET
        last_sync_data = EXCLUDED.last_sync_data,
        last_action_module = EXCLUDED.last_action_module,
        updated_at = now()
      RETURNING
        user_id AS "userId",
        last_sync_data AS "lastSyncData",
        last_action_module AS "lastActionModule",
        updated_at AS "updatedAt"
    `,
    [input.userId, JSON.stringify(input.lastSyncData), input.lastActionModule],
  );

  return result.rows[0];
}

export async function createSessionSyncTask(requestPayload: unknown) {
  await upsertSessionSync({
    userId: SESSION_SYNC_USER_ID,
    lastActionModule: "PENDING",
    lastSyncData: { request_payload: requestPayload, result: null },
  });
  return getSessionSyncTask();
}

export async function getSessionSyncTask() {
  const result = await getPool().query<SessionSyncRow>(
    `
      SELECT
        user_id AS "userId",
        last_sync_data AS "lastSyncData",
        last_action_module AS "lastActionModule",
        updated_at AS "updatedAt"
      FROM session_sync
      WHERE user_id = $1::uuid
      LIMIT 1
    `,
    [SESSION_SYNC_USER_ID],
  );
  const row = result.rows[0];
  return row ? mapTask(row) : undefined;
}

export async function completeSessionSyncTask(result: unknown) {
  const currentTask = await getSessionSyncTask();
  await upsertSessionSync({
    userId: SESSION_SYNC_USER_ID,
    lastActionModule: "COMPLETED",
    lastSyncData: {
      request_payload: currentTask?.requestPayload ?? null,
      result,
      error_message: null,
    },
  });
}

export async function failSessionSyncTask(errorMessage: string) {
  const currentTask = await getSessionSyncTask();
  await upsertSessionSync({
    userId: SESSION_SYNC_USER_ID,
    lastActionModule: "ERROR",
    lastSyncData: {
      request_payload: currentTask?.requestPayload ?? null,
      result: null,
      error_message: errorMessage,
    },
  });
}
