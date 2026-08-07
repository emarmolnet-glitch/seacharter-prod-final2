import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
const distIndexSource = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const distGlobeSource = readFileSync(new URL('../dist/GlobalFleetGlobe.js', import.meta.url), 'utf8');
const lazyGlobeSource = readFileSync(new URL('../src/components/LazyGlobeMap.tsx', import.meta.url), 'utf8');

test('live Radar snapshot is the canonical fleet for both globe views', () => {
  assert.match(indexSource, /setRadarVessels\(vessels, metadata = \{\}\)/);
  assert.match(indexSource, /this\.matchingVessels = normalizedVessels\.slice\(\)/);
  assert.match(indexSource, /Object\.defineProperty\(GlobalStore, 'matchingVessels'/);
  assert.match(indexSource, /density-fleet-updated/);
  assert.match(indexSource, /syncDensityDisplayConsumers\(\{ updateGlobe: true \}\)/);
  assert.match(globeSource, /function getCentralRadarVessels\(\)[\s\S]*GlobalStore\.matchingVessels/);
  assert.match(globeSource, /window\.addEventListener\('radar-fleet-updated', syncAllViews\)/);
});

test('density and main globes start from a panoramic orbital altitude', () => {
  assert.match(globeSource, /INITIAL_VIEW = Object\.freeze\(\{ lat: 24, lng: -24, altitude: 2\.5 \}\)/);
  assert.match(indexSource, /\{ lat: densityPolCoordinates\.lat, lng: densityPolCoordinates\.lon, altitude: 2\.5 \}/);
  assert.match(indexSource, /containerId: 'map-container',[\s\S]*focusActiveVesselOnMount: false/);
  assert.match(indexSource, /setRouteResult\(State\.routeGeometry, 'main', \{ focus: false \}\)/);
  assert.doesNotMatch(indexSource, /densityPolCoordinates\.lat, lng: densityPolCoordinates\.lon, altitude: 0\.15/);
});


test('successful Radar snapshots survive secondary empty synchronizations', () => {
  for (const currentSource of [indexSource, distIndexSource]) {
    assert.match(currentSource, /radarSnapshotPersistent: false/);
    assert.match(currentSource, /this\.radarSnapshotPersistent = normalizedVessels\.length > 0/);
    assert.match(currentSource, /persistent: this\.radarSnapshotPersistent/);
    assert.match(currentSource, /if \(!authorizedWrite\)/);
    assert.match(currentSource, /new CustomEvent\('radar-snapshot-preserved'/);
    assert.match(currentSource, /window\.GlobalStore\?\.beginRadarSweep\?\.\(\{ source: 'matching-radar-sweep' \}\)/);
    assert.match(currentSource, /clearRadarSnapshot\?\.\(\{ source: 'manual-map-clear' \}\)/);
  }
});

test('the canonical matching fleet rejects every secondary overwrite', () => {
  for (const currentSource of [indexSource, distIndexSource]) {
    assert.match(currentSource, /const authorizedWrite = writeSource === 'radar-fleet-updated'[\s\S]*writeSource === 'new-radar-sweep'/);
    assert.match(currentSource, /writeSource === 'matching-ui'[\s\S]*if \(!authorizedWrite\)[\s\S]*matching-fleet-write-rejected[\s\S]*return;/);
    assert.doesNotMatch(currentSource, /radarSnapshotPersistent === true && !authorizedWrite/);
  }
});

test('a late one-vessel validation cannot replace a sixteen-vessel matching snapshot', () => {
  const storeStart = indexSource.indexOf('function preserveCommercialVesselCoordinates');
  const storeEnd = indexSource.indexOf('window.GlobalStore = GlobalStore;', storeStart)
    + 'window.GlobalStore = GlobalStore;'.length;
  const storeSource = indexSource.slice(storeStart, storeEnd);
  const events = [];
  class CustomEventMock {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const window = {
    dispatchEvent(event) { events.push(event); },
  };
  vm.runInNewContext(storeSource, {
    window,
    CustomEvent: CustomEventMock,
    console,
    Date,
  });

  const matchingFleet = Array.from({ length: 16 }, (_, index) => ({
    imo: String(9300000 + index),
    vesselName: `Matching ${index + 1}`,
    latitude: 35 + index * 0.01,
    longitude: -8 + index * 0.01,
  }));
  window.GlobalStore.setMatchingFleet(matchingFleet, { source: 'matching-ui' });
  window.GlobalStore.matchingVessels = [matchingFleet[0]];

  assert.equal(window.GlobalStore.matchingVessels.length, 16);
  assert.equal(events.at(-1)?.type, 'matching-fleet-write-rejected');
  assert.equal(events.at(-1)?.detail?.ignoredVesselCount, 1);

  window.GlobalStore.setMatchingFleet([], { source: 'matching-ui' });

  assert.equal(window.GlobalStore.matchingVessels.length, 16);
  assert.equal(events.at(-1)?.type, 'matching-fleet-empty-write-preserved');
  assert.equal(events.at(-1)?.detail?.persistentVesselCount, 16);
});

test('Density consumers render only the GlobalStore matching fleet', () => {
  for (const currentSource of [indexSource, distIndexSource]) {
    assert.match(currentSource, /function getDensityReactiveVessels\(\)[\s\S]*GlobalStore\?\.matchingVessels/);
    assert.match(currentSource, /function renderDensityVesselsTable\(_vessels, _options = \{\}\)[\s\S]*const displayVessels = getDensityReactiveVessels\(\)/);
    assert.match(currentSource, /function getDensityMapSourceVessels\(\)[\s\S]*getDensityReactiveVessels\(\)/);
    assert.match(currentSource, /const renderFleet = typeof getDensityMapSourceVessels === 'function'[\s\S]*getDensityMapSourceVessels\(\)/);
    assert.doesNotMatch(currentSource, /renderDensityVesselsTable\?\.\(closestVessels/);
    assert.match(currentSource, /function setRenderedMatchingVessels\(vessels, metadata = \{\}\)[\s\S]*setMatchingFleet\?\.\(requestedVessels,[\s\S]*source: 'matching-ui'[\s\S]*const renderedVessels = Array\.isArray\(canonicalVessels\)/);
    const matchingStateStart = currentSource.indexOf('setAisMatchingState(nearbyVessels');
    const matchingStateEnd = currentSource.indexOf('setAisDataAvailability(', matchingStateStart);
    assert.doesNotMatch(currentSource.slice(matchingStateStart, matchingStateEnd), /this\.matchingVessels\s*=/);
  }
});

test('Density React lifecycle never clears the canonical vessel fleet', () => {
  assert.match(lazyGlobeSource, /return \(\) => \{[\s\S]*clearTimeout\(checkTimer\)/);
  assert.match(lazyGlobeSource, /return \(\) => \{[\s\S]*cancelIdleCallback/);
  assert.doesNotMatch(lazyGlobeSource, /setVessels\(\[\]\)|matchingVessels\s*=\s*\[\]|setMatchingFleet\?\.\(\[\]/);
  const switchStart = indexSource.indexOf('function switchTab(tabId)');
  const switchEnd = indexSource.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexSource.slice(switchStart, switchEnd);
  assert.doesNotMatch(switchSource, /destroyAisMap\(\)|clearRadarSnapshot|setMatchingFleet\?\.\(\[\]|resetAisDensityResults/);
  assert.match(switchSource, /renderDensitySnapshotFromGlobalStore/);
});

test('Globe views retain the previous tactical vectors during secondary sync failures', () => {
  for (const currentSource of [globeSource, distGlobeSource]) {
    assert.match(currentSource, /Array\.isArray\(window\.GlobalStore\.matchingVessels\)[\s\S]*return window\.GlobalStore\.matchingVessels/);
    assert.match(currentSource, /radarSnapshotStatus === 'empty'[\s\S]*return \[\]/);
    assert.match(currentSource, /Array\.isArray\(centralRadarVessels\) \? centralRadarVessels : requestedVessels/);
    assert.match(currentSource, /const previousVessels = Array\.isArray\(view\.vessels\) \? view\.vessels\.slice\(\) : \[\]/);
    assert.match(currentSource, /view\.vessels = previousVessels;[\s\S]*renderVesselLayer\(view, previousVessels\)/);
    assert.doesNotMatch(currentSource, /view\.vessels = \[\]/);
  }
});