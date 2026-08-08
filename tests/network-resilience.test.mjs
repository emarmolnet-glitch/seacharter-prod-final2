import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const resilienceSource = readFileSync(new URL('../network-resilience.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const distIndexSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const bunkerFunctionSource = readFileSync(new URL('../netlify/functions/get-bunker-prices.js', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const netlifyConfigSource = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');

function loadGuard(fetchImpl) {
  const window = {
    fetch: fetchImpl,
    location: { href: 'https://core-pro.test/' },
  };
  vm.runInNewContext(resilienceSource, { window, URL, Date, console });
  return window;
}

test('429 and 503 responses open a service circuit for at least 60 seconds', async () => {
  let calls = 0;
  const window = loadGuard(async () => {
    calls += 1;
    return { ok: false, status: 503, headers: { get: () => null } };
  });

  const first = await window.fetch('/api/route', { method: 'POST' });
  assert.equal(first.status, 503);
  const state = window.CoreNetworkGuard.getState('routing');
  assert.equal(state.isOpen, true);
  assert.ok(state.retryAfterMs > 59_000);

  await assert.rejects(
    window.fetch('/api/route', { method: 'POST' }),
    error => error?.code === 'CIRCUIT_OPEN' && error?.service === 'routing',
  );
  assert.equal(calls, 1);
});

test('circuits are isolated by service and critical Radar requests are auto-classified', async () => {
  const calls = [];
  const window = loadGuard(async input => {
    calls.push(String(input));
    const status = String(input).includes('openships') ? 429 : 200;
    return { ok: status === 200, status, headers: { get: () => null } };
  });

  await window.fetch('/api/openships/live-status?polLat=1&polLon=2');
  const routeResponse = await window.fetch('/api/route');

  assert.equal(routeResponse.ok, true);
  assert.equal(window.CoreNetworkGuard.getState('openships-radar').isOpen, true);
  assert.equal(window.CoreNetworkGuard.getState('routing').isOpen, false);
  assert.equal(window.CoreNetworkGuard.resolveServiceForRequest('/.netlify/functions/get-vessels'), 'radar');
  assert.equal(window.CoreNetworkGuard.resolveServiceForRequest('/api/vessels-filter?radiusNm=2000'), 'radar');
  assert.equal(calls.length, 2);
});

test('polling, bunker caching and Globe fallback use resilient contracts', () => {
  assert.match(indexSource, /DATA_BRIDGE_HTTP_POLL_INTERVAL_MS = 10_000/);
  assert.match(indexSource, /OPENSHIPS_RADAR_POLL_INTERVAL_MS = 120_000/);
  assert.match(indexSource, /getBackoffDelay\([\s\S]*DATA_BRIDGE_HTTP_POLL_MAX_INTERVAL_MS/);
  assert.match(indexSource, /getBackoffDelay\([\s\S]*OPENSHIPS_RADAR_POLL_MAX_INTERVAL_MS/);
  assert.match(indexSource, /BUNKER_INDEX_CACHE_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(indexSource, /network-resilience\.js\?v=20260807-circuit-breaker/);
  assert.match(distIndexSource, /network-resilience\.js\?v=20260807-circuit-breaker/);
  assert.match(bunkerFunctionSource, /Netlify-CDN-Cache-Control/);
  assert.match(bunkerFunctionSource, /stale-while-revalidate=86400/);
  assert.match(bunkerFunctionSource, /SCRAPER_API_URL/);
  assert.match(bunkerFunctionSource, /export const handler = async \(event, context\)/);
  assert.doesNotMatch(bunkerFunctionSource, /export default/);
  assert.match(bunkerFunctionSource, /statusCode: status/);
  assert.match(bunkerFunctionSource, /\.tablePrices1-div > table\.tablePrices1/);
  assert.match(bunkerFunctionSource, /a\[href\$=\"indices\/world\.php\"\]/);
  assert.match(bunkerFunctionSource, /Error extrayendo Bunkers/);
  assert.match(packageSource, /"cheerio": "\^1\.2\.0"/);
  assert.match(netlifyConfigSource, /functions = "netlify\/functions"/);
  assert.match(netlifyConfigSource, /to = "\/\.netlify\/functions\/get-bunker-prices"/);
  assert.match(indexSource, /updateBunkerIndexErrorLabel\('Error extrayendo Bunkers'\)/);
  assert.match(distIndexSource, /updateBunkerIndexErrorLabel\('Error extrayendo Bunkers'\)/);
  assert.doesNotMatch(indexSource, /vlsfo:\s*840\.00/);
  assert.doesNotMatch(distIndexSource, /vlsfo:\s*840\.00/);
  assert.match(globeSource, /function isRenderableVesselPoint\(vessel\)/);
  assert.match(globeSource, /renderVesselLayer\(view, previousVessels\)/);
  assert.match(globeSource, /status: view\.vessels\.length > 0 \? 'rendered' : 'empty-safe'/);
});
