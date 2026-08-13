import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helpersStart = source.indexOf("const MATCHING_EXCLUDED_PASSENGER_VESSEL_NAMES");
const helpersEnd = source.indexOf('async function requestMatchingLocal', helpersStart);
const helpersSource = source.slice(helpersStart, helpersEnd);
const requestEnd = source.indexOf('window.requestMatchingLocal = requestMatchingLocal;', helpersEnd);
const requestSource = source.slice(helpersEnd, requestEnd);

function loadPayloadHelpers() {
  const isStrictCargoAisVessel = (vessel) => {
    return !/passenger|cruise/i.test(String(vessel?.vessel_type || vessel?.vesselType || ''));
  };
  return new Function('isStrictCargoAisVessel', `${helpersSource}; return { stripMatchingCandidate, stripMatchingPayload };`)(isStrictCargoAisVessel);
}

test('matching candidates are stripped to the lightweight mathematical contract', () => {
  const { stripMatchingCandidate } = loadPayloadHelpers();
  const compacted = stripMatchingCandidate({
    id: 'candidate-1',
    IMO: '1234567',
    MMSI: '987654321',
    vessel_name: 'DRY MERCHANT',
    vessel_type: 'Bulk Carrier',
    latitude: 10.5,
    longitude: -20.25,
    DWT: 45000,
    speed_over_ground: 11.2,
    MetaData: { provider: 'heavy-provider-payload' },
    history: Array.from({ length: 100 }, (_, index) => ({ index })),
  });

  assert.deepEqual(Object.keys(compacted).sort(), [
    'candidateId', 'dwt', 'imo', 'lat', 'lon', 'mmsi', 'speed', 'vesselName', 'vesselType',
  ]);
  assert.equal(compacted.MetaData, undefined);
  assert.equal(compacted.history, undefined);
});

test('passenger and cruise candidates are removed before serialization', () => {
  const { stripMatchingCandidate } = loadPayloadHelpers();

  assert.equal(stripMatchingCandidate({ vessel_name: 'SUN PRINCESS', vessel_type: 'Passenger (Cruise) Ship' }), null);
  assert.equal(stripMatchingCandidate({ vessel_name: 'OTHER CRUISE', vessel_type: 'Cruise Ship' }), null);
  assert.equal(stripMatchingCandidate({ vessel_name: 'DRY MERCHANT', vessel_type: 'Bulk Carrier' })?.vesselName, 'DRY MERCHANT');
});

test('matching payload excludes filtered AIS vessels and raw nested metadata', () => {
  const { stripMatchingPayload } = loadPayloadHelpers();
  const compacted = stripMatchingPayload({
    cargo: { loadingPortLat: 1, loadingPortLon: 2, quantity: 30000, rawProviderData: { massive: true } },
    vesselClassContext: {
      values: ['category:cargo'],
      profile: { bunkerMultiplier: 1, secretMetadata: { massive: true } },
      filteredVessels: Array.from({ length: 500 }, () => ({ history: Array(50).fill('x') })),
    },
    selectedTaxonomies: ['category:cargo'],
    allowedSources: ['AIS_LIVE'],
  });

  assert.equal(compacted.vesselClassContext.filteredVessels, undefined);
  assert.equal(compacted.cargo.rawProviderData, undefined);
  assert.equal(compacted.vesselClassContext.profile.secretMetadata, undefined);
  assert.ok(JSON.stringify(compacted).length < 1000);
});

test('matching request checks HTTP status before parsing JSON and catches failures', () => {
  const okCheckIndex = requestSource.indexOf('if (!response.ok)');
  const jsonParseIndex = requestSource.indexOf('response.json()');

  assert.ok(okCheckIndex >= 0);
  assert.ok(jsonParseIndex > okCheckIndex);
  assert.match(requestSource, /try \{[\s\S]*await fetch\('\/api\/matching-local'/);
  assert.match(requestSource, /catch \(error\) \{[\s\S]*showToast\('Error de cálculo de coincidencia', false, 'error'\)/);
  assert.match(requestSource, /matchingError\.matchingLocalHandled = true/);
  assert.match(requestSource, /MATCHING_LOCAL_HTTP_\$\{response\.status\}/);
  assert.match(requestSource, /MATCHING_LOCAL_INVALID_JSON/);
});

test('handled matching transport errors abort without rendering technical details', () => {
  const executionStart = source.indexOf('async function executeMatchingEngine');
  const executionEnd = source.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = source.slice(executionStart, executionEnd);

  assert.match(executionSource, /if \(err\?\.matchingLocalHandled === true\)/);
  assert.match(executionSource, /resultsList\.classList\.add\('hidden'\)/);
  assert.match(executionSource, /emptyState\.classList\.remove\('hidden'\)/);
});
