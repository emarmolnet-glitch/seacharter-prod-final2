import { ensureApplicationSchema, getPool } from "./index.js";

export const SESSION_SYNC_USER_ID = "11111111-1111-1111-1111-111111111111";

type SessionSyncInput = {
  userId: string;
  lastSyncData: unknown;
};

export type SessionSyncRow = {
  userId: string;
  lastSyncData: unknown;
  updatedAt: Date;
};

type SessionSyncDatabaseRow = {
  user_id: string;
  last_sync_data: unknown;
  updated_at: Date;
};

function mapSessionSyncRow(row: SessionSyncDatabaseRow): SessionSyncRow {
  return {
    userId: row.user_id,
    lastSyncData: row.last_sync_data,
    updatedAt: row.updated_at,
  };
}

export async function upsertSessionSync(input: SessionSyncInput) {
  await ensureApplicationSchema();
  const result = await getPool().query<SessionSyncDatabaseRow>(
    `
      INSERT INTO session_sync (user_id, last_sync_data, updated_at)
      VALUES ($1::uuid, $2::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        last_sync_data = EXCLUDED.last_sync_data,
        updated_at = NOW()
      RETURNING user_id, last_sync_data, updated_at
    `,
    [input.userId, JSON.stringify(input.lastSyncData)],
  );

  return mapSessionSyncRow(result.rows[0]);
}

export async function fetchFleetRows() {
  await ensureApplicationSchema();
  const result = await getPool().query<SessionSyncDatabaseRow>(`
    SELECT user_id, last_sync_data, updated_at
    FROM session_sync
    ORDER BY updated_at DESC
  `);

  return result.rows.map(mapSessionSyncRow);
}

export async function getFleetRow(userId = SESSION_SYNC_USER_ID) {
  await ensureApplicationSchema();
  const result = await getPool().query<SessionSyncDatabaseRow>(
    `
      SELECT user_id, last_sync_data, updated_at
      FROM session_sync
      WHERE user_id = $1::uuid
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ? mapSessionSyncRow(result.rows[0]) : undefined;
}
