CREATE TABLE "ais_vessels" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"imo_number" text NOT NULL,
	"mmsi" text,
	"vessel_name" text,
	"vessel_type" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source" text NOT NULL,
	"audit_status" text DEFAULT 'PENDING' NOT NULL,
	"raw_data" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AppConfig" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_bridge_vessel_ingestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file_name" text,
	"source_file_type" text NOT NULL,
	"source_provider" text,
	"audit_status" text DEFAULT 'PENDIENTE_AUDITORIA' NOT NULL,
	"vessel_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"raw_text" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "databridge_vessel_syncs" (
	"sync_id" uuid PRIMARY KEY NOT NULL,
	"persisted_imo_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ia_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"request_payload" jsonb NOT NULL,
	"report_data" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pda_vessel_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimation_id" text,
	"vessel_name" text NOT NULL,
	"imo_number" text,
	"pol" text,
	"pod" text,
	"previous_vessel" jsonb NOT NULL,
	"actual_vessel" jsonb NOT NULL,
	"operational_validation" jsonb NOT NULL,
	"financial_breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_id" text,
	"imo_number" text,
	"vessel_name" text,
	"source" text DEFAULT 'CORE_PRO' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_sync" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sync_id" text NOT NULL,
	"last_sync_data" jsonb NOT NULL,
	"last_action_module" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_sync_payload_object_check" CHECK (jsonb_typeof("session_sync"."last_sync_data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "vessels_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"imo_number" integer,
	"vessel_name" text,
	"dwt" integer,
	"mmsi" text,
	"latitude" double precision,
	"longitude" double precision,
	"vessel_type" text,
	"draft_meters" double precision,
	"flag" text,
	"call_sign" text,
	"eta" timestamp with time zone,
	"last_port" text,
	"current_destination" text,
	"year_built" integer,
	"gross_tonnage" numeric,
	"net_tonnage" numeric,
	"loa_meters" numeric,
	"beam_meters" numeric,
	"owner_manager" text,
	"has_gears" boolean,
	"process_status" text,
	"status" text,
	"audit_status" text,
	"source_provenance" text,
	"origen" text,
	"source" text,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_ultima_actualizacion" timestamp with time zone,
	CONSTRAINT "vessels_master_imo_number_unique" UNIQUE("imo_number"),
	CONSTRAINT "vessels_master_gross_tonnage_positive_check" CHECK ("vessels_master"."gross_tonnage" IS NULL OR "vessels_master"."gross_tonnage" > 0),
	CONSTRAINT "vessels_master_loa_meters_positive_check" CHECK ("vessels_master"."loa_meters" IS NULL OR "vessels_master"."loa_meters" > 0)
);
--> statement-breakpoint
CREATE TABLE "voyages_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_ref" text NOT NULL,
	"current_status" text DEFAULT 'APPROACHING_POL' NOT NULL,
	"current_phase" integer DEFAULT 1 NOT NULL,
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
	"cargo_quantity_mt" numeric DEFAULT 0 NOT NULL,
	"loaded_quantity_mt" numeric DEFAULT 0 NOT NULL,
	"discharged_quantity_mt" numeric DEFAULT 0 NOT NULL,
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
	"route_progress_pct" numeric DEFAULT 0 NOT NULL,
	"demurrage_usd" numeric DEFAULT 0 NOT NULL,
	"port_costs_usd" numeric DEFAULT 0 NOT NULL,
	"nor_pol_tendered_at" timestamp with time zone,
	"nor_pol_accepted_at" timestamp with time zone,
	"laytime_started_at" timestamp with time zone,
	"nor_pod_tendered_at" timestamp with time zone,
	"nor_pod_accepted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"ballast_route" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"laden_route" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alerts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commercial_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voyages_tracking_phase_check" CHECK ("voyages_tracking"."current_phase" BETWEEN 1 AND 6),
	CONSTRAINT "voyages_tracking_progress_check" CHECK ("voyages_tracking"."route_progress_pct" BETWEEN 0 AND 100),
	CONSTRAINT "voyages_tracking_ais_latitude_check" CHECK ("voyages_tracking"."ais_latitude" IS NULL OR "voyages_tracking"."ais_latitude" BETWEEN -90 AND 90),
	CONSTRAINT "voyages_tracking_ais_longitude_check" CHECK ("voyages_tracking"."ais_longitude" IS NULL OR "voyages_tracking"."ais_longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE INDEX "vessels_master_mmsi_lookup_idx" ON "vessels_master" USING btree ("mmsi") WHERE "vessels_master"."mmsi" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "voyages_tracking_contract_ref_unique_idx" ON "voyages_tracking" USING btree (upper("contract_ref"));--> statement-breakpoint
CREATE INDEX "voyages_tracking_status_updated_idx" ON "voyages_tracking" USING btree ("current_status","updated_at");