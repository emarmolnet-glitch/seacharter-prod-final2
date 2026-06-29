ALTER TABLE "cotizaciones" ADD COLUMN "type_of_freight_applied" text;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD COLUMN "cost_breakdown" jsonb;