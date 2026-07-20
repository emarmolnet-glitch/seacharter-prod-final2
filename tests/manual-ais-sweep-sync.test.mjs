import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const triggerSource = await readFile(new URL('../netlify/functions/trigger-ais-sweep.mts', import.meta.url), 'utf8');
const backgroundWorkerSource = await readFile(new URL('../netlify/functions/ais-sweep-worker-background.mts', import.meta.url), 'utf8');
const scanSource = await readFile(new URL('../netlify/functions/ais-scan-request.ts', import.meta.url), 'utf8');
const getVesselsSource = await readFile(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8');
const aisIngestSource = await readFile(new URL('../netlify/functions/ais-ingest.ts', import.meta.url), 'utf8');
const masterSource = await readFile(new URL('../db/vessels-master-sync.ts', import.meta.url), 'utf8');
const receiverSource = await readFile(new URL('../netlify/functions/receive-vessels.ts', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const migrationSource = await readFile(new URL('../netlify/database/migrations/20260720120000_add_vessels_master_timestamp_columns_and_indexes/migration.sql', import.meta.url), 'utf8');

test('manual sweep validates the actual AIS persistence table and exposes status polling', () => {
  assert.match(triggerSource, /const RADAR_BUFFER_TABLE = "ais_vessels"/);
  assert.match(triggerSource, /req\.method === "GET"/);
  assert.match(triggerSource, /scan_result/);
  assert.match(triggerSource, /method: \["GET", "POST"\]/);
  assert.match(triggerSource, /'scan_status', 'QUEUED'/);
});

test('scan status keeps a correlated result for the accepted scan id', () => {
  assert.match(scanSource, /scanId\?: unknown/);
  assert.match(scanSource, /setAppConfigValue\("scan_result"/);
  assert.match(scanSource, /masterPersistedCount/);
  assert.match(scanSource, /availableVesselCount/);
  assert.match(scanSource, /degraded: capturePayload\.degraded === true/);
  assert.match(scanSource, /liveConnection: capturePayload\.liveConnection !== false/);
});

test('captured AIS vessels are mirrored into the Core PRO master source', () => {
  assert.match(getVesselsSource, /upsertRadarVesselsMaster\(rows\)/);
  assert.match(masterSource, /INSERT INTO vessels_master/);
  assert.match(masterSource, /validRadarMmsi/);
  assert.match(masterSource, /COREPRO:\$\{createHash\("sha256"\)/);
  assert.match(masterSource, /fecha_ultima_actualizacion = NOW\(\)/);
  assert.match(masterSource, /vessel\.processStatus \|\| "SYNCED"/);
  assert.doesNotMatch(masterSource, /source, source_payload, updated_at/);
});

test('every AIS ingestion path mirrors accepted rows into vessels_master', () => {
  assert.match(aisIngestSource, /upsertRadarVesselsMaster\(rows\)/);
  assert.match(aisIngestSource, /masterPersistedCount/);
  assert.match(aisIngestSource, /handshakeTimeout: Math\.min\(timeoutMs, 5000\)/);
  assert.match(aisIngestSource, /perMessageDeflate: false/);
});

test('Data Bridge receiver uses the deployed partial IMO identity and current columns', () => {
  assert.match(receiverSource, /ON CONFLICT \(imo_number\) WHERE imo_number IS NOT NULL AND imo_number <> 0 DO UPDATE SET/);
  assert.match(receiverSource, /process_status, origen, audit_source, source_payload, system_identity, fecha_ultima_actualizacion/);
  assert.match(receiverSource, /vessel\.imoNumber, vessel\.vesselName, vessel\.dwt/);
  assert.doesNotMatch(receiverSource, /process_status, source, source_payload, updated_at/);
});

test('orphaned sweeps expire quickly and active sweeps are reused idempotently', () => {
  assert.match(triggerSource, /QUEUED_SCAN_STALE_AFTER_MS = 60 \* 1000/);
  assert.match(triggerSource, /RUNNING_SCAN_STALE_AFTER_MS = 10 \* 60 \* 1000/);
  assert.match(triggerSource, /AIS_SWEEP_STARTUP_ORPHANED/);
  assert.match(triggerSource, /AIS_SWEEP_STALE/);
  assert.match(triggerSource, /AIS_SWEEP_REUSED_ACTIVE/);
  assert.match(triggerSource, /reused: true/);
  assert.match(triggerSource, /status: 202/);
});

test('manual sweep dispatches a real Netlify background function instead of waitUntil', () => {
  assert.match(triggerSource, /\.netlify\/functions\/ais-sweep-worker-background/);
  assert.match(triggerSource, /AbortSignal\.timeout\(8000\)/);
  assert.match(triggerSource, /AIS_BACKGROUND_DISPATCH_FAILED/);
  assert.doesNotMatch(triggerSource, /waitUntil|DeferredContext|executeSweep/);
});

test('background worker executes the scan and closes only its correlated failures', () => {
  assert.match(backgroundWorkerSource, /handleScanRequest/);
  assert.match(backgroundWorkerSource, /failCorrelatedScan\(scanId, "AIS_SWEEP_WORKER_REJECTED", error\)/);
  assert.match(backgroundWorkerSource, /"AIS_SWEEP_BACKGROUND_CRASH"/);
  assert.match(backgroundWorkerSource, /currentScanId !== scanId/);
  assert.match(backgroundWorkerSource, /new Set\(\["QUEUED", "RUNNING"\]\)/);
});

test('AISStream connection failures fall back to validated database vessels', () => {
  assert.match(getVesselsSource, /handshakeTimeout: Math\.min\(timeoutMs, 5000\)/);
  assert.match(getVesselsSource, /source: filtered\.length > 0 \? "stored-fallback" : "stored-fallback-empty"/);
  assert.match(getVesselsSource, /degraded: true/);
  assert.match(getVesselsSource, /liveConnection: false/);
  assert.match(getVesselsSource, /availableVesselCount: filtered\.length/);
  assert.match(indexSource, /completion\.availableVesselCount \?\? completion\.masterPersistedCount/);
  assert.match(indexSource, /AISStream no disponible · usando base local/);
  assert.match(indexSource, /SEQUENTIAL_TELEMETRY_STYLES = \{[\s\S]*?warning: \{/);
});

test('manual sweep UI waits for completion instead of resetting after HTTP 202', () => {
  assert.match(indexSource, /waitForManualAisSweepCompletion/);
  assert.match(indexSource, /matchesRequestedScan/);
  assert.match(indexSource, /AIS_SWEEP_COMPLETE/);
  assert.match(indexSource, /Barrido AIS completado:/);
  const pollingStart = indexSource.indexOf('window.waitForManualAisSweepCompletion');
  const pollingEnd = indexSource.indexOf('window.executeSweepAIS', pollingStart);
  const pollingSource = indexSource.slice(pollingStart, pollingEnd);
  assert.match(pollingSource, /while \(true\)/);
  assert.match(pollingSource, /\['COMPLETE', 'COMPLETED'\]/);
  assert.match(pollingSource, /\['ERROR', 'FAILED'\]/);
  assert.match(pollingSource, /AisSweepFailedError/);
  assert.doesNotMatch(pollingSource, /timeoutMs|excedió el tiempo de espera/);
});

test('additive migration restores compatibility columns without modifying applied migrations', () => {
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS "source" text/);
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS "created_at"/);
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS "updated_at"/);
  assert.match(migrationSource, /vessels_master_imo_number_sync_key/);
});
