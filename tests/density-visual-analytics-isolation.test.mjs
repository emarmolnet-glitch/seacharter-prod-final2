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

test('density loader reads the canonical fleet without network or secondary stores', () => {
  assert.match(loaderSource, /GlobalStore\?\.getCanonicalFleet/);
  assert.match(loaderSource, /renderDensitySnapshotFromGlobalStore/);
  assert.doesNotMatch(loaderSource, /fetch\s*\(|setBackgroundAisData|backgroundAisData/);
});

test('commercial OpenShips funnel commits one displayVessels snapshot into renderFleet', () => {
  assert.match(densitySource, /const densityVessels = getDensityReactiveVessels\(\)/);
  assert.match(densitySource, /return window\.setRenderFleet\(densityVessels\)/);
  assert.doesNotMatch(densitySource, /openShipsVesselsCache|backgroundAisData|rawVessels|filteredVessels/);
});

test('GlobalFleetGlobe receives only the OpenShips visual fleet and never backgroundAisData', () => {
  assert.match(source, /const displayVessels = getDensityMapSourceVessels\(\);[\s\S]*vesselsData: displayVessels/);
  assert.match(source, /function getDensityReactiveVessels\(\)[\s\S]*window\.GlobalStore\.matchingVessels/);
  assert.match(markerSource, /const displayVessels = getDensityDisplayVessels\(\)/);
  assert.match(markerSource, /window\.GlobalFleetGlobe\.updateVessels\(displayVessels, 'density'\)/);
  assert.doesNotMatch(markerSource, /backgroundAisData/);
});

test('fair-freight calculations prefer background AIS while density uses displayVessels', () => {
  assert.match(calculatorSource, /const renderFleet = typeof getDensityMapSourceVessels === 'function'/);
  assert.match(calculatorSource, /const sourceAisVessels = renderFleet/);
  assert.match(calculatorSource, /const pricingSourceVessels = renderFleet/);
  assert.match(calculatorSource, /let nearbyVessels = renderFleet\.slice\(\)/);
  assert.doesNotMatch(calculatorSource, /backgroundAisData/);
});
