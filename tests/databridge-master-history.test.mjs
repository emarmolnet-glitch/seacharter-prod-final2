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
  assert.match(dataBridgeSource, /Total Histórico Data Bridge/);
  assert.match(dataBridgeSource, /function refreshDataBridgeMasterCount\(\)/);
  assert.match(dataBridgeSource, /\/api\/databridge-master-stats/);
  assert.match(dataBridgeSource, /vesselCount = Number\(payload\?\.totalVessels\) \|\| 0/);
  assert.doesNotMatch(dataBridgeSource, /vesselCount \+= Math\.floor\(Math\.random\(\) \* 5\) - 2/);
});
