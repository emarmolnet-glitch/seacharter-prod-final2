CREATE TABLE IF NOT EXISTS "ia_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status" text DEFAULT 'PENDING' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"report_data" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_sync" (
	"user_id" text PRIMARY KEY,
	"last_sync_data" jsonb NOT NULL,
	"last_action_module" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_sync_payload_object_check" CHECK (jsonb_typeof("last_sync_data") = 'object')
);
