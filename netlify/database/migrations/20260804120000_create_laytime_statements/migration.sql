CREATE TABLE IF NOT EXISTS "laytime_statements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_ref" text NOT NULL,
  "operation" text NOT NULL,
  "quantity_mt" numeric NOT NULL,
  "rate_mt_day" numeric,
  "allowed_hours" numeric,
  "laytime_rule" text NOT NULL DEFAULT 'SHINC',
  "weather_permitting" boolean NOT NULL DEFAULT true,
  "once_on_demurrage" boolean NOT NULL DEFAULT true,
  "commencement_delay_minutes" integer NOT NULL DEFAULT 0,
  "port_time_zone" text,
  "demurrage_rate_usd_day" numeric NOT NULL,
  "nor_tendered_at" timestamp with time zone,
  "nor_accepted_at" timestamp with time zone,
  "laytime_commenced_at" timestamp with time zone,
  "operation_started_at" timestamp with time zone,
  "operation_completed_at" timestamp with time zone,
  "statement_as_of_at" timestamp with time zone NOT NULL,
  "incidents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "calculation" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'INCOMPLETE',
  "allowed_seconds" numeric NOT NULL DEFAULT 0,
  "used_seconds" numeric NOT NULL DEFAULT 0,
  "excluded_seconds" numeric NOT NULL DEFAULT 0,
  "balance_seconds" numeric NOT NULL DEFAULT 0,
  "demurrage_usd" numeric NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "laytime_statements_operation_check" CHECK ("operation" IN ('LOAD', 'DISCHARGE')),
  CONSTRAINT "laytime_statements_rule_check" CHECK ("laytime_rule" IN ('SHINC', 'SHEX')),
  CONSTRAINT "laytime_statements_quantity_check" CHECK ("quantity_mt" > 0),
  CONSTRAINT "laytime_statements_demurrage_rate_check" CHECK ("demurrage_rate_usd_day" >= 0),
  CONSTRAINT "laytime_statements_incidents_check" CHECK (jsonb_typeof("incidents") = 'array'),
  CONSTRAINT "laytime_statements_calculation_check" CHECK (jsonb_typeof("calculation") = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS "laytime_statements_contract_operation_unique_idx"
  ON "laytime_statements" (upper("contract_ref"), "operation");

CREATE INDEX IF NOT EXISTS "laytime_statements_status_updated_idx"
  ON "laytime_statements" ("status", "updated_at" DESC);
