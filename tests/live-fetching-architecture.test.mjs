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

test('OpenShips REST adapter requests a regional position box and normalizes provider rows', async () => {
  let requestedUrl = '';
  const result = await fetchOpenShipsLive({
    env: { OPENSHIPS_API_URL: 'https://provider.invalid/vessels' },
    latitude: 36.75,
    longitude: 5.08,
    limit: 10,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ vessels: [{ MMSI: '123456789', ShipName: 'LIVE ONE', Latitude: 10, Longitude: 20, Destination: 'DZ BJA' }] }), { status: 200 });
    },
  });
  assert.match(requestedUrl, /\/vessels\/external\/vessels\/position\/box\?/);
  assert.match(requestedUrl, /minLat=-13\.25/);
  assert.match(requestedUrl, /maxLat=86\.75/);
  assert.match(requestedUrl, /minLon=-44\.92/);
  assert.match(requestedUrl, /maxLon=55\.08/);
  assert.doesNotMatch(requestedUrl, /[?&](?:box|bbox)=/);
  assert.equal(result.count, 1);
  assert.equal(result.vessels[0].mmsi, '123456789');
  assert.equal(result.vessels[0].source, 'OPENSHIPS');
});

test('OpenShips REST adapter exposes HTTP 403 diagnostics and a safe browser fallback URL', async () => {
  const originalLog = console.log;
  const logs = [];
  console.log = message => logs.push(String(message));
  try {
    await assert.rejects(
      fetchOpenShipsLive({
        env: { OPENSHIPS_API_URL: 'https://provider.invalid/vessels' },
        latitude: 36.75,
        longitude: 5.08,
        limit: 25,
        fetchImpl: async () => new Response(JSON.stringify({ message: 'Access Denied' }), {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'content-type': 'application/json' },
        }),
      }),
      error => error?.code === 'OPENSHIPS_HTTP_ERROR'
        && error?.diagnostics?.httpStatus === 403
        && error?.diagnostics?.message === 'Access Denied'
        && error?.diagnostics?.clientFallback?.allowed === true
        && String(error?.diagnostics?.clientFallback?.url).includes('limit=25'),
    );
  } finally {
    console.log = originalLog;
  }
  assert.match(logs.join('\n'), /\[OpenShips Fetch\] Requesting: https:\/\/provider\.invalid\/vessels\/external\/vessels\/position\/box\?/);
});

test('OpenShips diagnostics never expose configured API credentials', async () => {
  const originalLog = console.log;
  const logs = [];
  console.log = message => logs.push(String(message));
  try {
    await assert.rejects(
      fetchOpenShipsLive({
        env: {
          OPENSHIPS_API_URL: 'https://provider.invalid/vessels',
          OPENSHIPS_API_KEY: 'sensitive-test-key',
          OPENSHIPS_API_KEY_QUERY_PARAM: 'api_key',
        },
        latitude: 36.75,
        longitude: 5.08,
        fetchImpl: async () => new Response('Forbidden', { status: 403, statusText: 'Forbidden' }),
      }),
      error => error?.diagnostics?.clientFallback?.allowed === false
        && !String(error?.diagnostics?.requestUrl).includes('sensitive-test-key'),
    );
  } finally {
    console.log = originalLog;
  }
  assert.doesNotMatch(logs.join('\n'), /sensitive-test-key/);
  assert.match(logs.join('\n'), /api_key=%5Bredacted%5D/);
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

test('OpenShips failures reach the browser and trigger only the safe 400 or 403 fallback', () => {
  assert.match(openShipsEndpoint, /warnings: \[warning\]/);
  assert.match(openShipsEndpoint, /clientFallback: diagnostics\.clientFallback/);
  assert.match(indexSource, /const prefix = Number\.isFinite\(status\) \? '\[OpenShips Error\]'/);
  assert.match(indexSource, /console\.warn\(`\$\{prefix\} \$\{statusLabel\}/);
  assert.match(indexSource, /\[400, 403\]\.includes\(upstreamStatus\) && payload\?\.clientFallback\?\.allowed === true/);
  assert.match(indexSource, /fetchOpenShipsFromBrowser/);
  assert.match(indexSource, /OPENSHIPS_BROWSER_FALLBACK/);
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
