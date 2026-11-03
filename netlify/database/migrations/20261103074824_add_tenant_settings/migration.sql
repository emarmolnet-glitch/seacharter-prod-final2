CREATE TYPE "tenant_contact_role" AS ENUM('agent_pol', 'agent_pod', 'charterer', 'owner', 'broker');--> statement-breakpoint
CREATE TABLE "tenant_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"iban" text NOT NULL,
	"swift" text DEFAULT '' NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"beneficiary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tenant_id" text NOT NULL,
	"role" "tenant_contact_role" NOT NULL,
	"company_name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"pic_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_profiles" (
	"id" text PRIMARY KEY,
	"company_name" text DEFAULT '' NOT NULL,
	"nif" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tenant_bank_accounts_tenant_idx" ON "tenant_bank_accounts" ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_contacts_tenant_role_idx" ON "tenant_contacts" ("tenant_id","role");--> statement-breakpoint
ALTER TABLE "tenant_bank_accounts" ADD CONSTRAINT "tenant_bank_accounts_tenant_id_tenant_profiles_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant_profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tenant_contacts" ADD CONSTRAINT "tenant_contacts_tenant_id_tenant_profiles_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant_profiles"("id") ON DELETE CASCADE;