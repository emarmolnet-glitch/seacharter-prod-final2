import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const cacheSource = read('netlify/functions/_shared/response-cache.ts');
const routeSource = read('netlify/functions/route.ts');
const openShipsSource = read('netlify/functions/openships-live-status.ts');
const vesselsFilterSource = read('netlify/functions/vessels-filter.ts');
const auditVesselsSource = read('netlify/functions/audit-vessels.ts');
const dataBridgeStateSource = read('netlify/functions/databridge-connection-state.ts');
const dataBridgeSearchSource = read('netlify/functions/databridge-vessel-search.ts');
const indexSource = read('index.html');
const distIndexSource = read('dist/index.html');
const resilienceSource = read('network-resilience.js');
const distResilienceSource = read('dist/network-resilience.js');

test('critical backend responses use persistent Netlify Blobs cache with stale fallback', () => {
  assert.match(cacheSource, /from "@netlify\/blobs"/);
  assert.match(cacheSource, /getStore\("core-pro-response-cache"\)/);
  assert.match(cacheSource, /const memoryCache = new Map/);
  assert.match(cacheSource, /const inFlightRequests = new Map/);
  assert.match(cacheSource, /cacheStatus: "STALE"/);
  assert.match(cacheSource, /netlify-cdn-cache-control/);
  assert.match(cacheSource, /x-core-cache/);
  assert.match(cacheSource, /bypassRead\?: boolean/);
  assert.match(cacheSource, /!options\.bypassRead && envelope && envelope\.expiresAt > now/);
});

test('critical endpoint TTLs protect expensive vessel snapshots and routes', () => {
  for (const source of [openShipsSource, vesselsFilterSource, auditVesselsSource, dataBridgeSearchSource]) {
    assert.match(source, /ttlMs: 5 \* 60 \* 1000/);
    assert.match(source, /staleTtlMs: 30 \* 60 \* 1000/);
    assert.match(source, /createResponseCacheHeaders\(cached, 300, 1_800\)/);
  }
  assert.match(dataBridgeStateSource, /ttlMs: 60 \* 1000/);
  assert.match(dataBridgeStateSource, /staleTtlMs: 10 \* 60 \* 1000/);
  assert.match(routeSource, /ttlMs: 24 \* 60 \* 60 \* 1000/);
  assert.match(routeSource, /staleTtlMs: 7 \* 24 \* 60 \* 60 \* 1000/);
  for (const source of [openShipsSource, vesselsFilterSource, auditVesselsSource]) {
    assert.match(source, /radarContext/);
    assert.match(source, /bypassRead: forceRefresh/);
  }
});

test('frontend rate controls preserve cacheable reads and debounce user-driven matching', () => {
  for (const source of [indexSource, distIndexSource]) {
    assert.match(source, /AIS_MATCHING_DEBOUNCE_MS = 600/);
    assert.match(source, /DATA_BRIDGE_HTTP_POLL_INTERVAL_MS = 10_000|DATA_BRIDGE_HTTP_POLL_INTERVAL_MS = 60_000|OPENSHIPS_RADAR_POLL_INTERVAL_MS = 120_000/);
    assert.doesNotMatch(source, /const openShipsRequest = \{[^\n]*cache: 'no-store'/);
    assert.doesNotMatch(source, /const res = await fetch\(endpoint, \{ cache: 'no-store', headers: \{ Accept: 'application\/json' \} \}\)/);
    assert.doesNotMatch(source, /fetch\('\/api\/databridge-vessel-search', \{\s*method: 'POST',\s*cache: 'no-store'/);
    assert.match(source, /getRadarRequestContextSignature/);
    assert.match(source, /laycanStart:/);
    assert.match(source, /laycanEnd:/);
    assert.match(source, /params\.set\('cacheBust', String\(Date\.now\(\)\)\)/);
    assert.match(source, /await window\.executeMatchingRadarSweep\(\)/);
    assert.match(source, /new CustomEvent\('radar-refresh-pending'/);
  }
  assert.doesNotMatch(indexSource, /const pollRequest = \{[\s\S]{0,180}cache: 'no-store'/);
});

test('circuit breaker classifies vessel filters and ships the same browser guard', () => {
  assert.match(resilienceSource, /vessels-filter/);
  assert.equal(distResilienceSource, resilienceSource);
});
