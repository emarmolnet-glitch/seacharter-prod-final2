CREATE TABLE "external_priority_records" (
	"id" serial PRIMARY KEY,
	"source" text DEFAULT 'commercial_nlp' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'pending_databridge' NOT NULL,
	"vessel_name" text NOT NULL,
	"open_country" text DEFAULT 'N/A' NOT NULL,
	"dwt" integer DEFAULT 0 NOT NULL,
	"pol" text DEFAULT 'N/A' NOT NULL,
	"pod" text DEFAULT 'N/A' NOT NULL,
	"cargo_quantity" numeric DEFAULT '0' NOT NULL,
	"laycan" text DEFAULT 'N/A' NOT NULL,
	"owner_cost" numeric DEFAULT '0' NOT NULL,
	"owner_internal_price" numeric DEFAULT '0' NOT NULL,
	"charterer_sale_freight" numeric DEFAULT '0' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
