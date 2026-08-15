import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching request carries cancelling through canonical aliases and backend cargo payload', () => {
  const buildStart = source.indexOf('function buildMatchingRequest');
  const buildEnd = source.indexOf('window.buildMatchingRequest = buildMatchingRequest;', buildStart);
  const buildSource = source.slice(buildStart, buildEnd);
  const fetchStart = source.indexOf('function fetchMatchingRequestFromGlobalStore');
  const fetchEnd = source.indexOf('window.fetchMatchingRequestFromGlobalStore = fetchMatchingRequestFromGlobalStore;', fetchStart);
  const fetchSource = source.slice(fetchStart, fetchEnd);

  assert.match(buildSource, /laycan_end: voyageParams\.cancelling/);
  assert.match(buildSource, /laycanEnd: voyageParams\.cancelling/);
  assert.match(buildSource, /cargo: \{[\s\S]*laycanEnd: voyageParams\.cancelling/);
  assert.match(fetchSource, /calculatedState\?\.laycan_end/);
  assert.match(fetchSource, /laycanEnd: activeVoyage\.cancelling/);
});

test('calculator builds a complete matchingRequest before publishing CALCULATION_EVENT', () => {
  const builderStart = source.indexOf('function buildMatchingRequest');
  const builderEnd = source.indexOf('window.buildMatchingRequest = buildMatchingRequest;', builderStart);
  const builderSource = source.slice(builderStart, builderEnd);
  const triggerStart = source.indexOf('function handleFreightMasterTrigger');
  const triggerEnd = source.indexOf('window.handleFreightMasterTrigger = handleFreightMasterTrigger;', triggerStart);
  const triggerSource = source.slice(triggerStart, triggerEnd);

  assert.match(builderSource, /route: \{/);
  assert.match(builderSource, /laycan: \{/);
  assert.match(builderSource, /cargo: \{/);
  assert.match(builderSource, /pol_coordinates: \{ lat: Number\(polCoordinates\.lat\), lon: Number\(polCoordinates\.lon\) \}/);
  assert.match(builderSource, /pod_coordinates: \{ lat: Number\(podCoordinates\.lat\), lon: Number\(podCoordinates\.lon\) \}/);
  assert.match(builderSource, /freight: \{/);
  assert.match(builderSource, /dwt: Number\(state\.dwt\)/);
  assert.match(builderSource, /endpoint: '\/api\/matching-local'/);
  assert.ok(triggerSource.indexOf('persistMatchingRequest') < triggerSource.indexOf("new CustomEvent('CALCULATION_EVENT'"));
});

test('matchingRequest persists in global state and session storage', () => {
  const persistStart = source.indexOf('function persistMatchingRequest');
  const persistEnd = source.indexOf('window.persistMatchingRequest = persistMatchingRequest;', persistStart);
  const persistSource = source.slice(persistStart, persistEnd);

  assert.match(source, /matchingRequest: null/);
  assert.match(persistSource, /window\.matchingRequest = matchingRequest/);
  assert.match(persistSource, /window\.GlobalStore\.matchingRequest = matchingRequest/);
  assert.match(persistSource, /window\.sessionStorage\.setItem\(MATCHING_REQUEST_STORAGE_KEY/);
});

test('matching engine rehydrates matchingRequest before local validation and execution', () => {
  const clickStart = source.indexOf('async function handleMatchingExecutionClick');
  const clickEnd = source.indexOf('window.handleMatchingExecutionClick = handleMatchingExecutionClick;', clickStart);
  const clickSource = source.slice(clickStart, clickEnd);
  const executionStart = source.indexOf('async function executeMatchingEngine');
  const executionEnd = source.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = source.slice(executionStart, executionEnd);

  assert.match(clickSource, /fetchMatchingRequestFromGlobalStore\(calculatedState, \{ applyToContext: false, persist: false \}\)/);
  assert.match(clickSource, /rehydrateCalculatedState\(\{ applyToContext: false \}\)/);
  assert.ok(clickSource.indexOf('fetchMatchingRequestFromGlobalStore') < clickSource.indexOf('getMatchingExecutionValidation'));
  assert.match(source, /function applyMatchingRequestToContext\(request\)/);
  assert.match(source, /const normalizedCargo = normalizeMatchingCargoPayload\(request\.cargo\)/);
  assert.match(source, /setInputValue\('match-cargo-type', normalizedCargo\.cargoCode\)/);
  assert.match(source, /setInputValue\('match-quantity', request\.cargo\?\.quantity\)/);
  assert.match(executionSource, /const matchingRequest = typeof window\.fetchMatchingRequestFromGlobalStore/);
  assert.match(executionSource, /window\.syncMatchingViewFromGlobalOperationalState\?\.\(\{ persist: true \}\)/);
  assert.match(executionSource, /const voyageParams = getGlobalVoyageParams\(\)/);
  assert.match(executionSource, /const effectiveRouteOverride = \{[\s\S]*pol: voyageParams\.pol[\s\S]*pod: voyageParams\.pod/);
  const cargoSelectionSource = executionSource.slice(
    executionSource.indexOf('const matchingCargoType'),
    executionSource.indexOf('const matchingQuantity'),
  );
  assert.match(cargoSelectionSource, /voyageParams\.cargoTypeCode/);
  assert.match(executionSource, /const matchingQuantity = Number\(voyageParams\.cargoQuantity\)/);
  assert.match(executionSource, /const laycanStart = String\(voyageParams\.laydays \|\| ''\)/);
  assert.match(executionSource, /const laycanEnd = String\(voyageParams\.cancelling \|\| ''\)/);
  assert.doesNotMatch(executionSource, /fallbackLaycanEnd|todayIso/);
  assert.doesNotMatch(cargoSelectionSource, /'100'/);
  assert.match(executionSource, /source: matchingRequest\?\.endpoint \|\| '\/api\/matching-local'/);
  assert.doesNotMatch(executionSource, /source: matchingRequest\.endpoint/);
});

test('matching tab synchronizes live calculator state before radar initialization', () => {
  const syncStart = source.indexOf('function syncCalculatorAndMatching');
  const syncEnd = source.indexOf('window.syncMatchingViewFromGlobalOperationalState = syncMatchingViewFromGlobalOperationalState;', syncStart);
  const syncSource = source.slice(syncStart, syncEnd);
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = source.slice(switchStart, switchEnd);

  assert.match(syncSource, /function syncCalculatorAndMatching\(source, options = \{\}\)/);
  assert.match(syncSource, /const routeState = readRouteStateFromCalculator\(\)/);
  assert.match(syncSource, /const cargoState = readValidatedCargoOperationState\(\)/);
  assert.doesNotMatch(switchSource, /syncMatchingViewFromGlobalOperationalState|initializeMatchingGlobalTaxonomyControl|syncCalculatorAndMatching/);
});

test('matching button remains available when calculator context exists without radar readiness', () => {
  const observerStart = source.indexOf("window.addEventListener('PIPELINE_STATE_CHANGED'");
  const observerEnd = source.indexOf('function applyMatchingVesselToCalculator', observerStart);
  const observerSource = source.slice(observerStart, observerEnd);

  assert.match(observerSource, /const hasMatchingRequest = Boolean\(/);
  assert.match(observerSource, /const executionReady = dataReady \|\| hasMatchingRequest/);
  assert.match(observerSource, /button\.disabled = !executionReady/);
});
