-- Restores the historical Netlify Database migration entry that was already
-- applied on the managed database.
--
-- The original migration file was removed from the repository, which causes
-- Netlify Database to reject deploys because applied migration history must
-- remain present in source control. The current repository schema is covered by
-- the surrounding idempotent migrations, so this restored migration is
-- intentionally a no-op.
SELECT 1;
