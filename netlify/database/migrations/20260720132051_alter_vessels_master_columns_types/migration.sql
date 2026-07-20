ALTER TABLE "vessels_master" ADD COLUMN "id" serial;--> statement-breakpoint
ALTER TABLE "vessels_master" DROP CONSTRAINT "vessels_master_pkey";--> statement-breakpoint
ALTER TABLE "vessels_master" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "imo_number" SET DATA TYPE integer USING "imo_number"::integer;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "imo_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "vessel_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "dwt" SET DATA TYPE integer USING "dwt"::integer;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "year_built" SET DATA TYPE integer USING "year_built"::integer;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "has_gears" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "has_gears" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vessels_master" ALTER COLUMN "source_payload" DROP NOT NULL;