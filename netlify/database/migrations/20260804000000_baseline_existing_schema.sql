DO $baseline$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'ais_vessels',
    'AppConfig',
    'data_bridge_vessel_ingestions',
    'databridge_vessel_syncs',
    'ia_reports',
    'pda_vessel_confirmations',
    'pipeline_inbox',
    'session_sync',
    'vessels_master',
    'voyages_tracking'
  ]
  LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION
        'Cannot baseline migration history: required table public.% is missing',
        required_table;
    END IF;
  END LOOP;
END
$baseline$;
