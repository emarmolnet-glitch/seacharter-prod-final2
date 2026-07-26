CREATE TABLE "pipeline_inbox" (
	"id" serial PRIMARY KEY,
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
