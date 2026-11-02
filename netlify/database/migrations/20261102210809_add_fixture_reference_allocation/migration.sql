CREATE TABLE "fixture_reference_aliases" (
	"legacy_id" text PRIMARY KEY,
	"reference" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "fixture_reference_counters" (
	"year" integer PRIMARY KEY,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
-- Reserve existing commercial references before issuing the first new number.
WITH persisted_references AS (
  SELECT upper(reference) AS reference FROM charter_dossiers
  UNION
  SELECT upper(project_ref) FROM forwarder_projects
  UNION
  SELECT upper(substring(key FROM 12)) FROM "AppConfig" WHERE key LIKE 'estimation_RDM/%'
)
INSERT INTO fixture_reference_aliases (legacy_id, reference)
SELECT reference, reference FROM persisted_references
WHERE reference ~ '^RDM/[0-9]{4}-[0-9]{4}$' AND right(reference, 4) <> '0000'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO fixture_reference_counters (year, last_number)
SELECT substring(reference FROM 5 FOR 4)::integer, max(right(reference, 4)::integer)
FROM fixture_reference_aliases
GROUP BY substring(reference FROM 5 FOR 4)::integer
ON CONFLICT (year) DO UPDATE
SET last_number = GREATEST(fixture_reference_counters.last_number, excluded.last_number);
