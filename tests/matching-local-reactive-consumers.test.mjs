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
const markerSourceStart = source.indexOf('function updateAisMarkers()');
const markerSourceEnd = source.indexOf('function setActiveAisMarker', markerSourceStart);
const markerSource = source.slice(markerSourceStart, markerSourceEnd);

test('local matching unlocks calculator without external AIS sweep availability', () => {
  assert.match(calculatorSource, /hasCommittedMatchingState = \['density-filter', 'matching-validation'\]\.includes\(committedMatchingSource\)/);
  assert.match(calculatorSource, /const renderFleet = typeof getDensityMapSourceVessels === 'function'/);
  assert.match(calculatorSource, /const backgroundAisData = Array\.isArray\(window\.backgroundAisData\)/);
  assert.match(calculatorSource, /const hasAisData = window\.GlobalStore\?\.hasAisData === true \|\| hasCommittedMatchingState \|\| backgroundAisData\.length > 0 \|\| renderFleet\.length > 0/);
  assert.match(calculatorSource, /const shouldUseCommittedMatchingState = hasCommittedMatchingState/);
  assert.match(calculatorSource, /calculateAndDisplayAisFreight\(\);[\s\S]*source === 'matching-validation'/);
});

test('density map mounts from one mutually exclusive source with OpenShips priority', () => {
  assert.match(mapSource, /const openShipsData = firstDensityCollectionForOrigin\([\s\S]*'OPENSHIPS'\);[\s\S]*if \(openShipsData\.length > 0\) return window\.setRenderFleet\(openShipsData\)/);
  assert.match(mapSource, /const aisLiveData = firstDensityCollectionForOrigin\([\s\S]*'AIS_LIVE', true\);[\s\S]*if \(aisLiveData\.length > 0\) return window\.setRenderFleet\(aisLiveData\)/);
  assert.match(mapSource, /const dataBridgeData = firstDensityCollectionForOrigin\([\s\S]*'DATABRIDGE', true\);[\s\S]*if \(dataBridgeData\.length > 0\) return window\.setRenderFleet\(dataBridgeData\)/);
  assert.match(mapSource, /return window\.setRenderFleet\(\[\]\)/);
  assert.doesNotMatch(mapSource, /mergeDensityVesselSources/);
  assert.match(mapSource, /window\.exploratoryVesselsCache/);
  assert.match(mapSource, /window\.dataBridgeLocalCandidates/);
  assert.match(mapSource, /window\.dataBridgeGlobalCandidates/);
  assert.match(mapSource, /const openShipsData = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\);[\s\S]*vesselsData: openShipsData/);
  assert.match(markerSource, /function updateAisMarkers\(\) \{[\s\S]*const renderFleet = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\)/);
});

test('density initialization awaits the current OpenShips snapshot before mounting', () => {
  assert.match(mapSource, /async function ensureOpenShipsDensitySnapshot\(\)/);
  assert.match(mapSource, /window\.updateOpenShipsRadar\(\{ refreshGlobe: false \}\)/);
  assert.match(mapSource, /setTimeout\(async \(\) => \{[\s\S]*await ensureOpenShipsDensitySnapshot\(\);[\s\S]*const doMount/);
});

test('density globe restores the globally selected vessel without duplicating camera movement', () => {
  assert.match(mapSource, /function syncDensityActiveVessel\(vessels = getDensityMapSourceVessels\(\)\)/);
  assert.match(mapSource, /window\.GlobalFleetGlobe\.selectVessel\(activeVessel, 'density'\)/);
  assert.doesNotMatch(mapSource, /syncDensityActiveVessel[\s\S]*focusVessel\(activeVessel/);
});

test('globe selection uses the shared vessel state and flies to the active vessel', () => {
  const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
  assert.match(globeSource, /window\.selectShip\([\s\S]*vessel\.vesselName,[\s\S]*vessel\.mmsi,[\s\S]*vessel\.lat,[\s\S]*vessel\.lng/);
  assert.match(globeSource, /window\.addEventListener\('vessel-selection:changed'/);
  assert.match(globeSource, /focusActiveVessel\(activeVessel, 'density'\)/);
  assert.match(globeSource, /view\.globe\.pointOfView\(\{[\s\S]*lat: normalized\.lat,[\s\S]*lng: normalized\.lng,[\s\S]*altitude: 1\.2[\s\S]*\}, 1500\)/);
});

test('local matching refreshes mounted density map from the state event', () => {
  assert.match(calculatorSource, /if \(source === 'matching-validation'\) \{/);
  assert.match(calculatorSource, /event\.detail\.nearbyVessels[\s\S]*initAisMap\(\)[\s\S]*updateAisMarkers\(\)/);
});
