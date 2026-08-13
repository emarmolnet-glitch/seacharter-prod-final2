ALTER TABLE "pipeline_inbox"
  ADD COLUMN IF NOT EXISTS "sync_id" text,
  ADD COLUMN IF NOT EXISTS "imo_number" text,
  ADD COLUMN IF NOT EXISTS "vessel_name" text,
  ADD COLUMN IF NOT EXISTS "source" text,
  ADD COLUMN IF NOT EXISTS "status" text,
  ADD COLUMN IF NOT EXISTS "payload" jsonb,
  ADD COLUMN IF NOT EXISTS "error_message" text,
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pipeline_inbox'
      AND column_name = 'raw_payload'
  ) THEN
    EXECUTE 'UPDATE "pipeline_inbox" SET "payload" = COALESCE("payload", "raw_payload", ''{}''::jsonb)';
  ELSE
    UPDATE "pipeline_inbox"
    SET "payload" = COALESCE("payload", '{}'::jsonb);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pipeline_inbox'
      AND column_name = 'origin'
  ) THEN
    EXECUTE 'UPDATE "pipeline_inbox" SET "source" = COALESCE(NULLIF(BTRIM("source"), ''''), NULLIF(BTRIM("origin"), ''''), ''CORE_PRO'')';
  ELSE
    UPDATE "pipeline_inbox"
    SET "source" = COALESCE(NULLIF(BTRIM("source"), ''), 'CORE_PRO');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pipeline_inbox'
      AND column_name = 'processed'
  ) THEN
    EXECUTE 'UPDATE "pipeline_inbox" SET "status" = COALESCE(NULLIF(BTRIM("status"), ''''), CASE WHEN "processed" IS TRUE THEN ''PROCESSED'' ELSE ''PENDING'' END)';
  ELSE
    UPDATE "pipeline_inbox"
    SET "status" = COALESCE(NULLIF(BTRIM("status"), ''), 'PENDING');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pipeline_inbox'
      AND column_name = 'received_at'
  ) THEN
    EXECUTE 'UPDATE "pipeline_inbox" SET "created_at" = COALESCE("created_at", "received_at", NOW()), "updated_at" = COALESCE("updated_at", "received_at", "created_at", NOW())';
  ELSE
    UPDATE "pipeline_inbox"
    SET
      "created_at" = COALESCE("created_at", NOW()),
      "updated_at" = COALESCE("updated_at", "created_at", NOW());
  END IF;
END
$migration$;

UPDATE "pipeline_inbox"
SET
  "sync_id" = COALESCE(
    NULLIF(BTRIM("sync_id"), ''),
    NULLIF(BTRIM("payload"->>'syncId'), ''),
    NULLIF(BTRIM("payload"->>'sync_id'), ''),
    NULLIF(BTRIM("payload"->>'batch_id'), '')
  ),
  "imo_number" = COALESCE(
    NULLIF(BTRIM("imo_number"), ''),
    NULLIF(BTRIM("payload"->>'imo_number'), ''),
    NULLIF(BTRIM("payload"->>'imoNumber'), ''),
    NULLIF(BTRIM("payload"->>'imo'), ''),
    NULLIF(BTRIM("payload"->>'IMO'), '')
  ),
  "vessel_name" = COALESCE(
    NULLIF(BTRIM("vessel_name"), ''),
    NULLIF(BTRIM("payload"->>'vessel_name'), ''),
    NULLIF(BTRIM("payload"->>'vesselName'), ''),
    NULLIF(BTRIM("payload"->>'name'), ''),
    NULLIF(BTRIM("payload"->>'ShipName'), '')
  );

ALTER TABLE "pipeline_inbox"
  ALTER COLUMN "source" SET DEFAULT 'CORE_PRO',
  ALTER COLUMN "source" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "payload" SET NOT NULL,
  ALTER COLUMN "created_at" SET DEFAULT NOW(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "updated_at" SET DEFAULT NOW(),
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "pipeline_inbox_sync_id_idx"
  ON "pipeline_inbox" ("sync_id")
  WHERE "sync_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "pipeline_inbox_imo_number_idx"
  ON "pipeline_inbox" ("imo_number")
  WHERE "imo_number" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "pipeline_inbox_status_created_at_idx"
  ON "pipeline_inbox" ("status", "created_at" DESC);
