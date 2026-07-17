ALTER TABLE "session_sync"
  ADD COLUMN IF NOT EXISTS "sync_id" text;

UPDATE "session_sync"
SET "sync_id" = COALESCE(
  NULLIF(BTRIM("sync_id"), ''),
  NULLIF(BTRIM("last_sync_data"->>'syncId'), ''),
  gen_random_uuid()::text
)
WHERE "sync_id" IS NULL OR BTRIM("sync_id") = '';

UPDATE "session_sync"
SET "last_sync_data" = jsonb_set(
  "last_sync_data",
  '{syncId}',
  to_jsonb("sync_id"),
  true
)
WHERE "last_sync_data"->>'syncId' IS DISTINCT FROM "sync_id";

ALTER TABLE "session_sync"
  ALTER COLUMN "sync_id" SET NOT NULL;
