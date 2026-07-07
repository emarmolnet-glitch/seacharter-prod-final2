-- Historical reconciliation migration.
--
-- This migration name exists in the production _prisma_migrations table, but
-- the file was removed from the repository. The current static deployment no
-- longer references audited_vessels, and the original schema is not present in
-- source control, so this file intentionally performs no schema changes. Its
-- purpose is to keep deployment validation aligned with the production
-- migration ledger.
SELECT 1;
