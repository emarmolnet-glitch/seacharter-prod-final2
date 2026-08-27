CREATE TABLE "charter_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_key" text DEFAULT 'default-account' NOT NULL,
	"reference" text NOT NULL,
	"pol" text,
	"pod" text,
	"cargo_name" text,
	"cargo_volume" double precision,
	"charterer" text,
	"status" text DEFAULT 'BORRADOR' NOT NULL,
	"session_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charter_dossiers_status_check" CHECK ("status" IN ('BORRADOR', 'COTIZADO', 'FIJADO')),
	CONSTRAINT "charter_dossiers_payload_object_check" CHECK (jsonb_typeof("session_payload") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "charter_dossiers_account_reference_uidx" ON "charter_dossiers" ("account_key","reference");--> statement-breakpoint
CREATE INDEX "charter_dossiers_account_updated_idx" ON "charter_dossiers" ("account_key","updated_at");