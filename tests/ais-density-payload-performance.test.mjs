import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const mapLoader = require('../map_loader.js');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const localMatchingSource = readFileSync(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8');
const aiFilterSource = readFileSync(new URL('../netlify/functions/ai-ais-filter.ts', import.meta.url), 'utf8');

const markerStart = indexSource.indexOf('const AIS_MARKER_RENDER_BATCH_SIZE = 75;');
const markerEnd = indexSource.indexOf('const globalOpportunitiesState =', markerStart);
const markerSource = indexSource.slice(markerStart, markerEnd);

const counterStart = indexSource.indexOf('window.renderFilteredAisCounters = function');
const counterEnd = indexSource.indexOf('window.reiniciarMemoriaBarridoAIS', counterStart);
const counterSource = indexSource.slice(counterStart, counterEnd);

test('AIS normalization returns explicit plain vessel properties from nested source payloads', () => {
  const normalized = mapLoader.normalizeShipFields({
    source_payload: JSON.stringify({
      vessel_name: 'TEST BULKER',
      imo_number: '9876543',
      mmsi: '224000001',
      latitude: 36.12,
      longitude: -5.42,
      dwt: 42000,
      vessel_type: 'Bulk Carrier',
    }),
  });

  assert.equal(normalized.vesselName, 'TEST BULKER');
  assert.equal(normalized.imo, '9876543');
  assert.equal(normalized.mmsi, '224000001');
  assert.equal(normalized.latitude, 36.12);
  assert.equal(normalized.longitude, -5.42);
  assert.equal(normalized.dwt, 42000);
  assert.notEqual(JSON.stringify(normalized), '{}');
});

test('local matching serializes nested AISStream records into explicit vessel fields', () => {
  assert.match(localMatchingSource, /const sourcePayload = parseRecord\(row\.source_payload\)/);
  assert.match(localMatchingSource, /message\.PositionReport/);
  assert.match(localMatchingSource, /message\.ShipStaticData/);
  assert.match(localMatchingSource, /positionReport\.Latitude/);
  assert.match(localMatchingSource, /positionReport\.Longitude/);
  assert.match(localMatchingSource, /staticData\.ImoNumber/);
  assert.match(localMatchingSource, /cargoType,[\s\S]*tipo_carga: cargoType/);
  assert.match(localMatchingSource, /return \{[\s\S]*latitude,[\s\S]*longitude,[\s\S]*dwt,/);
});

test('matching coordinate readers skip null database values before nested AIS coordinates', () => {
  assert.match(localMatchingSource, /value === undefined \|\| value === null \|\| value === ""/);
  assert.match(aiFilterSource, /value === undefined \|\| value === null \|\| value === ""/);
  assert.match(aiFilterSource, /meta\.Latitude[\s\S]*position\.Latitude/);
  assert.match(aiFilterSource, /meta\.Longitude[\s\S]*position\.Longitude/);
});

test('matching audit payload returns and snapshots serializable vessel objects', () => {
  assert.match(indexSource, /const arrayDeBuquesEncontrados = viableMatches\.map\([^=]+=> \{[\s\S]*return \{[\s\S]*latitude,[\s\S]*longitude,[\s\S]*cargoType,[\s\S]*dwt:/);
  assert.match(indexSource, /const serializedMatchingPayload = JSON\.parse\(JSON\.stringify\(arrayDeBuquesEncontrados\)\)/);
  assert.match(indexSource, /Payload JSON:", serializedMatchingPayload/);
});

test('density badge binds strictly to the filtered vessel array length', () => {
  assert.match(counterSource, /const filteredVesselsArray = Array\.isArray\(vesselsInput\) \? vesselsInput : \[\]/);
  assert.match(counterSource, /const filteredCount = filteredVesselsArray\.length/);
  assert.doesNotMatch(counterSource, /AIS_DUAL_SWEEP_LIMIT|persistedTotal|limit/);
  assert.doesNotMatch(indexSource, /limit: '750'/);
});

test('Leaflet marker rendering deduplicates linearly and yields between batches', () => {
  assert.match(markerSource, /const renderableById = new Map\(\)/);
  assert.doesNotMatch(markerSource, /findIndex\(/);
  assert.match(markerSource, /AIS_MARKER_RENDER_BATCH_SIZE = 75/);
  assert.match(markerSource, /requestAnimationFrame\(\(\) => renderMarkerBatch\(endIndex\)\)/);
  assert.match(markerSource, /aisClusterGroup\.addLayers\(markersToAdd\)/);
  assert.match(markerSource, /new CustomEvent\('ais:markers-rendered'/);
});
