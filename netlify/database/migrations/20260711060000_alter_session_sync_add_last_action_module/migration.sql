ALTER TABLE "session_sync"
  DROP CONSTRAINT IF EXISTS "session_sync_vessel_array_check";
--> statement-breakpoint
ALTER TABLE "session_sync"
  ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint
ALTER TABLE "session_sync"
  ADD COLUMN IF NOT EXISTS "last_action_module" text;
--> statement-breakpoint
UPDATE "session_sync"
SET
  "last_sync_data" = CASE
    WHEN jsonb_typeof("last_sync_data") = 'array'
      THEN jsonb_build_object(
        'vessels', "last_sync_data",
        'updated_at', COALESCE("updated_at", NOW())
      )
    WHEN jsonb_typeof("last_sync_data") = 'object' AND NOT ("last_sync_data" ? 'vessels')
      THEN jsonb_build_object(
        'vessels', '[]'::jsonb,
        'updated_at', COALESCE("updated_at", NOW())
      ) || "last_sync_data"
    ELSE "last_sync_data"
  END,
  "last_action_module" = COALESCE("last_action_module", 'CORE_PRO_MATCHING');
--> statement-breakpoint
ALTER TABLE "session_sync"
  ALTER COLUMN "last_action_module" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "session_sync"
  DROP CONSTRAINT IF EXISTS "session_sync_payload_object_check";
--> statement-breakpoint
ALTER TABLE "session_sync"
  ADD CONSTRAINT "session_sync_payload_object_check"
  CHECK (jsonb_typeof("last_sync_data") = 'object');
