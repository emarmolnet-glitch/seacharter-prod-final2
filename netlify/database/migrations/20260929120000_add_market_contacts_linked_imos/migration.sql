DO $contact_role_update$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactRole') THEN
    BEGIN
      ALTER TYPE "ContactRole" ADD VALUE IF NOT EXISTS 'SHIPMANAGEMENT';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END
$contact_role_update$;--> statement-breakpoint
ALTER TABLE "Market_Contacts" ADD COLUMN IF NOT EXISTS "linked_imos" text[] DEFAULT '{}'::text[];
