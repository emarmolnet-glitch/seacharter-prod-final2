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

test('density map prioritizes the commercial OpenShips funnel before legacy local fallbacks', () => {
  assert.match(mapSource, /const openShipsData = normalizeDensityVesselCollection\(window\.openShipsVesselsCache\);[\s\S]*window\.useCommercialFilter\(openShipsData/);
  assert.match(mapSource, /return window\.setRenderFleet\(commercialState\.filteredVessels\)/);
  assert.match(mapSource, /const committedMatches = normalizeDensityVesselCollection\(hasCommittedLocalMatches \? store\.nearbyVessels : \[\]\);[\s\S]*if \(committedMatches\.length > 0\) return window\.setRenderFleet\(committedMatches\)/);
  assert.match(mapSource, /const filteredVessels = normalizeDensityVesselCollection\([\s\S]*store\?\.filteredVesselsInitialized[\s\S]*if \(filteredVessels\.length > 0\) return window\.setRenderFleet\(filteredVessels\)/);
  assert.match(mapSource, /return window\.setRenderFleet\(openShipsData\)/);
  assert.ok(mapSource.indexOf('window.useCommercialFilter(openShipsData') < mapSource.indexOf('if (committedMatches.length > 0)'));
  assert.ok(mapSource.indexOf('if (committedMatches.length > 0)') < mapSource.indexOf('if (filteredVessels.length > 0)'));
  assert.doesNotMatch(mapSource, /mergeDensityVesselSources/);
  assert.doesNotMatch(mapSource, /backgroundAisData|aisLiveData|aisMatchingCache|listaBarcos|lastVesselsInArea|exploratoryVesselsCache|dataBridgeLocalCandidates|dataBridgeGlobalCandidates/);
  assert.match(mapSource, /const openShipsData = densityPolCoordinates[\s\S]*\? getDensityMapSourceVessels\(\)[\s\S]*vesselsData: openShipsData/);
  assert.match(markerSource, /function updateAisMarkers\(\) \{[\s\S]*const renderFleet = getDensityMapSourceVessels\(\)/);
  assert.doesNotMatch(markerSource, /normalizeDensityVesselCollection\(window\.openShipsVesselsCache\)/);
});

test('density source resolves matching, filters, and OpenShips in strict business order', () => {
  const committedMatches = [{ imo: 'MATCH-1' }, { imo: 'MATCH-2' }];
  const filteredVessels = [{ imo: 'FILTER-1' }];
  const openShipsVessels = [{ imo: 'OPEN-1' }, { imo: 'OPEN-2' }, { imo: 'OPEN-3' }];

  const matchingStore = {
    aisMatchingStateSource: 'matching-validation',
    nearbyVessels: committedMatches,
    filteredVesselsInitialized: true,
    getFilteredVessels: () => filteredVessels,
    getRawVessels: () => [],
  };
  const matchingResolver = createDensitySourceResolver(matchingStore, openShipsVessels);
  assert.deepEqual(matchingResolver.resolver(), committedMatches);

  const filterStore = {
    aisMatchingStateSource: 'density-filter',
    nearbyVessels: [],
    filteredVesselsInitialized: true,
    getFilteredVessels: () => filteredVessels,
    getRawVessels: () => [],
  };
  const filterResolver = createDensitySourceResolver(filterStore, openShipsVessels);
  assert.deepEqual(filterResolver.resolver(), filteredVessels);

  const fallbackStore = {
    aisMatchingStateSource: '',
    nearbyVessels: [],
    filteredVesselsInitialized: false,
    getFilteredVessels: () => [],
    getRawVessels: () => [],
  };
  const fallbackResolver = createDensitySourceResolver(fallbackStore, openShipsVessels);
  assert.deepEqual(fallbackResolver.resolver(), openShipsVessels);

  const massiveVessels = Array.from({ length: 1200 }, (_, index) => ({ imo: `MASSIVE-${index}` }));
  const isolatedStore = {
    ...fallbackStore,
    getRawVessels: () => massiveVessels,
    rawVessels: massiveVessels,
    vessels: massiveVessels,
  };
  const isolatedResolver = createDensitySourceResolver(isolatedStore, [], {
    backgroundAisData: massiveVessels,
    aisMatchingCache: massiveVessels,
    listaBarcos: massiveVessels,
    lastVesselsInArea: massiveVessels,
    exploratoryVesselsCache: massiveVessels,
    dataBridgeLocalCandidates: massiveVessels,
    dataBridgeGlobalCandidates: massiveVessels,
  });
  assert.deepEqual(isolatedResolver.resolver(), []);
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
