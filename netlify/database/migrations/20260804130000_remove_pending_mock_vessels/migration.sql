DELETE FROM vessels_master
WHERE vessel_name IN ('DANUM 185', 'DANUM 186')
  AND dwt = 10000
  AND origen = 'Core PRO'
  AND UPPER(COALESCE(status, '')) = 'PENDING_AUDIT'
  AND UPPER(COALESCE(process_status, '')) = 'DUE_DILIGENCE';
