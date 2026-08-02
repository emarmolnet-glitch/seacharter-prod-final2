CREATE TABLE "pda_vessel_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"estimation_id" text,
	"vessel_name" text NOT NULL,
	"imo_number" text,
	"pol" text,
	"pod" text,
	"previous_vessel" jsonb NOT NULL,
	"actual_vessel" jsonb NOT NULL,
	"operational_validation" jsonb NOT NULL,
	"financial_breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
