ALTER TABLE "vessels_master" ADD COLUMN "gross_tonnage" double precision;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD COLUMN "loa_meters" double precision;--> statement-breakpoint
CREATE INDEX "vessels_master_mmsi_lookup_idx" ON "vessels_master" ("mmsi") WHERE "mmsi" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels_master" ADD CONSTRAINT "vessels_master_gross_tonnage_positive_check" CHECK ("gross_tonnage" IS NULL OR "gross_tonnage" > 0);--> statement-breakpoint
ALTER TABLE "vessels_master" ADD CONSTRAINT "vessels_master_loa_meters_positive_check" CHECK ("loa_meters" IS NULL OR "loa_meters" > 0);