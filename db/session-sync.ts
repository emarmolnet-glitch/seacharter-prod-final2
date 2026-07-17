import { ensureApplicationSchema, getPool } from "./index.js";

export const SESSION_SYNC_USER_ID = "1c8db801b-b053-4847-bbc4-edd7d0abbe0e";
export const SESSION_SYNC_ACTION_MODULE = "CORE_PRO_MATCHING";

export type SessionSyncData = {
  vessels: unknown[];
  updated_at: string;
  format?: string;
  source?: string;
  syncId?: string;
  created_at?: string;
  [key: string]: unknown;
};

type SessionSyncInput = {
  userId: string;
  lastSyncData: SessionSyncData;
  lastActionModule: string;
};

export type SessionSyncRow = {
  userId: string;
  lastSyncData: SessionSyncData;
  lastActionModule: string;
  updatedAt: Date;
};

type SessionSyncDatabaseRow = {
  user_id: string;
  sync_id: string;
  last_sync_data: SessionSyncData;
  last_action_module: string;
  updated_at: Date;
};

function mapSessionSyncRow(row: SessionSyncDatabaseRow): SessionSyncRow {
  return {
    userId: row.user_id,
    lastSyncData: row.last_sync_data,
    lastActionModule: row.last_action_module,
    updatedAt: row.updated_at,
  };
}

export async function upsertSessionSync(input: SessionSyncInput) {
  await ensureApplicationSchema();
  const syncId = typeof input.lastSyncData.syncId === "string" ? input.lastSyncData.syncId.trim() : "";
  if (!syncId) {
    throw new Error("last_sync_data.syncId must be a non-empty string");
  }

  const completeSyncData = {
    ...input.lastSyncData,
    syncId,
    vessels: input.lastSyncData.vessels,
  };
  const serializedSyncData = JSON.stringify(completeSyncData);
  const result = await getPool().query<SessionSyncDatabaseRow>(
    `
      INSERT INTO session_sync (user_id, sync_id, last_sync_data, last_action_module, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        sync_id = EXCLUDED.sync_id,
        last_sync_data = EXCLUDED.last_sync_data,
        last_action_module = EXCLUDED.last_action_module,
        updated_at = NOW()
      RETURNING user_id, sync_id, last_sync_data, last_action_module, updated_at
    `,
    [input.userId, syncId, serializedSyncData, input.lastActionModule],
  );

  return mapSessionSyncRow(result.rows[0]);
}

export async function fetchFleetRows() {
  await ensureApplicationSchema();
  const result = await getPool().query<SessionSyncDatabaseRow>(`
    SELECT user_id, sync_id, last_sync_data, last_action_module, updated_at
    FROM session_sync
    ORDER BY updated_at DESC
  `);

  return result.rows.map(mapSessionSyncRow);
}

export async function getFleetRow(userId = SESSION_SYNC_USER_ID) {
  await ensureApplicationSchema();
  const result = await getPool().query<SessionSyncDatabaseRow>(
    `
      SELECT user_id, sync_id, last_sync_data, last_action_module, updated_at
      FROM session_sync
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ? mapSessionSyncRow(result.rows[0]) : undefined;
}
