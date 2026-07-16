ALTER TABLE "ia_reports" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ia_reports" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ia_reports" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ia_reports" ADD COLUMN "completed_at" timestamp with time zone;