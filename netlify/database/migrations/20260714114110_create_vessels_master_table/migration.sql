CREATE TABLE "AppConfig" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_bridge_vessel_ingestions" (
	"id" serial PRIMARY KEY,
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
	"sync_id" uuid PRIMARY KEY,
	"persisted_imo_numbers" jsonb DEFAULT '[]' NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ia_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"report_data" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_sync" (
	"user_id" text PRIMARY KEY,
	"last_sync_data" jsonb NOT NULL,
	"last_action_module" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_sync_payload_object_check" CHECK (jsonb_typeof("last_sync_data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "vessels_master" (
	"imo_number" text PRIMARY KEY,
	"vessel_name" text NOT NULL,
	"dwt" double precision,
	"mmsi" text,
	"vessel_type" text,
	"draft_meters" double precision,
	"flag" text,
	"eta" text,
	"last_port" text,
	"current_destination" text,
	"year_built" text,
	"owner_manager" text,
	"has_gears" boolean DEFAULT false NOT NULL,
	"process_status" text,
	"source" text,
	"source_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "AppConfig" ("key", "value")
VALUES ('scan_status', 'OFF')
ON CONFLICT ("key") DO NOTHING;
