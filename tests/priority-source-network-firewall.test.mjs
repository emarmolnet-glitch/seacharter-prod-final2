import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, mapLoaderSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../map_loader.js', import.meta.url), 'utf8'),
]);

function sliceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('OpenShips priority blocks secondary sources while loading and after hydration', () => {
  assert.match(indexSource, /window\.shouldBlockSecondaryFleetSources = function\(\) \{[\s\S]*window\.hasPriorityOpenShipsData\(\) \|\| window\.openShipsInitialReadCompleted !== true/);
  assert.match(indexSource, /window\.stopSecondaryFleetPolling = function[\s\S]*stopAisRadarPolling[\s\S]*stopAisProxyPolling[\s\S]*detenerFallbackRadar[\s\S]*stopDataBridgeSecondaryTransport/);
  assert.match(indexSource, /window\.openShipsVesselsCache\.length > 0[\s\S]*window\.stopSecondaryFleetPolling\?\.\('openships-snapshot-loaded'\)/);
});

test('visual AIS pollers remain blocked while the fair-freight loader stays analytical', () => {
  const densityLoader = sliceFunction(indexSource, 'window.loadValidatedAisDensityVessels = async function', 'window.runInitialAisRadarLoad');
  const dualSweep = sliceFunction(indexSource, 'window.ejecutarRadarDualAIS = async function', 'window.reiniciarMemoriaBarridoAIS');

  assert.match(densityLoader, /await fetch\(endpoint/);
  assert.match(densityLoader, /window\.setBackgroundAisData\(validatedVessels\)/);
  assert.match(densityLoader, /new CustomEvent\('ais:background-data-updated'/);
  assert.doesNotMatch(densityLoader, /window\.GlobalStore\.rawVessels = validatedVessels/);
  assert.doesNotMatch(densityLoader, /new CustomEvent\('ais:vessels-updated'/);

  const openShipsRead = dualSweep.indexOf("await window.updateOpenShipsRadar({ refreshGlobe: false })");
  const priorityReturn = dualSweep.indexOf('window.hasPriorityOpenShipsData?.()');
  const firstFetch = dualSweep.indexOf('fetch(');
  assert.ok(openShipsRead >= 0 && priorityReturn > openShipsRead);
  assert.ok(firstFetch === -1 || priorityReturn < firstFetch);

  const aisClient = sliceFunction(indexSource, 'window.startAisClientEngine = function', 'function scheduleAisZoneRefresh');
  assert.match(aisClient, /window\.shouldBlockSecondaryFleetSources\?\.\(\)[\s\S]*openships-priority-pending/);

  const zoneSearch = sliceFunction(indexSource, 'async function runAisZoneSearch', 'window.RadarPOL');
  assert.ok(zoneSearch.indexOf('window.hasPriorityOpenShipsData?.()') < zoneSearch.indexOf('fetch(endpoint'));

  const exceptionalSweep = sliceFunction(indexSource, 'window.ejecutarBarridoExploratorioExcepcional = function', 'window.addEventListener(\'DOMContentLoaded\'');
  assert.ok(exceptionalSweep.indexOf('window.shouldBlockSecondaryFleetSources?.()') < exceptionalSweep.indexOf('fetch(endpoint'));
});

test('AIS proxy polling short-circuits before every fetch and interval', () => {
  const pollSource = sliceFunction(mapLoaderSource, 'function pollAisProxyOnce', 'function startAisProxyPolling');
  const startSource = sliceFunction(mapLoaderSource, 'function startAisProxyPolling', 'function stopAisProxyPolling');
  assert.ok(pollSource.indexOf('window.shouldBlockSecondaryFleetSources?.()') < pollSource.indexOf('fetch(finalUrl'));
  assert.match(startSource, /window\.shouldBlockSecondaryFleetSources\?\.\(\)[\s\S]*stopAisProxyPolling\(\)[\s\S]*return \{ started: false/);
});

test('Data Bridge route-position disables only its HTTP polling after a session 404', () => {
  const pollSource = sliceFunction(indexSource, 'async function pollDataBridgeRoutePosition()', 'function startDataBridgeHttpPolling()');
  const startSource = sliceFunction(indexSource, 'function startDataBridgeHttpPolling()', 'function stopDataBridgeHttpPolling()');
  assert.match(pollSource, /dataBridgeRoutePositionDisabledForSession \|\| window\.shouldBlockSecondaryFleetSources\?\.\(\)/);
  assert.match(pollSource, /if \(response\.status === 404\) \{[\s\S]*dataBridgeRoutePositionDisabledForSession = true[\s\S]*sessionStorage\.setItem\(DATA_BRIDGE_ROUTE_POSITION_DISABLED_SESSION_KEY, '1'\)[\s\S]*stopDataBridgeHttpPolling\(\)[\s\S]*return null/);
  assert.match(startSource, /route-position-404-session-backoff/);
  const notFoundBranch = pollSource.slice(pollSource.indexOf('if (response.status === 404)'), pollSource.indexOf('if (!response.ok)'));
  assert.doesNotMatch(notFoundBranch, /console\.(warn|error)/);
});

test('Data Bridge startup waits for the initial OpenShips request', () => {
  const domReady = sliceFunction(indexSource, "document.addEventListener('DOMContentLoaded', async () => {", "window.addEventListener('message'",);
  const openShipsRead = domReady.indexOf("await window.updateOpenShipsRadar({ refreshGlobe: false })");
  const dataBridgeStart = domReady.indexOf('startDataBridgeHttpPolling()');
  assert.ok(openShipsRead >= 0 && dataBridgeStart > openShipsRead);
  assert.match(domReady, /window\.hasPriorityOpenShipsData\?\.\(\)[\s\S]*window\.stopSecondaryFleetPolling/);
});
