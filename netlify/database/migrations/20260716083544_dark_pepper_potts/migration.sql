CREATE TABLE "ais_vessels" (
	"storage_key" text PRIMARY KEY,
	"imo_number" text NOT NULL,
	"mmsi" text,
	"vessel_name" text,
	"ship_type" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source" text NOT NULL,
	"vessel_data" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
