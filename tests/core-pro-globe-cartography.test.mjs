import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [globeSource, indexSource, loaderSource, trackingSource] = await Promise.all([
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/map-cartography-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
]);

function mountTrackingGlobe() {
  const renderState = {};
  const controls = {
    addEventListener() {},
    removeEventListener() {},
    update() {},
  };
  let globe;
  globe = new Proxy({}, {
    get(target, property) {
      if (property === 'controls') return () => controls;
      if (property === 'pointOfView') {
        return (...args) => {
          if (!args.length) return renderState.pointOfView || { lat: 24, lng: -24, altitude: 2.5 };
          [renderState.pointOfView, renderState.pointOfViewDuration] = args;
          return globe;
        };
      }
      target[property] ||= (value) => {
        renderState[property] = value;
        return globe;
      };
      return target[property];
    },
  });
  const container = {
    classList: { add() {} },
    style: {},
    dataset: {},
    clientWidth: 800,
    clientHeight: 500,
    parentElement: null,
    getBoundingClientRect: () => ({ width: 800, height: 500 }),
    getClientRects: () => [{}],
    replaceChildren() {},
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    addEventListener() {},
    setTimeout,
    clearTimeout,
    Globe: () => () => globe,
  };
  vm.runInNewContext(globeSource, {
    window,
    document: { getElementById: () => container },
    console,
    requestAnimationFrame: (callback) => { callback(); return 1; },
    cancelAnimationFrame() {},
  });
  window.GlobalFleetGlobe.mount({
    containerId: 'tracking-globe',
    key: 'tracking',
    vesselsData: [],
    restoreRouteState: false,
    focusFirstVessel: false,
    focusActiveVesselOnMount: false,
  });
  return { api: window.GlobalFleetGlobe, controls, renderState };
}

test('Core PRO uses the Data Bridge Globe.gl runtime and globe styling', () => {
  assert.match(loaderSource, /globe\.gl@2\.46\.1\/dist\/globe\.gl\.min\.js/);
  assert.match(globeSource, /backgroundColor\('rgba\(0,0,0,0\)'\)/);
  assert.match(globeSource, /\.showAtmosphere\(true\)/);
  assert.match(globeSource, /\.atmosphereColor\('#39d7e8'\)/);
  assert.match(globeSource, /\.atmosphereAltitude\(0\.16\)/);
  const aisInitStart = indexSource.indexOf('function initAisMap()');
  const aisInitEnd = indexSource.indexOf('function cancelAisMapAnimationFrame()', aisInitStart);
  const aisInitSource = indexSource.slice(aisInitStart, aisInitEnd);
  assert.match(aisInitSource, /ensureMapCartographyLoaded\(\)/);
  assert.doesNotMatch(aisInitSource, /L\.map\(/);
});

test('port detail uses OpenStreetMap tiles with zoom hysteresis', () => {
  assert.match(globeSource, /const PORT_DETAIL_ENTER_ALTITUDE = 0\.58/);
  assert.match(globeSource, /const PORT_DETAIL_EXIT_ALTITUDE = 0\.72/);
  assert.match(globeSource, /typeof globe\?\.globeTileEngineUrl === 'function'/);
  assert.match(globeSource, /\.globeTileEngineMaxLevel\(PORT_TILE_ENGINE_MAX_LEVEL\)/);
  assert.match(globeSource, /https:\/\/tile\.openstreetmap\.org\/\$\{z\}\/\$\{x\}\/\$\{y\}\.png/);
  assert.match(globeSource, /normalizedAltitude <= PORT_DETAIL_ENTER_ALTITUDE/);
  assert.match(globeSource, /normalizedAltitude > PORT_DETAIL_EXIT_ALTITUDE/);
  assert.match(globeSource, /view\.globe\.globeTileEngineUrl\(nextActive \? getPortTileUrl : null\)/);
});

test('AIS tracking uses damped controls and the requested vessel camera transition', () => {
  assert.match(globeSource, /view\.controls\.enableDamping = true/);
  assert.match(globeSource, /view\.controls\.dampingFactor = 0\.08/);
  assert.match(globeSource, /view\.controls\.autoRotate = false/);
  assert.match(globeSource, /const TRACKING_VESSEL_FOCUS_ALTITUDE = 0\.42/);
  assert.match(globeSource, /const TRACKING_VESSEL_TRANSITION_MS = 1100/);
  assert.match(trackingSource, /focusCoordinates\?\.\(position\.lat, position\.lng, TRACKING_MAP_KEY, 0\.42, 1100\)/);
});

test('port tiles switch through the hysteresis band at runtime', () => {
  const { renderState } = mountTrackingGlobe();
  assert.equal(renderState.globeTileEngineMaxLevel, 18);
  assert.equal(renderState.globeTileEngineUrl, null);

  renderState.onZoom({ altitude: 0.58 });
  assert.equal(renderState.globeTileEngineUrl(12, 34, 7), 'https://tile.openstreetmap.org/7/12/34.png');

  renderState.onZoom({ altitude: 0.65 });
  assert.equal(typeof renderState.globeTileEngineUrl, 'function');

  renderState.onZoom({ altitude: 0.73 });
  assert.equal(renderState.globeTileEngineUrl, null);
});

test('tracking vessel focus applies the fixed Data Bridge camera', () => {
  const { api, controls, renderState } = mountTrackingGlobe();
  api.focusActiveVessel({ name: 'Demo', imo: '1234567', lat: 37.2, lng: -5.9 }, 'tracking');

  assert.equal(controls.enableDamping, true);
  assert.equal(controls.dampingFactor, 0.08);
  assert.equal(controls.autoRotate, false);
  assert.equal(renderState.pointOfView.lat, 37.2);
  assert.equal(renderState.pointOfView.lng, -5.9);
  assert.equal(renderState.pointOfView.altitude, 0.42);
  assert.equal(renderState.pointOfViewDuration, 1100);
});

test('LOD zoom tracing reports altitude and detail state', () => {
  assert.match(globeSource, /console\.log\('Altitud:', altitude, 'Modo LOD:', detailActive\)/);
});
