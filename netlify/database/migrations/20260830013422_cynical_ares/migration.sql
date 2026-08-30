CREATE TABLE "client_api_usage" (
	"id" serial PRIMARY KEY,
	"tenant_id" varchar(255) NOT NULL,
	"service_used" varchar(100) NOT NULL,
	"credits_consumed" integer NOT NULL,
	"voyage_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
