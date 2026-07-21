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
  assert.match(source, /new CustomEvent\('MATCHING_EXECUTION_SUCCESS', \{[\s\S]*matches: window\.matchingResultsState\?\.vessels \|\| matches,[\s\S]*eligibleMatches: window\.matchingResultsState\?\.eligibleVessels \|\| viableMatches,[\s\S]*count: window\.matchingResultsState\?\.eligibleCount \|\| viableMatches\.length,[\s\S]*evaluatedCount: window\.matchingResultsState\?\.count \|\| matches\.length/);
  assert.match(source, /window\.addEventListener\('MATCHING_EXECUTION_SUCCESS'/);
});

test('successful matching commits only eligible vessels to the calculator store', () => {
  assert.match(source, /const eligibleMatches = Array\.isArray\(event\?\.detail\?\.eligibleMatches\)[\s\S]*matches\.filter\(match => match\?\.audit\?\.operationallyEligible === true\)/);
  assert.match(source, /const committedEligibleVessels = eligibleMatches\.map\(\(match, index\) => \{[\s\S]*normalizeCoreProVesselCoordinates\(match, index\)/);
  assert.match(source, /setAisMatchingState\?\.\(committedEligibleVessels, committedEligibleVessels, null,[\s\S]*source: 'matching-validation'/);
  assert.match(source, /evaluateReactiveSyncStatus\(\{ matchingCount: committedEligibleVessels\.length \}\)/);
});

test('Data Bridge synchronization consumes a confirmed POST response', () => {
  const helperStart = source.indexOf('async function requestDataBridgeReadSync');
  const helperEnd = source.indexOf('window.requestDataBridgeReadSync', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  assert.match(helperSource, /confirmedPayload\?\.success === true/);
  assert.match(helperSource, /confirmation: confirmedPayload/);
  assert.match(helperSource, /new URL\('\/api\/core-pro-frozen-report'/);
  assert.doesNotMatch(helperSource, /databridge-core-pro-sync/);
});
