ALTER TABLE "vessels_master" ADD COLUMN IF NOT EXISTS "call_sign" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN IF NOT EXISTS "net_tonnage" numeric;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN IF NOT EXISTS "beam_meters" numeric;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN IF NOT EXISTS "last_port" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN IF NOT EXISTS "eta" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "eta" TYPE text USING "eta"::text;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "last_port" TYPE text USING "last_port"::text;
