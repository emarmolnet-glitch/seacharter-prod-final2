CREATE TABLE "app_state" (
	"key" text PRIMARY KEY,
	"current_session_ref" text,
	"value" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"session_id" text PRIMARY KEY,
	"current_session_ref" text,
	"session_data" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "app_state_current_session_ref_idx" ON "app_state" ("current_session_ref");--> statement-breakpoint
CREATE INDEX "user_sessions_current_session_ref_idx" ON "user_sessions" ("current_session_ref");