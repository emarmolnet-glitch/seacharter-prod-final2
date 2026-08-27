CREATE TABLE "pda_estimations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"calculation_key" text NOT NULL,
	"estimation_id" text,
	"session_id" text,
	"pol" text,
	"pod" text,
	"pda_total" double precision NOT NULL,
	"pda_pol" double precision NOT NULL,
	"pda_pod" double precision NOT NULL,
	"pol_breakdown" jsonb NOT NULL,
	"pod_breakdown" jsonb NOT NULL,
	"calculation_mode" text DEFAULT 'parametric-estimator' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"vessel_name" text,
	"imo_number" text,
	"cargo_quantity" double precision,
	"calculation_context" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pda_estimations_values_nonnegative_check" CHECK ("pda_total" >= 0 AND "pda_pol" >= 0 AND "pda_pod" >= 0),
	CONSTRAINT "pda_estimations_pol_breakdown_array_check" CHECK (jsonb_typeof("pol_breakdown") = 'array'),
	CONSTRAINT "pda_estimations_pod_breakdown_array_check" CHECK (jsonb_typeof("pod_breakdown") = 'array'),
	CONSTRAINT "pda_estimations_context_object_check" CHECK (jsonb_typeof("calculation_context") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pda_estimations_calculation_key_uidx" ON "pda_estimations" ("calculation_key");--> statement-breakpoint
CREATE INDEX "pda_estimations_estimation_updated_idx" ON "pda_estimations" ("estimation_id","updated_at");--> statement-breakpoint
CREATE INDEX "pda_estimations_session_updated_idx" ON "pda_estimations" ("session_id","updated_at");