import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [statsSource, dataBridgeSource] = await Promise.all([
  readFile(new URL('../netlify/functions/databridge-master-stats.ts', import.meta.url), 'utf8'),
  readFile(new URL('../public/databridge.html', import.meta.url), 'utf8'),
]);

test('Data Bridge master stats counts vessels_master without optional source columns', () => {
  assert.match(statsSource, /COUNT\(\*\)::integer AS total_vessels/);
  assert.match(statsSource, /FROM vessels_master/);
  assert.match(statsSource, /path: "\/api\/databridge-master-stats"/);
  assert.doesNotMatch(statsSource, /source\s*=|origen\s*=|source_provenance|audit_status/);
});

test('Data Bridge historical counter uses PostgreSQL instead of random vessel values', () => {
  const manualSyncSource = dataBridgeSource.match(/function triggerManualSync\(\) \{([\s\S]*?)function pauseResumeSync/)?.[1] || '';
  assert.match(dataBridgeSource, /Total Histórico Data Bridge/);
  assert.match(dataBridgeSource, /function refreshDataBridgeMasterCount\(\)/);
  assert.match(dataBridgeSource, /\/api\/databridge-master-stats/);
  assert.match(dataBridgeSource, /response\.headers\.get\('content-type'\)\?\.includes\('application\/json'\)/);
  assert.match(dataBridgeSource, /throw new Error\('Invalid Payload'\)/);
  assert.match(dataBridgeSource, /payload\?\.success !== true/);
  assert.match(dataBridgeSource, /Number\.isFinite\(totalVessels\)/);
  assert.match(dataBridgeSource, /vesselCount = totalVessels/);
  assert.match(dataBridgeSource, /DATA_BRIDGE_MASTER_STATS_INTERVAL_MS = 60000/);
  assert.match(dataBridgeSource, /if \(dataBridgeMasterStatsRequest\) return dataBridgeMasterStatsRequest/);
  assert.match(dataBridgeSource, /window\.clearInterval\(dataBridgeMasterStatsTimer\)/);
  assert.match(dataBridgeSource, /window\.addEventListener\('pagehide', stopDataBridgeMasterStatsPolling, \{ once: true \}\)/);
  assert.doesNotMatch(manualSyncSource, /refreshDataBridgeMasterCount\(\)/);
  assert.doesNotMatch(dataBridgeSource, /vesselCount \+= Math\.floor\(Math\.random\(\) \* 5\) - 2/);
});
