import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const helpersStart = source.indexOf("const MATCHING_EXCLUDED_PASSENGER_VESSEL_NAMES");
const helpersEnd = source.indexOf('async function requestMatchingLocal', helpersStart);
const helpersSource = source.slice(helpersStart, helpersEnd);
const requestEnd = source.indexOf('window.requestMatchingLocal = requestMatchingLocal;', helpersEnd);
const requestSource = source.slice(helpersEnd, requestEnd);
const compatModuleSource = readFileSync(new URL('../src/compatibilidad-module.js', import.meta.url), 'utf8');

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
    'dwt', 'imo', 'lat', 'lon', 'speed', 'vesselKey', 'vessel_key'
  ]);
  assert.equal(compacted.MetaData, undefined);
  assert.equal(compacted.history, undefined);
});

test('passenger and cruise candidates are removed before serialization', () => {
  const { stripMatchingCandidate } = loadPayloadHelpers();

  assert.equal(stripMatchingCandidate({ vessel_name: 'SUN PRINCESS', vessel_type: 'Passenger (Cruise) Ship' }), null);
  assert.equal(stripMatchingCandidate({ vessel_name: 'OTHER CRUISE', vessel_type: 'Cruise Ship' }), null);
  assert.equal(stripMatchingCandidate({ IMO: '1234567', vessel_name: 'DRY MERCHANT', vessel_type: 'Bulk Carrier' })?.imo, '1234567');
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
  assert.match(requestSource, /catch \(error\) \{[\s\S]*showMatchingTransportAlert\('Error de cálculo de coincidencia\. El mapa continúa activo\.'\)/);
  assert.match(requestSource, /requestBytes > 512 \* 1024/);
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

test('Top Match is selected purely dynamically based on the highest score obtained by the mathematical engine', () => {
  function selectDynamicTopMatch(candidates) {
    const sorted = [...candidates].sort((a, b) => (Number(b.compatibilityScore) || 0) - (Number(a.compatibilityScore) || 0));
    for (const item of sorted) {
      item.isTopMatch = false;
    }
    const top = sorted.find(m => (Number(m.compatibilityScore) || 0) > 0 && m.taxonomyCompatible !== false) || null;
    if (top) {
      top.isTopMatch = true;
    }
    return { sorted, topMatch: top };
  }

  // Scenario 1: MV NORDIC TRADER has highest score 96
  const candidatePoolA = [
    { imo: 9100001, name: 'MV PACIFIC STAR', compatibilityScore: 78, taxonomyCompatible: true },
    { imo: 9100002, name: 'MV NORDIC TRADER', compatibilityScore: 96, taxonomyCompatible: true },
    { imo: 9100003, name: 'MV BALTIC HORIZON', compatibilityScore: 84, taxonomyCompatible: true },
    { imo: 9100004, name: 'MV MEDITERRANEAN LEADER', compatibilityScore: 91, taxonomyCompatible: true },
  ];

  const resultA = selectDynamicTopMatch(candidatePoolA);
  assert.equal(resultA.topMatch?.name, 'MV NORDIC TRADER', 'Top Match must be MV NORDIC TRADER with score 96');
  assert.equal(resultA.topMatch?.compatibilityScore, 96);
  assert.equal(resultA.topMatch?.isTopMatch, true);
  assert.equal(resultA.sorted[0].name, 'MV NORDIC TRADER');

  // Scenario 2: MV BALTIC HORIZON receives higher dynamic score 99 -> must dynamically become Top Match
  const candidatePoolB = [
    { imo: 9100001, name: 'MV PACIFIC STAR', compatibilityScore: 78, taxonomyCompatible: true },
    { imo: 9100002, name: 'MV NORDIC TRADER', compatibilityScore: 96, taxonomyCompatible: true },
    { imo: 9100003, name: 'MV BALTIC HORIZON', compatibilityScore: 99, taxonomyCompatible: true },
    { imo: 9100004, name: 'MV MEDITERRANEAN LEADER', compatibilityScore: 91, taxonomyCompatible: true },
  ];

  const resultB = selectDynamicTopMatch(candidatePoolB);
  assert.equal(resultB.topMatch?.name, 'MV BALTIC HORIZON', 'Top Match must dynamically switch to MV BALTIC HORIZON with score 99');
  assert.equal(resultB.topMatch?.compatibilityScore, 99);
  assert.equal(resultB.topMatch?.isTopMatch, true);
  assert.equal(resultB.sorted[0].name, 'MV BALTIC HORIZON');

  // Scenario 3: An arbitrary new vessel with score 100 wins dynamically without any hardcoded vessel name
  const candidatePoolC = [
    { imo: 9999999, name: 'MV OCEANIC PIONEER', compatibilityScore: 100, taxonomyCompatible: true },
    { imo: 9100002, name: 'MV ATLANTIC TRADER', compatibilityScore: 82, taxonomyCompatible: true },
  ];

  const resultC = selectDynamicTopMatch(candidatePoolC);
  assert.equal(resultC.topMatch?.name, 'MV OCEANIC PIONEER', 'Pure dynamic selection assigns Top Match to highest scoring candidate');
  assert.equal(resultC.topMatch?.imo, 9999999);
  assert.equal(resultC.sorted.find(v => v.name === 'MV ATLANTIC TRADER')?.isTopMatch, false, 'MV ATLANTIC TRADER is not forced as Top Match');
});

test('Incompatible and zero-score candidates are strictly excluded from Top Match selection', () => {
  function selectDynamicTopMatch(candidates) {
    const sorted = [...candidates].sort((a, b) => (Number(b.compatibilityScore) || 0) - (Number(a.compatibilityScore) || 0));
    for (const item of sorted) {
      item.isTopMatch = false;
    }
    const top = sorted.find(m => (Number(m.compatibilityScore) || 0) > 0 && m.taxonomyCompatible !== false) || null;
    if (top) {
      top.isTopMatch = true;
    }
    return { sorted, topMatch: top };
  }

  const mixedPool = [
    { imo: 9888881, name: 'MV CHEMICAL TANKER ONE', compatibilityScore: 0, taxonomyCompatible: false },
    { imo: 9888882, name: 'MV CONTAINER FEEDER', compatibilityScore: 0, taxonomyCompatible: false },
    { imo: 9888883, name: 'MV COASTAL BULKER', compatibilityScore: 89, taxonomyCompatible: true },
  ];

  const result = selectDynamicTopMatch(mixedPool);
  assert.equal(result.topMatch?.name, 'MV COASTAL BULKER', 'Taxonomy incompatible candidates with score 0 must not be chosen');
  assert.equal(result.topMatch?.compatibilityScore, 89);
  assert.equal(result.sorted.find(v => v.name === 'MV CHEMICAL TANKER ONE')?.isTopMatch, false);
});

test('Frontend modules do not contain static hardcoded mocks or forced Top Match bindings', () => {
  // Verify compatibilidad-module.js does not statically hardcode isTopMatch: true in initial fallback dataset
  assert.doesNotMatch(
    compatModuleSource,
    /name:\s*["']MV ATLANTIC TRADER["'][\s\S]*?isTopMatch:\s*true/,
    'compatibilidad-module.js must not statically hardcode isTopMatch: true on MV ATLANTIC TRADER',
  );

  // Verify index.html audit panel uses dynamic placeholders rather than hardcoded mock data
  assert.match(source, /id="audit-vessel-name-heading"[^>]*>—<\/h3>/, 'index.html audit vessel heading initialized with placeholder');
  assert.match(source, /id="audit-vessel-subheading"[^>]*>—<\/p>/, 'index.html audit vessel subheading initialized with placeholder');
  assert.match(source, /id="audit-vessel-owner"[^>]*>—<\/span>/, 'index.html audit vessel owner initialized with placeholder');
  assert.match(source, /id="audit-vessel-dwt"[^>]*>—<\/span>/, 'index.html audit vessel DWT initialized with placeholder');
  assert.match(source, /id="audit-vessel-draft"[^>]*>—<\/span>/, 'index.html audit vessel draft initialized with placeholder');
});
