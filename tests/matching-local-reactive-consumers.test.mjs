import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const calculatorStart = source.indexOf('function calculateAndDisplayAisFreight()');
const calculatorEnd = source.indexOf('window.applyAisFreightOptionToEstimator', calculatorStart);
const calculatorSource = source.slice(calculatorStart, calculatorEnd);

const mapSourceStart = source.indexOf('function getDensityMapSourceVessels()');
const mapSourceEnd = source.indexOf('function destroyAisMap()', mapSourceStart);
const mapSource = source.slice(mapSourceStart, mapSourceEnd);

test('local matching unlocks calculator without external AIS sweep availability', () => {
  assert.match(calculatorSource, /hasCommittedMatchingState = \['density-filter', 'matching-validation'\]\.includes\(committedMatchingSource\)/);
  assert.match(calculatorSource, /const hasAisData = window\.GlobalStore\?\.hasAisData === true \|\| hasCommittedMatchingState/);
  assert.match(calculatorSource, /const shouldUseCommittedMatchingState = hasCommittedMatchingState/);
  assert.match(calculatorSource, /calculateAndDisplayAisFreight\(\);[\s\S]*source === 'matching-validation'/);
});

test('density map mounts from committed local matching vessels', () => {
  assert.match(mapSource, /matchingSource === 'matching-validation'[\s\S]*store\.nearbyVessels\.slice\(\)/);
  assert.match(mapSource, /const vessels = getDensityMapSourceVessels\(\);[\s\S]*vesselsData: vessels/);
  assert.match(mapSource, /updateAisMarkers\(getDensityMapSourceVessels\(\)\)/);
});

test('local matching refreshes mounted density map from the state event', () => {
  assert.match(calculatorSource, /if \(source === 'matching-validation'\) \{/);
  assert.match(calculatorSource, /event\.detail\.nearbyVessels[\s\S]*initAisMap\(\)[\s\S]*updateAisMarkers\(densityMapVessels\)/);
});
