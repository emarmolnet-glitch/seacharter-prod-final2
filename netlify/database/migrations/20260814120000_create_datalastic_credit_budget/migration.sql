CREATE TABLE IF NOT EXISTS "datalastic_credit_budget" (
  "period_key" text PRIMARY KEY,
  "used_credits" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "datalastic_credit_budget_used_credits_check"
    CHECK ("used_credits" >= 0)
);
