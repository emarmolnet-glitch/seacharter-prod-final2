import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeRadarTechnicalData } from '../netlify/functions/_shared/radar-enrichment.mjs';

test('radar enrichment never injects historical vessels', () => {
  const radar = [{ imo: '9123456', mmsi: '123456789', name: 'LIVE ONE', latitude: 1, longitude: 2 }];
  const master = [
    { imo_number: 9123456, mmsi: '123456789', vessel_name: 'MASTER ONE', dwt: 25000 },
    { imo_number: 9765432, mmsi: '987654321', vessel_name: 'HISTORICAL ONLY', dwt: 40000 },
  ];

  const result = mergeRadarTechnicalData(radar, master);

  assert.equal(result.vessels.length, 1);
  assert.equal(result.vessels[0].name, 'LIVE ONE');
  assert.equal(result.vessels[0].dwt, 25000);
  assert.equal(result.counts.liveRadar, 1);
  assert.equal(result.counts.technicalMatches, 1);
  assert.equal(result.vessels.some((vessel) => vessel.name === 'HISTORICAL ONLY'), false);
});

test('radar vessels without Neon DWT remain visible as unknown', () => {
  const radar = [{ imo: '9000001', mmsi: '111222333', name: 'UNKNOWN DWT', latitude: 3, longitude: 4 }];

  const result = mergeRadarTechnicalData(radar, []);

  assert.equal(result.vessels.length, 1);
  assert.equal(result.vessels[0].dwt, null);
  assert.equal(result.vessels[0].dwtStatus, 'UNKNOWN');
  assert.equal(result.vessels[0].technicalMatch, false);
  assert.deepEqual(result.vessels[0].source_origins, ['DATALASTIC']);
});

test('production sources contain no legacy provider references', async () => {
  const files = [
    '../index.html',
    '../netlify/functions/matching-local.ts',
    '../netlify/functions/_shared/aisCoordinator.js',
    '../db/matching-sources.ts',
  ];
  const sources = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.doesNotMatch(sources.join('\n'), /open[ -]?ships/i);
  assert.doesNotMatch(sources.join('\n'), /predictiveVessels|filtered_source_database/);
});

test('radar enrichment uses the indexed MMSI comparison without column transforms', async () => {
  const source = await readFile(new URL('../netlify/functions/_shared/radar-enrichment.mjs', import.meta.url), 'utf8');

  assert.match(source, /mmsi IS NOT NULL AND mmsi = ANY\(\$2::text\[\]\)/);
  assert.doesNotMatch(source, /REGEXP_REPLACE\(COALESCE\(mmsi/);
});
