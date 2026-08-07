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
const matchingFocusStart = source.indexOf('async function focusMatchingVesselOnMap');
const matchingFocusEnd = source.indexOf('window.focusMatchingVesselOnMap', matchingFocusStart);
const matchingFocusSource = source.slice(matchingFocusStart, matchingFocusEnd);
const densitySourceFunction = mapSource.slice(0, mapSource.indexOf('window.getDensityMapSourceVessels'));

function createDensitySourceResolver(store, openShipsVesselsCache, isolatedMassiveSources = {}) {
  const window = {
    GlobalStore: store,
    openShipsVesselsCache,
    ...isolatedMassiveSources,
    setRenderFleet(vessels) {
      this.renderFleet = vessels.slice();
      return this.renderFleet;
    },
  };
  const normalizeDensityVesselCollection = (vessels) => Array.isArray(vessels) ? vessels.filter(Boolean) : [];
  const resolver = new Function(
    'window',
    'normalizeDensityVesselCollection',
    `${densitySourceFunction}; return getDensityMapSourceVessels;`,
  )(window, normalizeDensityVesselCollection);
  return { resolver, window };
}

test('local matching unlocks calculator without external AIS sweep availability', () => {
  assert.match(calculatorSource, /hasCommittedMatchingState = \['density-filter', 'matching-validation'\]\.includes\(committedMatchingSource\)/);
  assert.match(calculatorSource, /const renderFleet = typeof getDensityMapSourceVessels === 'function'/);
  assert.match(calculatorSource, /const backgroundAisData = Array\.isArray\(window\.backgroundAisData\)/);
  assert.match(calculatorSource, /const hasAisData = window\.GlobalStore\?\.hasAisData === true \|\| hasCommittedMatchingState \|\| backgroundAisData\.length > 0 \|\| renderFleet\.length > 0/);
  assert.match(calculatorSource, /const shouldUseCommittedMatchingState = hasCommittedMatchingState/);
  assert.match(calculatorSource, /calculateAndDisplayAisFreight\(\);[\s\S]*source === 'matching-validation'/);
});

test('density map consumes the persistent commercial store without legacy fallbacks', () => {
  assert.match(mapSource, /const openShipsData = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\)/);
  assert.match(mapSource, /const persistedRawVessels = normalizeDensityVesselCollection\(store\?\.rawVessels\)/);
  assert.match(mapSource, /const predictiveMatchingVessels = normalizeDensityVesselCollection/);
  assert.match(mapSource, /const sourceVessels = normalizeDensityVesselCollection\(\[[\s\S]*\.\.\.persistedRawVessels,[\s\S]*\.\.\.openShipsData,[\s\S]*\.\.\.predictiveMatchingVessels/);
  assert.match(mapSource, /store\?\.setCommercialVesselState\?\.\(/);
  assert.match(mapSource, /window\.useCommercialFilter\(sourceVessels/);
  assert.match(source, /const displayVessels = isGlobalDebugActive \? filteredVessels : rawVessels/);
  assert.doesNotMatch(mapSource, /mergeDensityVesselSources/);
  assert.doesNotMatch(mapSource, /backgroundAisData|aisLiveData|aisMatchingCache|listaBarcos|lastVesselsInArea|exploratoryVesselsCache|dataBridgeLocalCandidates|dataBridgeGlobalCandidates/);
  assert.match(mapSource, /const displayVessels = densityPolCoordinates[\s\S]*\? getDensityMapSourceVessels\(\)[\s\S]*vesselsData: displayVessels/);
  assert.match(markerSource, /function updateAisMarkers\(\) \{[\s\S]*const displayVessels = getDensityDisplayVessels\(\)/);
  assert.doesNotMatch(markerSource, /normalizeDensityVesselCollection\(window\.openShipsVesselsCache\)/);
});

test('density source preserves coordinates and previous raw vessels across tab changes', () => {
  assert.match(source, /function preserveCommercialVesselCoordinates\(vessel\)/);
  assert.match(source, /normalized\.lat = latitude/);
  assert.match(source, /normalized\.lng = longitude/);
  assert.match(source, /normalized\.latitude = latitude/);
  assert.match(source, /normalized\.longitude = longitude/);
  assert.match(source, /if \(nextRawVessels\.length > 0 \|\| !Array\.isArray\(this\.rawVessels\) \|\| this\.rawVessels\.length === 0\)/);
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
  assert.match(globeSource, /focusActiveVesselWhenReady\(activeVessel, 'density'\)/);
  assert.match(globeSource, /window\.setTimeout\(\(\) => \{[\s\S]*focusActiveVesselWhenReady\(vessel, key, attempt \+ 1\);[\s\S]*\}, 300\)/);
  assert.match(globeSource, /view\.globe\.pointOfView\(\{[\s\S]*lat: normalized\.lat,[\s\S]*lng: normalized\.lng,[\s\S]*altitude: 1\.2[\s\S]*\}, 1500\)/);
});

test('matching card dispatches the complete vessel and opens the density globe', () => {
  assert.match(matchingFocusSource, /const activeVessel = \{[\s\S]*\.\.\.match,[\s\S]*\.\.\.ais,[\s\S]*\.\.\.vessel/);
  assert.match(matchingFocusSource, /lat: origin\.lat,[\s\S]*lon: origin\.lon,[\s\S]*lng: origin\.lon,[\s\S]*latitude: origin\.lat,[\s\S]*longitude: origin\.lon/);
  assert.match(matchingFocusSource, /window\.selectShip\([\s\S]*activeVessel\.destination,[\s\S]*activeVessel/);
  assert.match(matchingFocusSource, /switchTab\('ais'\)/);
  assert.match(matchingFocusSource, /window\.setTimeout\(\(\) => \{[\s\S]*focusActiveVessel[\s\S]*\}, 300\)/);
  assert.match(source, /window\.selectShip = function\(name, mmsi, lat, lon, imo = null, destination = null, sourceVessel = null\)/);
  assert.match(source, /lng: lon,[\s\S]*detail: \{ activeVessel: window\.objetoCalculadoraPrincipal \}/);
  assert.match(source, /else if \(typeof mapAIS\.setView === 'function'\)/);
});

test('local matching refreshes mounted density map from the state event', () => {
  assert.match(calculatorSource, /if \(source === 'matching-validation'\) \{/);
  assert.match(calculatorSource, /event\.detail\.nearbyVessels[\s\S]*initAisMap\(\)[\s\S]*updateAisMarkers\(\)/);
});
