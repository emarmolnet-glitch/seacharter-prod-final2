UPDATE "ais_vessels"
SET "vessel_type" = CASE
  WHEN "vessel_type" ILIKE '%Cement Carrier%'
    THEN 'General Cargo / Bulk Carrier / Cement Carrier'
  WHEN "raw_data"->>'cargoClass' = 'General Cargo'
    THEN 'General Cargo'
  ELSE "vessel_type"
END
WHERE "audit_status" = 'VALIDATED'
  AND (
    "vessel_type" ILIKE '%Cement Carrier%'
    OR "raw_data"->>'cargoClass' = 'General Cargo'
  );
