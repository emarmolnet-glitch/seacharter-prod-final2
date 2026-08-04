import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, globeSource, trackingSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
]);

const normalizerStart = indexSource.indexOf('function normalizeVesselSelectionPayload');
const normalizerEnd = indexSource.indexOf('function findLocalVesselSelectionMatch', normalizerStart);
const normalizerSource = indexSource.slice(normalizerStart, normalizerEnd);

function createSelectionNormalizer() {
  const window = {};
  return new Function('window', `${normalizerSource}; return window.normalizeVesselSelectionPayload;`)(window);
}

test('shared vessel payload removes pending IMO and normalizes GIS coordinates', () => {
  const normalize = createSelectionNormalizer();
  assert.deepEqual(normalize({
    vessel: { vesselName: 'NORDIC STAR', imo: 'PENDING' },
    ais: { mmsi: ' 224 123 456 ', latitude: '36.12', longitude: '-5.41' },
  }), {
    imo: null,
    mmsi: '224123456',
    name: 'NORDIC STAR',
    lat: 36.12,
    lon: -5.41,
  });
});

test('selection resolves missing IMO before publishing to GIS consumers', () => {
  const selectionStart = indexSource.indexOf('window.selectShip = function');
  const selectionEnd = indexSource.indexOf('window.contactShipowner', selectionStart);
  const selectionSource = indexSource.slice(selectionStart, selectionEnd);
  assert.match(indexSource, /async function resolveVesselSelectionPayload/);
  assert.match(indexSource, /\/api\/v1\/vessel\/live-profile\?q=\$\{encodeURIComponent\(query\)\}/);
  assert.ok(selectionSource.indexOf('await resolveVesselSelectionPayload') < selectionSource.indexOf('GlobalFleetGlobe.selectVessel'));
  assert.ok(selectionSource.indexOf('await resolveVesselSelectionPayload') < selectionSource.indexOf("CustomEvent('vessel-selection:changed'"));
  assert.match(selectionSource, /imo: selection\.imo/);
  assert.match(selectionSource, /mmsi: selection\.mmsi/);
  assert.match(selectionSource, /detail: \{ activeVessel: window\.objetoCalculadoraPrincipal \}/);
});

test('map, density and tracking globes restore the normalized active vessel', () => {
  assert.match(globeSource, /normalizeVesselIdentifier\(rawImo, 7\) \|\| 'N\/A'/);
  assert.match(globeSource, /focusActiveVesselWhenReady\(activeVessel, 'density'\)/);
  assert.match(globeSource, /\['main', 'tracking'\]\.forEach/);
  assert.match(globeSource, /updateVessels\(\[\.\.\.view\.vessels, normalized\], view\.key\)/);
  assert.match(indexSource, /focusActiveVessel\(activeVessel, 'main'\)/);
  assert.match(trackingSource, /function hydrateTrackingFromActiveVessel/);
  assert.match(trackingSource, /window\.normalizeVesselSelectionPayload/);
  assert.match(trackingSource, /hydrateTrackingFromActiveVessel\(activeVessel, true\)/);
  assert.match(trackingSource, /window\.addEventListener\('vessel-selection:changed'/);
});

test('matching waits for identity resolution before opening density GIS', () => {
  const matchingStart = indexSource.indexOf('async function focusMatchingVesselOnMap');
  const matchingEnd = indexSource.indexOf('window.focusMatchingVesselOnMap', matchingStart);
  const matchingSource = indexSource.slice(matchingStart, matchingEnd);
  assert.match(matchingSource, /await window\.selectShip\(/);
  assert.ok(matchingSource.indexOf('await window.selectShip') < matchingSource.indexOf("switchTab('ais')"));
});
