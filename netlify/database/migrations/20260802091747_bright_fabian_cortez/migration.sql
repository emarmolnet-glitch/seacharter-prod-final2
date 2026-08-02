ALTER TABLE "vessels_master" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN "audit_status" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN "source_provenance" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN "origen" text;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN "fecha_ultima_actualizacion" timestamp with time zone;