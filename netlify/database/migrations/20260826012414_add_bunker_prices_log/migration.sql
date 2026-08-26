CREATE TABLE IF NOT EXISTS "bunker_prices_log" (
  "id" serial PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "hub_name" varchar(120) NOT NULL,
  "fuel_grade" varchar(16) NOT NULL,
  "price" numeric NOT NULL,
  "source" varchar(64) DEFAULT 'AUTO_BUNKERINDEX' NOT NULL,
  CONSTRAINT "bunker_prices_log_fuel_grade_check"
    CHECK ("fuel_grade" IN ('VLSFO', 'IFO380', 'MGO')),
  CONSTRAINT "bunker_prices_log_price_positive_check"
    CHECK ("price" > 0),
  CONSTRAINT "bunker_prices_log_source_not_blank_check"
    CHECK (BTRIM("source") <> '')
);
--> statement-breakpoint
UPDATE "bunker_prices_log"
SET
  "hub_name" = BTRIM("hub_name"),
  "fuel_grade" = UPPER(REPLACE(BTRIM("fuel_grade"), ' ', '')),
  "source" = COALESCE(NULLIF(BTRIM("source"), ''), 'AUTO_BUNKERINDEX'),
  "created_at" = COALESCE("created_at", now());
--> statement-breakpoint
ALTER TABLE "bunker_prices_log"
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "created_at" SET NOT NULL,
  ALTER COLUMN "hub_name" TYPE varchar(120) USING BTRIM("hub_name")::varchar(120),
  ALTER COLUMN "hub_name" SET NOT NULL,
  ALTER COLUMN "fuel_grade" TYPE varchar(16) USING UPPER(REPLACE(BTRIM("fuel_grade"), ' ', ''))::varchar(16),
  ALTER COLUMN "fuel_grade" SET NOT NULL,
  ALTER COLUMN "price" SET NOT NULL,
  ALTER COLUMN "source" TYPE varchar(64) USING BTRIM("source")::varchar(64),
  ALTER COLUMN "source" SET DEFAULT 'AUTO_BUNKERINDEX',
  ALTER COLUMN "source" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "bunker_prices_log"
  DROP CONSTRAINT IF EXISTS "bunker_prices_log_source_check";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bunker_prices_log_fuel_grade_check'
  ) THEN
    ALTER TABLE "bunker_prices_log"
      ADD CONSTRAINT "bunker_prices_log_fuel_grade_check"
      CHECK ("fuel_grade" IN ('VLSFO', 'IFO380', 'MGO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bunker_prices_log_price_positive_check'
  ) THEN
    ALTER TABLE "bunker_prices_log"
      ADD CONSTRAINT "bunker_prices_log_price_positive_check"
      CHECK ("price" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bunker_prices_log_source_not_blank_check'
  ) THEN
    ALTER TABLE "bunker_prices_log"
      ADD CONSTRAINT "bunker_prices_log_source_not_blank_check"
      CHECK (BTRIM("source") <> '');
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bunker_prices_log_market_latest_idx"
  ON "bunker_prices_log" ("hub_name", "fuel_grade", "created_at");
