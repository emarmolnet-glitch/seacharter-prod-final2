import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching status panel includes a hidden success stick bound to a result count', () => {
  assert.match(source, /id="matching-execution-success-stick"[^>]*data-telemetry-state="pending"[^>]*data-matching-result-count="0"/);
  assert.match(source, /<strong>Coincidencia<\/strong>/);
  assert.match(source, /id="matching-execution-success-count"/);
});

test('success stick uses the same matching result array as the vessel counter', () => {
  assert.match(source, /function updateMatchingExecutionSuccessStick\(matches\)/);
  assert.match(source, /const vessels = Array\.isArray\(matches\) \? matches : \[\]/);
  assert.match(source, /stick\.dataset\.matchingResultCount = String\(vessels\.length\)/);
  assert.match(source, /updateSequentialTelemetryBlock\([\s\S]*'matching-execution-success-stick',[\s\S]*vessels\.length > 0 \? 'success' : 'pending'/);
  assert.match(source, /window\.matchingResultsState\?\.vessels \|\| matches/);
});

test('successful matching dispatches the visual event and empty runs clear the stick', () => {
  assert.match(source, /updateMatchingExecutionSuccessStick\(\[\]\);/);
  assert.match(source, /new CustomEvent\('MATCHING_EXECUTION_SUCCESS', \{[\s\S]*matches: window\.matchingResultsState\?\.vessels \|\| matches,[\s\S]*count: window\.matchingResultsState\?\.count \|\| matches\.length/);
  assert.match(source, /window\.addEventListener\('MATCHING_EXECUTION_SUCCESS'/);
});

test('Data Bridge synchronization performs a payload-free read request', () => {
  const helperStart = source.indexOf('async function requestDataBridgeReadSync');
  const helperEnd = source.indexOf('window.requestDataBridgeReadSync', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  assert.match(helperSource, /fetch\('\/api\/databridge-core-pro-sync', \{/);
  assert.match(helperSource, /method: 'GET'/);
  assert.doesNotMatch(helperSource, /body:|JSON\.stringify|vessels/);
  assert.match(helperSource, /const visualSyncSucceeded = response\.status === 200/);
});
