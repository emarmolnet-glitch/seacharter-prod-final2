ALTER TABLE "vessels_master"
ALTER COLUMN "eta" TYPE timestamptz
USING (
  CASE
    WHEN "eta" IS NULL OR BTRIM("eta"::text) = '' THEN NULL
    WHEN "eta"::text ~ '^\d{4}-\d{2}-\d{2}' THEN "eta"::timestamptz
    ELSE NULL
  END
);
