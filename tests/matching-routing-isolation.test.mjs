import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('routing slice wins over calculator defaults when resolving matching geography', () => {
  const helperStart = source.indexOf('function isValidMatchingCoordinatePair');
  const helperEnd = source.indexOf('window.getActiveMatchingRoutingRoute = getActiveMatchingRoutingRoute;', helperStart)
    + 'window.getActiveMatchingRoutingRoute = getActiveMatchingRoutingRoute;'.length;
  const helperSource = source.slice(helperStart, helperEnd);
  const windowMock = {
    GlobalStore: {
      pol: 'POL',
      pod: 'POD',
      polCoordinates: null,
      podCoordinates: null,
      geopoliticalRoute: {
        pol: 'BEJAIA',
        pod: 'AVEIRO',
        laycan: '2026-08-10',
        pol_coordinates: { lat: 36.75, lon: 5.08 },
        pod_coordinates: { lat: 40.64, lon: -8.65 },
      },
    },
    SeaCharterStore: {
      getState: () => ({ pol: 'POL', pod: 'POD', polCoordinates: null, podCoordinates: null }),
    },
  };
  new Function('window', helperSource)(windowMock);

  const route = windowMock.getActiveMatchingRoutingRoute();

  assert.equal(route.pol, 'BEJAIA');
  assert.equal(route.pod, 'AVEIRO');
  assert.deepEqual(route.pol_coordinates, { lat: 36.75, lon: 5.08 });
  assert.deepEqual(route.pod_coordinates, { lat: 40.64, lon: -8.65 });
});

test('local telemetry reads matching state without applying calculator context', () => {
  const pendingStart = source.indexOf('function keepRadarSynchronizationPending');
  const pendingEnd = source.indexOf('window.keepRadarSynchronizationPending = keepRadarSynchronizationPending;', pendingStart);
  const pendingSource = source.slice(pendingStart, pendingEnd);
  const restoreStart = source.indexOf('function restoreMatchingSynchronizationFromCache');
  const restoreEnd = source.indexOf('window.restoreMatchingSynchronizationFromCache = restoreMatchingSynchronizationFromCache;', restoreStart);
  const restoreSource = source.slice(restoreStart, restoreEnd);

  assert.match(pendingSource, /fetchMatchingRequestFromGlobalStore\([\s\S]*\{ applyToContext: false, persist: false \}/);
  assert.match(pendingSource, /window\.getActiveMatchingCalculationState\?\.\(\)/);
  assert.match(pendingSource, /window\.syncMatchingRouteSummary\?\.\(activeCalculation\)/);
  assert.match(restoreSource, /window\.getActiveMatchingCalculationState\?\.\(\)/);
  assert.match(restoreSource, /window\.clearMatchingCandidateState\?\.\(\)/);
});

test('calculator synchronization cannot replace an active spatial route', () => {
  const syncStart = source.indexOf('function syncCalculatorAndMatching');
  const syncEnd = source.indexOf('// ============================================================================', syncStart);
  const syncSource = source.slice(syncStart, syncEnd);

  assert.match(syncSource, /const protectedRoutingRoute = window\.getActiveMatchingRoutingRoute\?\.\(\) \|\| null/);
  assert.match(syncSource, /if \(!protectedRoutingRoute\) \{[\s\S]*setInputValue\('match-load-lat', ''\)[\s\S]*setInputValue\('match-unload-lat', ''\)/);
  assert.match(syncSource, /const synchronizedRoute = protectedRoutingRoute \|\| getMatchingExecutionRouteOverride\(\)/);
});

test('matching execution preserves synchronization and sends routing coordinates to source matching', () => {
  const executionStart = source.indexOf('async function executeMatchingEngine');
  const executionEnd = source.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = source.slice(executionStart, executionEnd);

  assert.match(executionSource, /const preserveSynchronization = Boolean\(/);
  assert.match(executionSource, /preserveSynchronization\s*\n\s*\}\)/);
  assert.match(executionSource, /effectivePolCoordinates = effectiveRouteOverride\?\.pol_coordinates/);
  assert.match(executionSource, /effectivePodCoordinates = effectiveRouteOverride\?\.pod_coordinates/);
  assert.match(executionSource, /pol_coordinates: \{ lat: loadingPortLat, lon: loadingPortLon \}/);
  assert.match(executionSource, /pod_coordinates: \{ lat: unloadingPortLat, lon: unloadingPortLon \}/);
});
