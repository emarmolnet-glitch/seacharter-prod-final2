import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

  assert.match(clickSource, /fetchMatchingRequestFromGlobalStore\(calculatedState\)/);
  assert.ok(clickSource.indexOf('fetchMatchingRequestFromGlobalStore') < clickSource.indexOf('getMatchingExecutionValidation'));
  assert.match(source, /function applyMatchingRequestToContext\(request\)/);
  assert.match(source, /setInputValue\('match-cargo-type', request\.cargo\?\.type\)/);
  assert.match(source, /setInputValue\('match-quantity', request\.cargo\?\.quantity\)/);
  assert.match(executionSource, /const matchingRequest = typeof window\.fetchMatchingRequestFromGlobalStore/);
  assert.match(executionSource, /const effectiveRouteOverride = routeOverride \|\| matchingRequest\?\.route \|\| null/);
  assert.match(executionSource, /source: matchingRequest\?\.endpoint \|\| '\/api\/matching-local'/);
  assert.doesNotMatch(executionSource, /source: matchingRequest\.endpoint/);
});

test('matching button remains available when calculator context exists without radar readiness', () => {
  const observerStart = source.indexOf("window.addEventListener('PIPELINE_STATE_CHANGED'");
  const observerEnd = source.indexOf('function applyMatchingVesselToCalculator', observerStart);
  const observerSource = source.slice(observerStart, observerEnd);

  assert.match(observerSource, /const hasMatchingRequest = Boolean\(/);
  assert.match(observerSource, /const executionReady = dataReady \|\| hasMatchingRequest/);
  assert.match(observerSource, /button\.disabled = !executionReady/);
});
