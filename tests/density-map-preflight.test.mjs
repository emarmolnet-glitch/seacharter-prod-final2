import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('density has no matching-cache preflight or OpenShips fallback', () => {
  assert.doesNotMatch(source, /getCachedMatchingResultsForPreflight|runDensityMapPreflightChecklist|restoreMatchingViewFromGlobalFleet/);
  const start = source.indexOf('function getDensityReactiveVessels()');
  const end = source.indexOf('window.getDensityReactiveVessels', start);
  assert.doesNotMatch(source.slice(start, end), /openShipsVesselsCache|backgroundAisData/);
});

test('density mount renders the canonical matching snapshot directly', () => {
  const switchStart = source.indexOf('function switchTab(tabId)');
  const switchEnd = source.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  assert.match(switchSource, /renderDensitySnapshotFromGlobalStore/);
  assert.doesNotMatch(switchSource, /fetch\s*\(|updateOpenShipsRadar/);
  assert.match(source, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*renderDensityVesselsTable\?\.\(matchingVessels\)/);
});

test('matching cards remain sourced from the local matching response state', () => {
  assert.match(source, /window\.matchingResultsState = \{[\s\S]*source: matchingRequest\?\.endpoint \|\| '\/api\/matching-local'/);
  assert.doesNotMatch(source, /source: 'global-matching-fleet-restore'/);
  assert.match(source, /class="matching-vessel-card[^\n]*data-matching-result-card="true"/);
});
