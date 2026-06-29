CREATE TABLE "cotizaciones" (
	"unique_reference" text PRIMARY KEY,
	"issue_date" text NOT NULL,
	"calculation_data" jsonb NOT NULL
);
