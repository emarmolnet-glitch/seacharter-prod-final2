ALTER TABLE "audited_vessels" ADD COLUMN "armador" text;--> statement-breakpoint
ALTER TABLE "audited_vessels" ADD COLUMN "gruas" text;--> statement-breakpoint
ALTER TABLE "audited_vessels" ADD COLUMN "apto_cemento_clinker" text;--> statement-breakpoint
ALTER TABLE "audited_vessels" ADD COLUMN "is_blacklisted" boolean DEFAULT false;