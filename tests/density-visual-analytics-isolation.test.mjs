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
  assert.match(source, /window\.backgroundAisData = Array\.isArray\(window\.backgroundAisData\)/);
  assert.match(source, /window\.renderFleet = Array\.isArray\(window\.renderFleet\)/);
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

test('priority cascade commits only its winning source into renderFleet', () => {
  assert.match(densitySource, /if \(openShipsData\.length > 0\) return window\.setRenderFleet\(openShipsData\)/);
  assert.match(densitySource, /if \(aisLiveData\.length > 0\) return window\.setRenderFleet\(aisLiveData\)/);
  assert.match(densitySource, /if \(dataBridgeData\.length > 0\) return window\.setRenderFleet\(dataBridgeData\)/);
  assert.doesNotMatch(densitySource, /backgroundAisData/);
});

test('GlobalFleetGlobe receives only the OpenShips visual fleet and never backgroundAisData', () => {
  assert.match(source, /const openShipsData = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\);[\s\S]*vesselsData: openShipsData/);
  assert.match(markerSource, /const renderFleet = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\)/);
  assert.match(markerSource, /window\.GlobalFleetGlobe\.updateVessels\(window\.renderFleet, 'density'\)/);
  assert.doesNotMatch(markerSource, /backgroundAisData/);
});

test('fair-freight calculations prefer background AIS while the density counter uses renderFleet', () => {
  assert.match(calculatorSource, /const sourceAisVessels = backgroundAisData\.length > 0[\s\S]*\? backgroundAisData/);
  assert.match(calculatorSource, /const pricingSourceVessels = backgroundAisData\.length > 0[\s\S]*\? backgroundAisData/);
  assert.match(source, /window\.renderFilteredAisCounters = function[\s\S]*const renderFleet = Array\.isArray\(window\.renderFleet\)[\s\S]*const filteredCount = renderFleet\.length/);
});
