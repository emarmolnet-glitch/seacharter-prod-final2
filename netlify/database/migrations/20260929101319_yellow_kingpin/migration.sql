CREATE TYPE "ContactRole" AS ENUM('OWNER', 'BROKER', 'AGENT', 'LOGISTICS', 'CHARTERER', 'SHIPMANAGEMENT');--> statement-breakpoint
CREATE TABLE "Market_Contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"emails" text[] DEFAULT '{}'::text[],
	"phones" text[] DEFAULT '{}'::text[],
	"country" text,
	"contact_role" "ContactRole" DEFAULT 'BROKER'::"ContactRole" NOT NULL,
	"notes" text,
	"linked_imos" text[] DEFAULT '{}'::text[],
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
