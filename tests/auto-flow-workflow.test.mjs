import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('CALCULATION_EVENT is the master trigger for persisted Auto-Flow', () => {
  const listenerStart = source.indexOf("window.addEventListener('CALCULATION_EVENT'");
  const listenerEnd = source.indexOf("window.addEventListener('RADAR_LIVE_BATCH_READY'", listenerStart);
  const listenerSource = source.slice(listenerStart, listenerEnd);

  assert.match(source, /function getAutoFlowReadiness\(routeOverride = null\)/);
  assert.match(listenerSource, /await persistCalculationEvent\(calculation\)/);
  assert.match(listenerSource, /refreshMatchingTaxonomySelectionState\(\{ force: true \}\)/);
  assert.match(listenerSource, /syncCalculatorAndMatching\('calculator'\)/);
  assert.match(listenerSource, /return queueAutoFlowFromTrip\(route\)/);
  assert.ok(listenerSource.indexOf('await persistCalculationEvent(calculation)') < listenerSource.indexOf('refreshMatchingTaxonomySelectionState'));
  assert.ok(listenerSource.indexOf('refreshMatchingTaxonomySelectionState') < listenerSource.indexOf("syncCalculatorAndMatching('calculator')"));
  assert.ok(listenerSource.indexOf("syncCalculatorAndMatching('calculator')") < listenerSource.indexOf('queueAutoFlowFromTrip(route)'));
});

test('route and calculation updates only refresh pending state before a master trigger', () => {
  assert.match(source, /window\.addEventListener\('SEA_ROUTE_DEFINED',[\s\S]*pendingRoute = event\?\.detail \|\| null/);
  assert.match(source, /window\.addEventListener\('AUTO_FLOW_CALCULATIONS_READY',[\s\S]*pendingCalculation = event\?\.detail \|\| null/);
});

test('Auto-Flow waits internally for complete trip data without rendering blocking errors', () => {
  const queueStart = source.indexOf('async function queueAutoFlowFromTrip');
  const queueEnd = source.indexOf('window.queueAutoFlowFromTrip = queueAutoFlowFromTrip;', queueStart);
  const queueSource = source.slice(queueStart, queueEnd);

  assert.match(queueSource, /getAutoFlowReadiness\(routeOverride\)/);
  assert.match(queueSource, /state\.phase = 'waiting-for-trip-data'/);
  assert.match(queueSource, /new CustomEvent\('AUTO_FLOW_WAITING'/);
  assert.doesNotMatch(queueSource, /renderMatchingExecutionValidation/);
  assert.match(source, /function clearAutoFlowBlockingFeedback\(\)/);
});

test('Radar LIVE publishes its first 500 vessels and updates reactive data readiness', () => {
  assert.match(source, /const AUTO_FLOW_RADAR_BATCH_SIZE = 500/);
  assert.match(source, /window\.startRadarLive = async function\(options = \{\}\)/);
  assert.match(source, /const firstBatch = vessels\.slice\(0, AUTO_FLOW_RADAR_BATCH_SIZE\)/);
  assert.match(source, /new CustomEvent\('RADAR_LIVE_BATCH_READY'/);
  assert.match(source, /window\.addEventListener\('RADAR_LIVE_BATCH_READY',[\s\S]*setAutoFlowDataReady\(true/);
  assert.match(source, /new CustomEvent\('PIPELINE_STATE_CHANGED'/);
});

test('matching observer enables the button and starts the engine when data_ready is true', () => {
  const observerStart = source.indexOf("window.addEventListener('PIPELINE_STATE_CHANGED'");
  const observerEnd = source.indexOf('function applyMatchingVesselToCalculator', observerStart);
  const observerSource = source.slice(observerStart, observerEnd);

  assert.match(observerSource, /const dataReady = event\?\.detail\?\.data_ready === true/);
  assert.match(observerSource, /const executionReady = dataReady \|\| hasMatchingRequest/);
  assert.match(observerSource, /button\.disabled = !executionReady/);
  assert.match(observerSource, /button\.setAttribute\('aria-disabled', String\(!executionReady\)\)/);
  assert.match(observerSource, /if \(!dataReady\) return/);
  assert.match(observerSource, /executeAutoFlowMatching\(event\)/);
  assert.match(source, /runMatchingEngine\(readiness\.route, \{ auto: true \}\)/);
});

test('automatic matching remains authorized and deduplicated while work is active', () => {
  assert.match(source, /MATCHING_AUTO_EXECUTION_TOKEN = Symbol\('matching-auto-execution'\)/);
  assert.match(source, /options\.manual !== true && options\.auto !== true/);
  assert.match(source, /state\.radarPromise \|\| state\.matchingPromise/);
  assert.match(source, /state\.lastRadarLoadedAt === radarLoadedAt/);
});
