CREATE TABLE "audited_vessels" (
	"id" serial PRIMARY KEY,
	"vessel_name" text NOT NULL,
	"imo" text,
	"flag" text,
	"dwt" integer,
	"loa" text,
	"draft" text,
	"built_year" integer,
	"spd_ballast" text,
	"spd_laden" text,
	"cons_sea" text,
	"cons_port" text,
	"vessel_class" text,
	"specialty_type" text,
	"created_at" timestamp DEFAULT now()
);
