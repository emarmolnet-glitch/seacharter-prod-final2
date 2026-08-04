CREATE TABLE IF NOT EXISTS "voyages_tracking" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_ref" text NOT NULL,
  "current_status" text NOT NULL DEFAULT 'APPROACHING_POL',
  "current_phase" integer NOT NULL DEFAULT 1,
  "previous_port_code" text,
  "previous_port_name" text,
  "previous_port_latitude" double precision,
  "previous_port_longitude" double precision,
  "pol_code" text,
  "pol_name" text NOT NULL,
  "pol_latitude" double precision NOT NULL,
  "pol_longitude" double precision NOT NULL,
  "pod_code" text,
  "pod_name" text NOT NULL,
  "pod_latitude" double precision NOT NULL,
  "pod_longitude" double precision NOT NULL,
  "laydays_start_at" timestamp with time zone,
  "cancelling_at" timestamp with time zone,
  "vessel_name" text NOT NULL,
  "imo_number" text,
  "mmsi" text,
  "cargo_name" text NOT NULL,
  "cargo_quantity_mt" numeric NOT NULL DEFAULT 0,
  "loaded_quantity_mt" numeric NOT NULL DEFAULT 0,
  "discharged_quantity_mt" numeric NOT NULL DEFAULT 0,
  "loading_rate_mt_day" numeric,
  "actual_loading_rate_mt_day" numeric,
  "discharge_rate_mt_day" numeric,
  "actual_discharge_rate_mt_day" numeric,
  "ais_latitude" double precision,
  "ais_longitude" double precision,
  "ais_updated_at" timestamp with time zone,
  "remaining_distance_nm" numeric,
  "average_speed_knots" numeric,
  "dynamic_eta_at" timestamp with time zone,
  "route_progress_pct" numeric NOT NULL DEFAULT 0,
  "demurrage_usd" numeric NOT NULL DEFAULT 0,
  "port_costs_usd" numeric NOT NULL DEFAULT 0,
  "nor_pol_tendered_at" timestamp with time zone,
  "nor_pol_accepted_at" timestamp with time zone,
  "laytime_started_at" timestamp with time zone,
  "nor_pod_tendered_at" timestamp with time zone,
  "nor_pod_accepted_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "ballast_route" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "laden_route" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "alerts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "milestones" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "asset_trail" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "commercial_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "voyages_tracking_phase_check" CHECK ("current_phase" BETWEEN 1 AND 6),
  CONSTRAINT "voyages_tracking_progress_check" CHECK ("route_progress_pct" BETWEEN 0 AND 100),
  CONSTRAINT "voyages_tracking_ais_latitude_check" CHECK ("ais_latitude" IS NULL OR "ais_latitude" BETWEEN -90 AND 90),
  CONSTRAINT "voyages_tracking_ais_longitude_check" CHECK ("ais_longitude" IS NULL OR "ais_longitude" BETWEEN -180 AND 180),
  CONSTRAINT "voyages_tracking_payloads_check" CHECK (
    jsonb_typeof("ballast_route") = 'array'
    AND jsonb_typeof("laden_route") = 'array'
    AND jsonb_typeof("alerts") = 'array'
    AND jsonb_typeof("milestones") = 'array'
    AND jsonb_typeof("asset_trail") = 'array'
    AND jsonb_typeof("commercial_details") = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "voyages_tracking_contract_ref_unique_idx"
  ON "voyages_tracking" (upper("contract_ref"));

CREATE INDEX IF NOT EXISTS "voyages_tracking_status_updated_idx"
  ON "voyages_tracking" ("current_status", "updated_at" DESC);
