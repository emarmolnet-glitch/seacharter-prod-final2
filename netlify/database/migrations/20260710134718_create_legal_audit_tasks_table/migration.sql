CREATE TABLE IF NOT EXISTS "legal_audit_tasks" (
	"id" uuid PRIMARY KEY,
	"status" text DEFAULT 'queued' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_audit_tasks_status_idx" ON "legal_audit_tasks" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_audit_tasks_created_at_idx" ON "legal_audit_tasks" ("created_at");
