import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function loadGlobeApi() {
  const window = { addEventListener() {} };
  vm.runInNewContext(globeSource, { window, document: {}, console });
  return window.GlobalFleetGlobe;
}

function mountDensityGlobeWithMatchingFleet(vessels) {
  const renderState = {};
  const controlListeners = {};
  const controls = {
    addEventListener(type, handler) { controlListeners[type] = handler; },
    removeEventListener(type) { delete controlListeners[type]; },
    update() {},
    autoRotate: false,
  };
  let globe;
  globe = new Proxy({}, {
    get(target, property) {
      if (property === 'controls') return () => controls;
      if (property === 'pointOfView') {
        return (...args) => {
          if (args.length === 0) return renderState.pointOfView || { lat: 24, lng: -24, altitude: 2.5 };
          renderState.pointOfView = args[0];
          return globe;
        };
      }
      if (property === 'pointsData') {
        return (...args) => {
          if (args.length === 0) return renderState.pointsData || [];
          renderState.pointsData = args[0];
          return globe;
        };
      }
      if (!target[property]) {
        target[property] = (value) => {
          renderState[property] = value;
          return globe;
        };
      }
      return target[property];
    },
  });
  const classList = { add() {}, toggle() {} };
  const container = {
    classList,
    style: {},
    dataset: {},
    clientWidth: 900,
    clientHeight: 600,
    parentElement: null,
    getBoundingClientRect: () => ({ width: 900, height: 600 }),
    getClientRects: () => [{ width: 900, height: 600 }],
    replaceChildren() {},
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
  };
  const document = {
    getElementById: id => id === 'ais-map' ? container : null,
    createElement: () => ({
      classList,
      dataset: {},
      setAttribute() {},
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  const window = {
    addEventListener() {},
    setTimeout,
    clearTimeout,
    Globe: () => () => globe,
    GlobalStore: {
      matchingVessels: vessels,
      polCoordinates: { lat: 36.1, lng: -5.4 },
      getRadarVessels: () => [],
      hasLiveRadarSnapshot: () => true,
    },
  };
  vm.runInNewContext(globeSource, {
    window,
    document,
    console,
    requestAnimationFrame: callback => { callback(); return 1; },
    cancelAnimationFrame() {},
  });
  window.GlobalFleetGlobe.mount({ key: 'density', containerId: 'ais-map', vesselsData: null, focusFirstVessel: false });
  renderState.controlListeners = controlListeners;
  return renderState;
}

test('overlap metadata preserves exact AIS coordinates without geographic jitter', () => {
  const globe = loadGlobeApi();
  const vessels = Array.from({ length: 16 }, (_, index) => ({
    IMO: String(9000000 + index), vesselName: `Anchorage ${index + 1}`,
    originalLatitude: 36.75, originalLongitude: 5.08,
    latitude: 37.25, longitude: 5.58, vesselType: 'Bulk Carrier',
  }));
  const normalized = globe.normalizeVessels(vessels);
  assert.equal(normalized.length, 16);
  assert.ok(normalized.every(vessel => vessel.lat === 36.75 && vessel.lng === 5.08));
  assert.ok(normalized.every(vessel => vessel.latitude === vessel.originalLatitude));
  assert.ok(normalized.every(vessel => vessel.longitude === vessel.originalLongitude));
  assert.ok(normalized.every(vessel => !('overlapGroupSize' in vessel)));
  assert.doesNotMatch(globeSource, /applyVesselDecluttering|getDeclutterBucketKey|OVERLAP_BUCKET_DEGREES/);
});

test('dot decluttering is deterministic for the same fleet payload', () => {
  const globe = loadGlobeApi();
  const vessels = Array.from({ length: 6 }, (_, index) => ({
    IMO: String(9100000 + index), latitude: 51.94, longitude: 4.14,
  }));
  const first = globe.normalizeVessels(vessels).map(vessel => [vessel.lat, vessel.lng]);
  const second = globe.normalizeVessels(vessels).map(vessel => [vessel.lat, vessel.lng]);
  assert.deepEqual(first, second);
});

test('Globe.gl uses flat native Three.js vectors with AIS heading rotation', () => {
  assert.match(globeSource, /const SURFACE_ALTITUDE = 0/);
  assert.match(globeSource, /new THREE\.ConeGeometry/);
  assert.match(globeSource, /mesh\.scale\.set\(1, 1, VESSEL_VECTOR_FLAT_SCALE\)/);
  assert.match(globeSource, /headingRadians[\s\S]*Math\.cos\(headingRadians\)[\s\S]*Math\.sin\(headingRadians\)/);
  assert.match(globeSource, /renderVesselLayer\(view, view\.vessels\)/);
  assert.match(globeSource, /\.customLayerLabel\([\s\S]*\.onCustomLayerClick\(/);
  assert.doesNotMatch(globeSource, /VESSEL_VECTOR_GLYPH|vessel-vector|htmlElementsData/);
  assert.match(globeSource, /baseLat: lat,[\s\S]*baseLng: lng,[\s\S]*originalLatitude: lat,[\s\S]*originalLongitude: lng/);
  assert.doesNotMatch(indexSource, /three@0\.160\.0|three\.min\.js/);
  assert.match(globeSource, /configureVesselPointFallback[\s\S]*pointResolution\(32\)[\s\S]*pointsData\(\[\]\)/);
});

test('density view prioritizes the persistent Radar snapshot before secondary sources', () => {
  assert.match(globeSource, /function getCentralRadarVessels\(\)[\s\S]*Array\.isArray\(window\.GlobalStore\.matchingVessels\)[\s\S]*return window\.GlobalStore\.matchingVessels/);
  assert.match(globeSource, /function getCentralRadarVessels\(\)[\s\S]*GlobalStore\.matchingVessels/);
  const centralSource = globeSource.slice(globeSource.indexOf('function getCentralRadarVessels()'), globeSource.indexOf('function getGlobePointLabel'));
  assert.doesNotMatch(centralSource, /filteredVessels|nearbyVessels|rawVessels/);
  assert.match(globeSource, /!hasExplicitVessels && Array\.isArray\(centralRadarVessels\) \? centralRadarVessels : requestedVessels/);
  assert.match(indexSource, /function getDensityReactiveVessels\(\)[\s\S]*GlobalStore\?\.matchingVessels/);
});

test('density globe keeps rendering through the native point fallback when Three.js is unavailable', () => {
  const vessels = Array.from({ length: 31 }, (_, index) => ({
    IMO: String(9200000 + index),
    vesselName: `Density ${index + 1}`,
    latitude: 35 + index * 0.01,
    longitude: -8 + index * 0.01,
    vesselType: 'Bulk Carrier',
    course: index * 10,
    distanceToPol: 1200 + index,
    speed: 12.5,
  }));
  const renderState = mountDensityGlobeWithMatchingFleet(vessels);
  assert.equal(renderState.pointsData.length, 31);
  assert.equal(renderState.customLayerData.length, 0);
  assert.equal(renderState.arcsData.length, 31);
  assert.equal(renderState.pointResolution, 32);
  assert.equal(renderState.pointAltitude, 0);
  assert.equal(renderState.pointRadius, 0.15);
  const tooltip = renderState.pointLabel(renderState.pointsData[0]);
  assert.match(tooltip, /Density 1/);
  assert.match(tooltip, /Distancia al POL · 1,200 NM/);
  assert.match(tooltip, /ETA al POL/);
  assert.equal(renderState.labelsData.length, 0);
});

test('density globe fallback keeps every valid vessel and excludes only null coordinates', () => {
  const vessels = Array.from({ length: 17 }, (_, index) => ({
    IMO: String(9400000 + index),
    vesselName: `Persistent ${index + 1}`,
    latitude: index === 16 ? null : 30 + index * 0.02,
    longitude: index === 16 ? null : -12 + index * 0.02,
    heading: 45,
  }));
  const renderState = mountDensityGlobeWithMatchingFleet(vessels);
  assert.equal(renderState.pointsData.length, 16);
  assert.equal(renderState.labelsData.length, 0);
});
