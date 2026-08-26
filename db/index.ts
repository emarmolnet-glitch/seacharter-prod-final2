import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type Pool as PgPool } from "pg";
import { requireDatabaseConnectionString } from "./connection-string.js";
import * as schema from "./schema.js";

let pool: PgPool | null = null;
let applicationSchemaReady: Promise<void> | null = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = requireDatabaseConnectionString();

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
      sync_id TEXT NOT NULL,
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

    ALTER TABLE session_sync
      ADD COLUMN IF NOT EXISTS sync_id TEXT;

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

    UPDATE session_sync
    SET sync_id = COALESCE(
      NULLIF(BTRIM(sync_id), ''),
      NULLIF(BTRIM(last_sync_data->>'syncId'), ''),
      gen_random_uuid()::text
    )
    WHERE sync_id IS NULL OR BTRIM(sync_id) = '';

    UPDATE session_sync
    SET last_sync_data = jsonb_set(last_sync_data, '{syncId}', to_jsonb(sync_id), true)
    WHERE last_sync_data->>'syncId' IS DISTINCT FROM sync_id;

    ALTER TABLE session_sync
      ALTER COLUMN last_action_module SET NOT NULL;

    ALTER TABLE session_sync
      ALTER COLUMN sync_id SET NOT NULL;

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
      progress INTEGER NOT NULL DEFAULT 0,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      request_payload JSONB NOT NULL,
      report_data JSONB,
      error_message TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE ia_reports ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ia_reports ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE ia_reports ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE ia_reports ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS pipeline_inbox (
      id SERIAL PRIMARY KEY,
      sync_id TEXT,
      imo_number TEXT,
      vessel_name TEXT,
      source TEXT NOT NULL DEFAULT 'CORE_PRO',
      status TEXT NOT NULL DEFAULT 'PENDING',
      payload JSONB NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS sync_id TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS imo_number TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS vessel_name TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS status TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS payload JSONB;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

    DO $pipeline_contract$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_inbox' AND column_name = 'raw_payload'
      ) THEN
        EXECUTE 'UPDATE pipeline_inbox SET payload = COALESCE(payload, raw_payload, ''{}''::jsonb)';
      ELSE
        UPDATE pipeline_inbox SET payload = COALESCE(payload, '{}'::jsonb);
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_inbox' AND column_name = 'origin'
      ) THEN
        EXECUTE 'UPDATE pipeline_inbox SET source = COALESCE(NULLIF(BTRIM(source), ''''), NULLIF(BTRIM(origin), ''''), ''CORE_PRO'')';
      ELSE
        UPDATE pipeline_inbox SET source = COALESCE(NULLIF(BTRIM(source), ''), 'CORE_PRO');
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_inbox' AND column_name = 'processed'
      ) THEN
        EXECUTE 'UPDATE pipeline_inbox SET status = COALESCE(NULLIF(BTRIM(status), ''''), CASE WHEN processed IS TRUE THEN ''PROCESSED'' ELSE ''PENDING'' END)';
      ELSE
        UPDATE pipeline_inbox SET status = COALESCE(NULLIF(BTRIM(status), ''), 'PENDING');
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_inbox' AND column_name = 'received_at'
      ) THEN
        EXECUTE 'UPDATE pipeline_inbox SET created_at = COALESCE(created_at, received_at, NOW()), updated_at = COALESCE(updated_at, received_at, created_at, NOW())';
      ELSE
        UPDATE pipeline_inbox
        SET created_at = COALESCE(created_at, NOW()), updated_at = COALESCE(updated_at, created_at, NOW());
      END IF;
    END
    $pipeline_contract$;

    UPDATE pipeline_inbox
    SET
      sync_id = COALESCE(
        NULLIF(BTRIM(sync_id), ''),
        NULLIF(BTRIM(payload->>'syncId'), ''),
        NULLIF(BTRIM(payload->>'sync_id'), ''),
        NULLIF(BTRIM(payload->>'batch_id'), '')
      ),
      imo_number = COALESCE(
        NULLIF(BTRIM(imo_number), ''),
        NULLIF(BTRIM(payload->>'imo_number'), ''),
        NULLIF(BTRIM(payload->>'imoNumber'), ''),
        NULLIF(BTRIM(payload->>'imo'), ''),
        NULLIF(BTRIM(payload->>'IMO'), '')
      ),
      vessel_name = COALESCE(
        NULLIF(BTRIM(vessel_name), ''),
        NULLIF(BTRIM(payload->>'vessel_name'), ''),
        NULLIF(BTRIM(payload->>'vesselName'), ''),
        NULLIF(BTRIM(payload->>'name'), ''),
        NULLIF(BTRIM(payload->>'ShipName'), '')
      );

    ALTER TABLE pipeline_inbox ALTER COLUMN source SET DEFAULT 'CORE_PRO';
    ALTER TABLE pipeline_inbox ALTER COLUMN source SET NOT NULL;
    ALTER TABLE pipeline_inbox ALTER COLUMN status SET DEFAULT 'PENDING';
    ALTER TABLE pipeline_inbox ALTER COLUMN status SET NOT NULL;
    ALTER TABLE pipeline_inbox ALTER COLUMN payload SET DEFAULT '{}'::jsonb;
    ALTER TABLE pipeline_inbox ALTER COLUMN payload SET NOT NULL;
    ALTER TABLE pipeline_inbox ALTER COLUMN created_at SET DEFAULT NOW();
    ALTER TABLE pipeline_inbox ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE pipeline_inbox ALTER COLUMN updated_at SET DEFAULT NOW();
    ALTER TABLE pipeline_inbox ALTER COLUMN updated_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS pipeline_inbox_sync_id_idx
      ON pipeline_inbox (sync_id) WHERE sync_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS pipeline_inbox_imo_number_idx
      ON pipeline_inbox (imo_number) WHERE imo_number IS NOT NULL;
    CREATE INDEX IF NOT EXISTS pipeline_inbox_status_created_at_idx
      ON pipeline_inbox (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS pda_vessel_confirmations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      estimation_id TEXT,
      vessel_name TEXT NOT NULL,
      imo_number TEXT,
      pol TEXT,
      pod TEXT,
      previous_vessel JSONB NOT NULL,
      actual_vessel JSONB NOT NULL,
      operational_validation JSONB NOT NULL,
      financial_breakdown JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS pda_vessel_confirmations_imo_created_idx
      ON pda_vessel_confirmations (imo_number, created_at DESC);
  `).then(() => undefined).catch((error: unknown) => {
    applicationSchemaReady = null;
    throw error;
  });

  return applicationSchemaReady;
}
