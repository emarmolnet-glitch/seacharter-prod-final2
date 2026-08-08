import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchOpenShipsLive, normalizeOpenShipsVessel } from '../netlify/functions/_shared/openships-rest.mjs';
import { buildPortDestinationAliases, normalizePortDestination } from '../netlify/functions/_shared/commercial-vessel-search.mjs';

const [openShipsEndpoint, matchingDb, getVessels, aisIngest, trackingBridge, mapLoader, indexSource] = await Promise.all([
  readFile(new URL('../netlify/functions/openships-live-status.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/matching-sources.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/ais-ingest.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/TrackingAisStreamBridge.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../map_loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
]);

test('OpenShips REST adapter requests a global bbox and normalizes provider rows', async () => {
  let requestedUrl = '';
  const result = await fetchOpenShipsLive({
    env: { OPENSHIPS_API_URL: 'https://provider.invalid/vessels' },
    limit: 10,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ vessels: [{ MMSI: '123456789', ShipName: 'LIVE ONE', Latitude: 10, Longitude: 20, Destination: 'DZ BJA' }] }), { status: 200 });
    },
  });
  assert.match(requestedUrl, /bbox=-180%2C-90%2C180%2C90/);
  assert.equal(result.count, 1);
  assert.equal(result.vessels[0].mmsi, '123456789');
  assert.equal(result.vessels[0].source, 'OPENSHIPS');
});

test('OpenShips vessel normalizer supports GeoJSON coordinates', () => {
  const vessel = normalizeOpenShipsVessel({ type: 'Feature', geometry: { type: 'Point', coordinates: [3.2, 36.7] }, properties: { name: 'GEO SHIP', mmsi: '987654321' } });
  assert.equal(vessel.latitude, 36.7);
  assert.equal(vessel.longitude, 3.2);
});

test('Bejaia fuzzy aliases accept requested maritime abbreviations', () => {
  const pol = { name: 'Béjaïa' };
  const aliases = buildPortDestinationAliases(pol);
  for (const alias of ['BEJAIA', 'BJA', 'DZ BJA', 'DZBJA', 'BÉJAÏA']) {
    assert.equal(normalizePortDestination(`FOR ${alias} ANCH`, pol), true);
  }
  assert.ok(aliases.length >= 5);
});

test('radar paths contain no stale OpenShips database reads or response cache', () => {
  assert.doesNotMatch(openShipsEndpoint, /ais_telemetry_buffer|getOrSetCachedJson/);
  assert.doesNotMatch(matchingDb, /ais_telemetry_buffer/);
  assert.match(openShipsEndpoint, /"cache-control": "no-store, no-cache, must-revalidate"/);
  assert.match(indexSource, /no se reutiliza ningún snapshot anterior/);
});

test('AISStream backend sweeps are disabled and Tracking owns the browser socket', () => {
  assert.doesNotMatch(getVessels, /new WebSocket|from "ws"/);
  assert.doesNotMatch(aisIngest, /new WebSocket|from "ws"/);
  assert.match(getVessels, /AISSTREAM_BACKEND_DISABLED/);
  assert.match(aisIngest, /AISSTREAM_BACKEND_DISABLED/);
  assert.match(trackingBridge, /useEffect/);
  assert.match(trackingBridge, /startPersistentAisStream/);
  assert.match(trackingBridge, /mmsi/);
  assert.match(mapLoader, /FiltersShipMMSI = \[mmsi\]/);
  assert.match(mapLoader, /tracking:aisstream-update/);
});
