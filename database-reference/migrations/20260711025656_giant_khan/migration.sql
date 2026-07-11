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
	"user_id" uuid PRIMARY KEY,
	"last_sync_data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_sync_vessel_array_check" CHECK (jsonb_typeof("last_sync_data") = 'array')
);
