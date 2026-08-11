import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sliceSource(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('route, weather, and Radar requests stay idle until an explicit button click', () => {
  const portSelection = sliceSource('function selectUniversalPortSuggestion(input, result)', 'window.selectUniversalPortSuggestion = selectUniversalPortSuggestion;');
  const reactiveInputs = sliceSource('function bindReactiveRadarInputs()', 'window.bindReactiveRadarInputs = bindReactiveRadarInputs;');
  const dataBridgeReady = sliceSource("document.addEventListener('DOMContentLoaded', async () => {", "window.addEventListener('message'");

  assert.doesNotMatch(portSelection, /autoCalculateDistances|calculateVoyageRouteService|fetchMarineWeatherForRoute/);
  assert.doesNotMatch(reactiveInputs, /addEventListener|scheduleAisMatchingRefresh|executeMatchingRadarSweep/);
  assert.doesNotMatch(dataBridgeReady, /restorePersistentDataBridgeConnection|startDataBridgeHttpPolling|updateOpenShipsRadar/);
  assert.match(source, /id="btn-map-locate-route" onclick="runOnDemandMapRouteWorkflow\(this\)"/);
  const manualRoute = sliceSource('async function runOnDemandMapRouteWorkflow(button)', 'window.runOnDemandMapRouteWorkflow = runOnDemandMapRouteWorkflow;');
  assert.match(manualRoute, /map-port-pol[\s\S]*map-port-pod/);
  assert.match(manualRoute, /calculateVoyageRouteService\(\{ portBallast, pol, pod, geocode: true \}\)/);
  assert.match(manualRoute, /applyRouteServiceResult\(routeResult\)[\s\S]*renderMasterRouteMap\(routeResult\)[\s\S]*updateRouteSummary\(\)/);
  assert.match(manualRoute, /finally \{[\s\S]*button\.disabled = false[\s\S]*button\.removeAttribute\('aria-busy'\)[\s\S]*button\.innerHTML = originalContent/);
  assert.match(manualRoute, /void Promise\.allSettled\(\[[\s\S]*restorePersistentDataBridgeConnection\(\)[\s\S]*refreshDataBridgeMasterStatsOnDemand\(\)/);
  assert.match(source, /host\.querySelector\('\[data-radar-global-button\]'\)\?\.addEventListener\('click',[\s\S]*window\.executeMatchingRadarSweep\?\.\(\{ trigger: 'user' \}\)/);
  assert.match(source, /window\.startOpenShipsRadarPolling = startOpenShipsRadarPolling;[\s\S]*stopOpenShipsRadarPolling\(\)/);
});

test('switchTab performs UI navigation without network, polling, calculation, or state resets', () => {
  const switchSource = sliceSource('function switchTab(tabId)', 'function closeMobileSessionMenu()');

  assert.match(switchSource, /classList\.toggle\('hidden', !isActiveView\)/);
  assert.match(switchSource, /renderDensitySnapshotFromGlobalStore/);
  assert.doesNotMatch(switchSource, /fetch\s*\(|updateOpenShipsRadar|startDataBridgeHttpPolling|syncDataBridgeRadarTransport|calculateAndDisplayAisFreight|runDensityMapPreflightChecklist|autoCalculateDistances|runEngine|clearRadarSnapshot|resetAisDensityResults|setMatchingFleet/);
  assert.match(source, /function getDensityReactiveVessels\(\)[\s\S]*Array\.isArray\(window\.GlobalStore\?\.matchingVessels\)[\s\S]*window\.GlobalStore\.matchingVessels/);
  assert.match(source, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*const count = matchingVessels\.length[\s\S]*densityCount\.textContent = String\(count\)/);
});
