import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const calculationStateSource = await readFile(new URL('../netlify/functions/calculation-state.ts', import.meta.url), 'utf8');

test('CALCULATION_EVENT injects a session-scoped CalculatedState before persistence', () => {
  const listenerStart = source.indexOf("window.addEventListener('CALCULATION_EVENT'");
  const listenerEnd = source.indexOf("window.addEventListener('RADAR_LIVE_BATCH_READY'", listenerStart);
  const listenerSource = source.slice(listenerStart, listenerEnd);

  assert.match(source, /PIPELINE_SESSION_ID_STORAGE_KEY = 'seacharter_pipeline_session_id'/);
  assert.match(source, /CALCULATED_STATE_STORAGE_KEY = 'seacharter_calculated_state_v1'/);
  assert.match(source, /MATCHING_REQUEST_STORAGE_KEY = 'seacharter_matching_request_v1'/);
  assert.match(source, /function injectCalculatedState\(calculation\)/);
  assert.match(listenerSource, /const calculation = injectCalculatedState\(event\?\.detail \|\| \{\}\)/);
  assert.ok(listenerSource.indexOf('injectCalculatedState') < listenerSource.indexOf('await persistCalculationEvent'));
  assert.match(source, /window\.GlobalStore\.calculatedState = calculatedState/);
  assert.match(source, /window\.GlobalStore\.calculationSessionId = session\.sessionId/);
});

test('local matching click reads calculation context without replacing the active route', () => {
  const clickStart = source.indexOf('async function handleMatchingExecutionClick');
  const clickEnd = source.indexOf('window.handleMatchingExecutionClick = handleMatchingExecutionClick;', clickStart);
  const clickSource = source.slice(clickStart, clickEnd);

  assert.match(clickSource, /const capturedRoute = getMatchingExecutionRouteOverride\(routeOverride\)/);
  assert.match(clickSource, /await window\.rehydrateCalculatedState\(\{ applyToContext: false \}\)/);
  assert.match(clickSource, /window\.fetchMatchingRequestFromGlobalStore\(calculatedState, \{ applyToContext: false, persist: false \}\)/);
  assert.match(clickSource, /window\.hasCurrentSessionMatchingCache\(\)/);
  assert.match(clickSource, /enforceLocalOnlyMatchingMode\(\{ preserveSynchronization: Boolean\(matchingRequest \|\| \(calculatedState && hasSessionCache\)\) \}\)/);
  assert.ok(clickSource.indexOf('rehydrateCalculatedState') < clickSource.indexOf('enforceLocalOnlyMatchingMode'));
});

test('current-session matching cache prevents synchronization and AIS resets', () => {
  assert.match(source, /function hasCurrentSessionMatchingCache\(\)/);
  assert.match(source, /const cachedFleet = Array\.isArray\(cacheState\.vessels\)[\s\S]*: globalFleet/);
  assert.match(source, /const cachedSessionId = String\(cacheState\.sessionId \|\| window\.GlobalStore\?\.matchingCacheSessionId \|\| ''\)\.trim\(\)/);
  assert.match(source, /cachedSessionId === session\.sessionId/);
  assert.match(source, /cachedCalculationId === currentCalculationId/);
  assert.doesNotMatch(source, /cacheState\.sessionId = session\.sessionId/);
  assert.match(source, /previousCalculationIdentity !== nextCalculationIdentity[\s\S]*clearMatchingCandidateState\(\)/);
  assert.match(source, /function enforceLocalOnlyMatchingMode\(options = \{\}\)/);
  assert.match(source, /!preserveSynchronization && typeof window\.keepRadarSynchronizationPending/);
  assert.match(source, /restoreMatchingSynchronizationFromCache/);
  assert.match(source, /window\.resetAisDensityResults = function\(options = \{\}\)/);
  assert.match(source, /if \(!manualReset && hasSessionCache\)/);
  assert.match(source, /window\.forceResetAisDensityResults/);
});

test('empty local writes and route cleanup preserve the persistent global fleet', () => {
  assert.match(source, /function clearMatchingCandidateState\(\)[\s\S]*persistentFleet\.length > 0[\s\S]*restoreMatchingViewFromGlobalFleet\?\.\(\{ source: 'candidate-clear-guard' \}\)/);
  assert.match(source, /function showMatchingEmptyState\(\)[\s\S]*persistentFleet\.length > 0[\s\S]*restoreMatchingViewFromGlobalFleet\?\.\(\{ source: 'empty-state-guard' \}\)/);
  assert.match(source, /window\.setRenderedMatchingVessels\?\.\(\[\], \{ source: 'matching-empty' \}\)/);
  assert.match(source, /function setRenderedMatchingVessels\(vessels, metadata = \{\}\)[\s\S]*const canonicalVessels = window\.GlobalStore\?\.setMatchingFleet/);
});

test('matching tab entry rehydrates its table from the canonical global fleet', () => {
  assert.match(source, /function restoreMatchingViewFromGlobalFleet\(options = \{\}\)/);
  assert.match(source, /window\.matchingResultsState = \{[\s\S]*vessels: persistentFleet\.slice\(\)/);
  assert.match(source, /renderCachedMatchingResults\(persistentFleet, \{[\s\S]*executionState: 'global-store-restored'/);
  assert.match(source, /window\.addEventListener\('radar-fleet-updated',[\s\S]*source: 'radar-fleet-event'/);
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf('function closeMobileSessionMenu()', switchStart);
  assert.doesNotMatch(source.slice(switchStart, switchEnd), /restoreMatchingViewFromGlobalFleet/);
});

test('calculation state endpoint supports rehydration reads without a new migration', () => {
  assert.match(calculationStateSource, /createCorsHeaders\(req, "GET, POST, OPTIONS"\)/);
  assert.match(calculationStateSource, /req\.method === "GET"/);
  assert.match(calculationStateSource, /\.from\(appConfig\)/);
  assert.match(calculationStateSource, /calculation,/);
});
