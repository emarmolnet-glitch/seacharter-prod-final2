CREATE TABLE "laytime_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"contract_ref" text NOT NULL,
	"operation" text NOT NULL,
	"quantity_mt" numeric NOT NULL,
	"rate_mt_day" numeric,
	"allowed_hours" numeric,
	"laytime_rule" text DEFAULT 'SHINC' NOT NULL,
	"weather_permitting" boolean DEFAULT true NOT NULL,
	"once_on_demurrage" boolean DEFAULT true NOT NULL,
	"commencement_delay_minutes" integer DEFAULT 0 NOT NULL,
	"port_time_zone" text,
	"demurrage_rate_usd_day" numeric NOT NULL,
	"nor_tendered_at" timestamp with time zone,
	"nor_accepted_at" timestamp with time zone,
	"laytime_commenced_at" timestamp with time zone,
	"operation_started_at" timestamp with time zone,
	"operation_completed_at" timestamp with time zone,
	"statement_as_of_at" timestamp with time zone NOT NULL,
	"incidents" jsonb DEFAULT '[]' NOT NULL,
	"calculation" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'INCOMPLETE' NOT NULL,
	"allowed_seconds" numeric DEFAULT '0' NOT NULL,
	"used_seconds" numeric DEFAULT '0' NOT NULL,
	"excluded_seconds" numeric DEFAULT '0' NOT NULL,
	"balance_seconds" numeric DEFAULT '0' NOT NULL,
	"demurrage_usd" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "laytime_statements_operation_check" CHECK ("operation" IN ('LOAD', 'DISCHARGE')),
	CONSTRAINT "laytime_statements_rule_check" CHECK ("laytime_rule" IN ('SHINC', 'SHEX')),
	CONSTRAINT "laytime_statements_quantity_check" CHECK ("quantity_mt" > 0),
	CONSTRAINT "laytime_statements_demurrage_rate_check" CHECK ("demurrage_rate_usd_day" >= 0),
	CONSTRAINT "laytime_statements_incidents_check" CHECK (jsonb_typeof("incidents") = 'array'),
	CONSTRAINT "laytime_statements_calculation_check" CHECK (jsonb_typeof("calculation") = 'object')
);
--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "cargo_quantity_mt" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "loaded_quantity_mt" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "discharged_quantity_mt" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "route_progress_pct" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "demurrage_usd" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "voyages_tracking" ALTER COLUMN "port_costs_usd" SET DEFAULT '0';--> statement-breakpoint
DROP INDEX "vessels_master_mmsi_lookup_idx";--> statement-breakpoint
CREATE INDEX "vessels_master_mmsi_lookup_idx" ON "vessels_master" ("mmsi") WHERE "mmsi" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "laytime_statements_contract_operation_unique_idx" ON "laytime_statements" (upper("contract_ref"),"operation");--> statement-breakpoint
CREATE INDEX "laytime_statements_status_updated_idx" ON "laytime_statements" ("status","updated_at");--> statement-breakpoint
ALTER TABLE "session_sync" DROP CONSTRAINT "session_sync_payload_object_check", ADD CONSTRAINT "session_sync_payload_object_check" CHECK (jsonb_typeof("last_sync_data") = 'object');--> statement-breakpoint
ALTER TABLE "vessels_master" DROP CONSTRAINT "vessels_master_gross_tonnage_positive_check", ADD CONSTRAINT "vessels_master_gross_tonnage_positive_check" CHECK ("gross_tonnage" IS NULL OR "gross_tonnage" > 0);--> statement-breakpoint
ALTER TABLE "vessels_master" DROP CONSTRAINT "vessels_master_loa_meters_positive_check", ADD CONSTRAINT "vessels_master_loa_meters_positive_check" CHECK ("loa_meters" IS NULL OR "loa_meters" > 0);--> statement-breakpoint
ALTER TABLE "voyages_tracking" DROP CONSTRAINT "voyages_tracking_phase_check", ADD CONSTRAINT "voyages_tracking_phase_check" CHECK ("current_phase" BETWEEN 1 AND 6);--> statement-breakpoint
ALTER TABLE "voyages_tracking" DROP CONSTRAINT "voyages_tracking_progress_check", ADD CONSTRAINT "voyages_tracking_progress_check" CHECK ("route_progress_pct" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "voyages_tracking" DROP CONSTRAINT "voyages_tracking_ais_latitude_check", ADD CONSTRAINT "voyages_tracking_ais_latitude_check" CHECK ("ais_latitude" IS NULL OR "ais_latitude" BETWEEN -90 AND 90);--> statement-breakpoint
ALTER TABLE "voyages_tracking" DROP CONSTRAINT "voyages_tracking_ais_longitude_check", ADD CONSTRAINT "voyages_tracking_ais_longitude_check" CHECK ("ais_longitude" IS NULL OR "ais_longitude" BETWEEN -180 AND 180);