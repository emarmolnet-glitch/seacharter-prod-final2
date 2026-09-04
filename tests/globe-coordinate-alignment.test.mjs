import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const globeSource = readFileSync(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function loadGlobeNormalizer() {
  const windowMock = {
    addEventListener() {},
    setTimeout,
    clearTimeout,
  };
  new Function('window', 'document', globeSource)(windowMock, {});
  return windowMock.GlobalFleetGlobe.normalizeVessels;
}

function loadRadarCoordinateResolver() {
  const start = indexSource.indexOf('function resolveRadarVesselCoordinatePair');
  const end = indexSource.indexOf('window.resolveRadarVesselCoordinatePair = resolveRadarVesselCoordinatePair;', start);
  assert.ok(start >= 0 && end > start);
  return new Function(`${indexSource.slice(start, end)}; return resolveRadarVesselCoordinatePair;`)();
}

test('globe preserves known geographic coordinates without texture longitude offsets', () => {
  const normalizeVessels = loadGlobeNormalizer();
  const vessels = normalizeVessels([
    { vesselName: 'Thames Estuary', latitude: 51.4779, longitude: 0.5502 },
    { vesselName: 'South Atlantic', ais: { latitude: -30.25, longitude: -15.75 } },
    { vesselName: 'Singapore Roads', latitude: 1.264, longitude: 103.84 },
  ]);

  assert.deepEqual(vessels.map(({ lat, lng }) => [lat, lng]), [
    [51.4779, 0.5502],
    [-30.25, -15.75],
    [1.264, 103.84],
  ]);
  assert.ok(vessels.every(vessel => vessel.coordinateAxisOrder === 'lat-lng'));
});

test('globe refuses to place a vessel on Null Island or the Greenwich meridian', () => {
  const normalizeVessels = loadGlobeNormalizer();

  // Una longitud exactamente 0 solo aparece cuando la telemetría llega vacía y
  // `Number(null)` la convierte en cero, lo que teleportaría el marcador al
  // Canal de la Mancha / Inglaterra. El blindaje geográfico lo descarta.
  const vessels = normalizeVessels([
    { vesselName: 'Telemetria Vacia', latitude: 51.4779, longitude: null },
    { vesselName: 'Null Island', latitude: 0, longitude: 0 },
    { vesselName: 'Sin Latitud', latitude: null, longitude: -8.6538 },
    { vesselName: 'Aveiro Roads', latitude: 40.6405, longitude: -8.6538 },
  ]);

  assert.deepEqual(vessels.map(({ lat, lng }) => [lat, lng]), [[40.6405, -8.6538]]);
});

test('globe reads latitude and longitude from the same AIS scope', () => {
  const normalizeVessels = loadGlobeNormalizer();
  const [vessel] = normalizeVessels([{
    vesselName: 'Atomic Pair',
    ais: { latitude: -34.5, longitude: 12.25 },
    routing: { latitude: 41.38, longitude: 2.17 },
  }]);

  assert.equal(vessel.lat, -34.5);
  assert.equal(vessel.lng, 12.25);
  assert.equal(vessel.coordinateSource, 'latitude/longitude');
});

test('coordinate resolver corrects only an unambiguous longitude-latitude inversion', () => {
  const normalizeVessels = loadGlobeNormalizer();
  const [vessel] = normalizeVessels([{
    vesselName: 'Pacific Axis Correction',
    latitude: -122.42,
    longitude: 37.77,
  }]);

  assert.equal(vessel.lat, 37.77);
  assert.equal(vessel.lng, -122.42);
  assert.equal(vessel.coordinateAxisOrder, 'lng-lat-corrected');
});

test('radar normalization promotes nested AIS coordinates as an atomic pair', () => {
  const resolveCoordinates = loadRadarCoordinateResolver();
  const resolved = resolveCoordinates({
    vessel: { latitude: 40.4, longitude: -3.7 },
    ais: { latitude: -22.8, longitude: -28.4 },
    routing: { latitude: 36.1, longitude: -5.4 },
  });

  assert.deepEqual(resolved, {
    latitude: -22.8,
    longitude: -28.4,
    axisOrder: 'lat-lng',
    source: 'latitude/longitude',
  });
});

test('radar resolver ignores incomplete coordinate scopes instead of assuming zero', () => {
  const resolveCoordinates = loadRadarCoordinateResolver();
  const resolved = resolveCoordinates({
    latitude: -44.2,
    ais: { latitude: -18.75, longitude: 8.5 },
  });

  assert.equal(resolved.latitude, -18.75);
  assert.equal(resolved.longitude, 8.5);
});
