UPDATE "ais_vessels"
SET "vessel_type" = 'Cement Carrier'
WHERE "audit_status" = 'VALIDATED'
  AND ("vessel_type" IS NULL OR "vessel_type" ~ '^[0-9]+$')
  AND "raw_data"->>'vesselClass' IN ('Handysize', 'Supramax');
