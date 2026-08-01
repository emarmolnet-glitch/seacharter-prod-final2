ALTER TABLE "voyages"
  ADD COLUMN IF NOT EXISTS "contract_ref" varchar(80),
  ADD COLUMN IF NOT EXISTS "vessel_name" text,
  ADD COLUMN IF NOT EXISTS "origin_port_id" text,
  ADD COLUMN IF NOT EXISTS "origin_port_name" text,
  ADD COLUMN IF NOT EXISTS "origin_latitude" double precision,
  ADD COLUMN IF NOT EXISTS "origin_longitude" double precision,
  ADD COLUMN IF NOT EXISTS "destination_port_name" text,
  ADD COLUMN IF NOT EXISTS "destination_latitude" double precision,
  ADD COLUMN IF NOT EXISTS "destination_longitude" double precision,
  ADD COLUMN IF NOT EXISTS "cargo_name" text,
  ADD COLUMN IF NOT EXISTS "cargo_total_mt" numeric(14, 3),
  ADD COLUMN IF NOT EXISTS "cargo_loaded_mt" numeric(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cargo_discharged_mt" numeric(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "average_speed_knots" numeric(8, 3),
  ADD COLUMN IF NOT EXISTS "remaining_distance_nm" numeric(12, 3),
  ADD COLUMN IF NOT EXISTS "dynamic_eta_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "port_costs_usd" numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "voyages_contract_ref_unique_idx"
  ON "voyages" (upper("contract_ref"))
  WHERE "contract_ref" IS NOT NULL;

ALTER TABLE "voyages"
  DROP CONSTRAINT IF EXISTS "voyages_contract_ref_format_check",
  ADD CONSTRAINT "voyages_contract_ref_format_check"
    CHECK ("contract_ref" IS NULL OR "contract_ref" ~ '^[A-Z0-9][A-Z0-9/_-]{7,79}$'),
  DROP CONSTRAINT IF EXISTS "voyages_origin_latitude_check",
  ADD CONSTRAINT "voyages_origin_latitude_check"
    CHECK ("origin_latitude" IS NULL OR "origin_latitude" BETWEEN -90 AND 90),
  DROP CONSTRAINT IF EXISTS "voyages_origin_longitude_check",
  ADD CONSTRAINT "voyages_origin_longitude_check"
    CHECK ("origin_longitude" IS NULL OR "origin_longitude" BETWEEN -180 AND 180),
  DROP CONSTRAINT IF EXISTS "voyages_destination_latitude_check",
  ADD CONSTRAINT "voyages_destination_latitude_check"
    CHECK ("destination_latitude" IS NULL OR "destination_latitude" BETWEEN -90 AND 90),
  DROP CONSTRAINT IF EXISTS "voyages_destination_longitude_check",
  ADD CONSTRAINT "voyages_destination_longitude_check"
    CHECK ("destination_longitude" IS NULL OR "destination_longitude" BETWEEN -180 AND 180),
  DROP CONSTRAINT IF EXISTS "voyages_tracking_quantities_nonnegative_check",
  ADD CONSTRAINT "voyages_tracking_quantities_nonnegative_check"
    CHECK (
      COALESCE("cargo_total_mt", 0) >= 0
      AND "cargo_loaded_mt" >= 0
      AND "cargo_discharged_mt" >= 0
      AND COALESCE("remaining_distance_nm", 0) >= 0
      AND "port_costs_usd" >= 0
    );

ALTER TABLE "charter_parties"
  ADD COLUMN IF NOT EXISTS "laycan_start_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "laycan_end_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cancelling_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "free_laytime_hours" numeric(10, 2),
  ADD COLUMN IF NOT EXISTS "demurrage_rate_usd_day" numeric(14, 2),
  ADD COLUMN IF NOT EXISTS "despatch_rate_usd_day" numeric(14, 2),
  ADD COLUMN IF NOT EXISTS "load_rate_mt_day" numeric(14, 3),
  ADD COLUMN IF NOT EXISTS "discharge_rate_mt_day" numeric(14, 3),
  ADD COLUMN IF NOT EXISTS "nor_pol_tendered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "nor_pol_accepted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "laytime_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "loading_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "loading_completed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "nor_pod_tendered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "nor_pod_accepted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "discharge_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "discharge_completed_at" timestamp with time zone;

ALTER TABLE "charter_parties"
  DROP CONSTRAINT IF EXISTS "charter_parties_tracking_rates_nonnegative_check",
  ADD CONSTRAINT "charter_parties_tracking_rates_nonnegative_check"
    CHECK (
      COALESCE("free_laytime_hours", 0) >= 0
      AND COALESCE("demurrage_rate_usd_day", 0) >= 0
      AND COALESCE("despatch_rate_usd_day", 0) >= 0
      AND COALESCE("load_rate_mt_day", 0) >= 0
      AND COALESCE("discharge_rate_mt_day", 0) >= 0
    );

CREATE TABLE IF NOT EXISTS "voyage_tracking_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "voyage_id" uuid NOT NULL REFERENCES "voyages" ("id") ON DELETE CASCADE,
  "phase" smallint NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECORDED',
  "summary" text NOT NULL,
  "metric_value" numeric(16, 4),
  "metric_unit" text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "voyage_tracking_events_phase_check" CHECK ("phase" BETWEEN 1 AND 6),
  CONSTRAINT "voyage_tracking_events_status_check" CHECK ("status" IN ('RECORDED', 'OK', 'WARNING', 'CRITICAL'))
);

CREATE INDEX IF NOT EXISTS "voyage_tracking_events_timeline_idx"
  ON "voyage_tracking_events" ("voyage_id", "occurred_at" DESC);
