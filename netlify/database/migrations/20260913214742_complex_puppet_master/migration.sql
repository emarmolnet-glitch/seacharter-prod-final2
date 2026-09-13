CREATE TABLE "forwarder_projects" (
	"id" serial PRIMARY KEY,
	"project_ref" varchar(255) UNIQUE,
	"client_name" varchar(255),
	"status" varchar(50) DEFAULT 'Borrador',
	"global_margin_percentage" numeric DEFAULT '15',
	"documents" jsonb DEFAULT '[]',
	"items" jsonb DEFAULT '[]',
	"land_origin" varchar(255),
	"land_destination" varchar(255),
	"land_distance" numeric,
	"land_freight_cost" numeric,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
