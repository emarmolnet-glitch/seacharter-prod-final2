import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('resetTotalEstimation clears evaluated vessel cache and global fleet states', () => {
  const resetStart = indexSource.indexOf('function resetTotalEstimation');
  const resetEnd = indexSource.indexOf('window.resetTotalEstimation = resetTotalEstimation;', resetStart);
  const resetSource = indexSource.slice(resetStart, resetEnd);

  assert.ok(resetStart >= 0 && resetEnd > resetStart, 'resetTotalEstimation function must exist');

  // Verify call to AIS density reset
  assert.match(resetSource, /forceResetAisDensityResults\(\)|resetAisDensityResults/);

  // Verify GlobalStore fleet resets
  assert.match(resetSource, /window\.GlobalStore\.setMatchingFleet\?\.\(\[\], \{ source: 'reset-estimation', allowClear: true \}\)/);
  assert.match(resetSource, /window\.GlobalStore\.compatibleVessels = \[\]/);
  assert.match(resetSource, /window\.GlobalStore\.nearbyVessels = \[\]/);
  assert.match(resetSource, /window\.GlobalStore\.filteredVessels = \[\]/);
  assert.match(resetSource, /window\.GlobalStore\.matchingReady = false/);
  assert.match(resetSource, /setAisMatchingState\(\[\], \[\], null, \{ source: 'reset-estimation' \}\)/);

  // Verify global window variable resets
  assert.match(resetSource, /window\.matchingResultsState = \{ vessels: \[\], count: 0/);
  assert.match(resetSource, /window\.lastMatchingEngineResults = \[\]/);
  assert.match(resetSource, /window\.lastClassifiedVessels = \[\]/);
  assert.match(resetSource, /window\.lastRenderedAisAuditVessels = \[\]/);
  assert.match(resetSource, /window\.aisMatchingCache = \[\]/);
  assert.match(resetSource, /window\.buquesAlmacenados\.clear\(\)/);

  // Verify UI counters and matching panel resets
  assert.match(resetSource, /renderFilteredAisCounters\(\[\]\)/);
  assert.match(resetSource, /renderAisNearbyCount\(0\)/);
  assert.match(resetSource, /updateSequentialTelemetryBlock\('matching-fleet-status-block', 'pending'/);
  assert.match(resetSource, /document\.getElementById\('matching-results-list'\)/);
  assert.match(resetSource, /resultsList\.innerHTML = ''/);
  assert.match(resetSource, /document\.getElementById\('match-results-badge'\)/);
  assert.match(resetSource, /document\.getElementById\('btn-run-matching'\)/);
  assert.match(resetSource, /syncMatchingButtonWithCachedResults\(0\)/);
  assert.match(resetSource, /technicalToggleStatus\.textContent = '0 advertencias técnicas'/);
});
