import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const densityStart = source.indexOf('function getDensityMapSourceVessels()');
const densityEnd = source.indexOf('function syncDensityActiveVessel', densityStart);
const densitySource = source.slice(densityStart, densityEnd);
const loaderStart = source.indexOf('window.loadValidatedAisDensityVessels = async function');
const loaderEnd = source.indexOf('window.runInitialAisRadarLoad', loaderStart);
const loaderSource = source.slice(loaderStart, loaderEnd);
const calculatorStart = source.indexOf('function calculateAndDisplayAisFreight()');
const calculatorEnd = source.indexOf('window.applyAisFreightOptionToEstimator', calculatorStart);
const calculatorSource = source.slice(calculatorStart, calculatorEnd);
const markerStart = source.indexOf('function updateAisMarkers()');
const markerEnd = source.indexOf('const globalOpportunitiesState', markerStart);
const markerSource = source.slice(markerStart, markerEnd);

test('analytical AIS and visual fleet use separate state containers', () => {
  assert.match(source, /window\.backgroundAisData = \[\]/);
  assert.match(source, /window\.renderFleet = \[\]/);
  assert.match(source, /window\.setBackgroundAisData = function/);
  assert.match(source, /window\.setRenderFleet = function/);
});

test('fair-freight loader preserves its network call without mutating visual stores', () => {
  assert.match(loaderSource, /await fetch\(endpoint/);
  assert.match(loaderSource, /window\.setBackgroundAisData\(validatedVessels\)/);
  assert.match(loaderSource, /ais:background-data-updated/);
  assert.doesNotMatch(loaderSource, /GlobalStore\.(rawVessels|vessels)\s*=/);
  assert.doesNotMatch(loaderSource, /ais:vessels-updated/);
});

test('commercial OpenShips funnel commits one displayVessels snapshot into renderFleet', () => {
  assert.match(densitySource, /window\.useCommercialFilter\(sourceVessels/);
  assert.match(densitySource, /capacityTolerance: 1\.05/);
  assert.match(source, /const displayVessels = isGlobalDebugActive \? filteredVessels : rawVessels/);
  assert.match(densitySource, /return window\.setRenderFleet\(displayVessels\)/);
  assert.doesNotMatch(densitySource, /backgroundAisData/);
});

test('GlobalFleetGlobe receives only the OpenShips visual fleet and never backgroundAisData', () => {
  assert.match(source, /const displayVessels = densityPolCoordinates[\s\S]*vesselsData: displayVessels/);
  assert.match(markerSource, /const displayVessels = getDensityDisplayVessels\(\)/);
  assert.match(markerSource, /window\.GlobalFleetGlobe\.updateVessels\(displayVessels, 'density'\)/);
  assert.doesNotMatch(markerSource, /backgroundAisData/);
});

test('fair-freight calculations prefer background AIS while density uses displayVessels', () => {
  assert.match(calculatorSource, /const sourceAisVessels = backgroundAisData\.length > 0[\s\S]*\? backgroundAisData/);
  assert.match(calculatorSource, /const pricingSourceVessels = backgroundAisData\.length > 0[\s\S]*\? backgroundAisData/);
  assert.match(source, /window\.renderFilteredAisCounters = function[\s\S]*const displayVessels = Array\.isArray\(vesselsInput\)[\s\S]*const filteredCount = displayVessels\.length/);
});
