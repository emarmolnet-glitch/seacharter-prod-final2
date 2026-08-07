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
  assert.match(calculatorSource, /const renderFleet = typeof getDensityMapSourceVessels === 'function'/);
  assert.match(calculatorSource, /const hasCommittedMatchingState = renderFleet\.length > 0/);
  assert.match(calculatorSource, /const hasAisData = renderFleet\.length > 0/);
  assert.match(calculatorSource, /const shouldUseCommittedMatchingState = true/);
  assert.doesNotMatch(calculatorSource, /backgroundAisData/);
});

test('density map consumes the persistent commercial store without legacy fallbacks', () => {
  assert.match(mapSource, /const densityVessels = getDensityReactiveVessels\(\)/);
  assert.match(mapSource, /return window\.setRenderFleet\(densityVessels\)/);
  assert.doesNotMatch(densitySourceFunction, /openShipsVesselsCache|rawVessels|filteredVessels|compatibleVessels|nearbyVessels/);
  assert.match(markerSource, /const displayVessels = getDensityDisplayVessels\(\)/);
  assert.match(markerSource, /GlobalFleetGlobe\.updateVessels\(displayVessels, 'density'\)/);
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
  const initStart = mapSource.indexOf('function initAisMap()');
  const initEnd = mapSource.indexOf('function cancelAisMapAnimationFrame()', initStart);
  const initSource = mapSource.slice(initStart, initEnd);
  assert.doesNotMatch(mapSource, /ensureOpenShipsDensitySnapshot/);
  assert.doesNotMatch(initSource, /updateOpenShipsRadar|fetch\s*\(|setTimeout\(async/);
  assert.match(initSource, /const displayVessels = getDensityMapSourceVessels\(\)/);
});

test('density globe restores the globally selected vessel without duplicating camera movement', () => {
  assert.match(mapSource, /function syncDensityActiveVessel\(vessels = getDensityMapSourceVessels\(\)\)/);
  assert.match(mapSource, /window\.GlobalFleetGlobe\.selectVessel\(activeVessel, 'density'\)/);
  assert.doesNotMatch(mapSource, /syncDensityActiveVessel[\s\S]*focusVessel\(activeVessel/);
});

test('globe selection uses the shared vessel state and flies to the active vessel', () => {
  const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
  assert.match(globeSource, /window\.selectShip\([\s\S]*vessel\.vesselName,[\s\S]*vessel\.mmsi,[\s\S]*vessel\.originalLatitude \?\? vessel\.baseLat \?\? vessel\.lat,[\s\S]*vessel\.originalLongitude \?\? vessel\.baseLng \?\? vessel\.lng/);
  assert.match(globeSource, /window\.addEventListener\('vessel-selection:changed'/);
  assert.match(globeSource, /focusActiveVesselWhenReady\(activeVessel, 'density'\)/);
  assert.match(globeSource, /window\.setTimeout\(\(\) => \{[\s\S]*focusActiveVesselWhenReady\(vessel, key, attempt \+ 1\);[\s\S]*\}, 300\)/);
  assert.match(globeSource, /view\.globe\.pointOfView\(\{[\s\S]*lat: normalized\.originalLatitude,[\s\S]*lng: normalized\.originalLongitude,[\s\S]*altitude: 1\.2[\s\S]*\}, 1500\)/);
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
