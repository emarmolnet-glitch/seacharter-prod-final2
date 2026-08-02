import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const normalizerStart = source.indexOf('function normalizeMatchingSourceMetadata');
const normalizerEnd = source.indexOf('async function parseAiAisFilterResponse', normalizerStart);
const normalizerSource = source.slice(normalizerStart, normalizerEnd);
const helperStart = source.indexOf('const MATCHING_SOURCE_BADGE_IDS');
const helperEnd = source.indexOf('window.renderMatchingSourceCounts = renderMatchingSourceCounts;', helperStart)
  + 'window.renderMatchingSourceCounts = renderMatchingSourceCounts;'.length;
const helperSource = source.slice(helperStart, helperEnd);

test('data source badges expose stable zero-value counters', () => {
  assert.match(source, /id="matching-source-count-databridge"[^>]*>\(0\)</);
  assert.match(source, /id="matching-source-count-ais-live"[^>]*>\(0\)</);
  assert.match(source, /id="matching-source-count-openships"[^>]*>\(0\)</);
});

test('matching source counters derive exact vessel contributions from result origins', () => {
  const elements = new Map([
    ['matching-source-count-databridge', { textContent: '' }],
    ['matching-source-count-ais-live', { textContent: '' }],
    ['matching-source-count-openships', { textContent: '' }],
  ]);
  const windowMock = {};
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', `${normalizerSource}; window.normalizeAiAisFilterMatch = normalizeAiAisFilterMatch;`)(windowMock);
  new Function('window', 'document', 'normalizeMatchingSourceMetadata', helperSource)(
    windowMock,
    documentMock,
    windowMock.normalizeMatchingSourceMetadata,
  );

  const results = [
    { source_origins: ['DATABRIDGE', 'AIS_LIVE'] },
    { ais: { sourceOrigin: 'OPENSHIPS' } },
    { vessel: { source: 'DATABRIDGE_VESSELS_MASTER' } },
    { source: 'filtered_sources' },
  ];
  const counts = windowMock.renderMatchingSourceCounts(results);

  assert.deepEqual(counts, { DATABRIDGE: 2, AIS_LIVE: 1, OPENSHIPS: 1 });
  assert.equal(elements.get('matching-source-count-databridge').textContent, '(2)');
  assert.equal(elements.get('matching-source-count-ais-live').textContent, '(1)');
  assert.equal(elements.get('matching-source-count-openships').textContent, '(1)');

  assert.deepEqual(windowMock.renderMatchingSourceCounts([]), { DATABRIDGE: 0, AIS_LIVE: 0, OPENSHIPS: 0 });
  assert.equal(elements.get('matching-source-count-databridge').textContent, '(0)');
  assert.equal(elements.get('matching-source-count-ais-live').textContent, '(0)');
  assert.equal(elements.get('matching-source-count-openships').textContent, '(0)');
});

test('cache normalization preserves source metadata through a JSON round trip', () => {
  const windowMock = {};
  new Function('window', `${normalizerSource}; window.normalizeAiAisFilterMatch = normalizeAiAisFilterMatch;`)(windowMock);

  const serializedVessel = JSON.parse(JSON.stringify({
    vesselName: 'CACHE VESSEL',
    source: 'OpenShips',
    latitude: 40.1,
    longitude: -8.2,
  }));
  const normalized = windowMock.normalizeAiAisFilterMatch(serializedVessel);
  const rehydrated = windowMock.normalizeAiAisFilterMatch(JSON.parse(JSON.stringify(normalized)));

  assert.equal(normalized.source, 'OpenShips');
  assert.deepEqual(normalized.source_origins, ['OPENSHIPS']);
  assert.equal(normalized.vessel.source, 'OpenShips');
  assert.equal(normalized.ais.source, 'OpenShips');
  assert.equal(rehydrated.source, 'OpenShips');
  assert.deepEqual(rehydrated.source_origins, ['OPENSHIPS']);
});

test('a 936-vessel mixed-case cache produces a non-zero OpenShips badge', () => {
  const elements = new Map([
    ['matching-source-count-databridge', { textContent: '' }],
    ['matching-source-count-ais-live', { textContent: '' }],
    ['matching-source-count-openships', { textContent: '' }],
  ]);
  const windowMock = {};
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', `${normalizerSource}; window.normalizeAiAisFilterMatch = normalizeAiAisFilterMatch;`)(windowMock);
  new Function('window', 'document', 'normalizeMatchingSourceMetadata', helperSource)(
    windowMock,
    documentMock,
    windowMock.normalizeMatchingSourceMetadata,
  );
  const cachedFleet = Array.from({ length: 936 }, (_, index) => windowMock.normalizeAiAisFilterMatch({
    vesselName: `CACHE ${index + 1}`,
    source: index % 2 === 0 ? 'OpenShips' : 'openships',
    latitude: 40.1,
    longitude: -8.2,
  }));

  const counts = windowMock.renderMatchingSourceCounts(JSON.parse(JSON.stringify(cachedFleet)));

  assert.deepEqual(counts, { DATABRIDGE: 0, AIS_LIVE: 0, OPENSHIPS: 936 });
  assert.equal(elements.get('matching-source-count-openships').textContent, '(936)');
});

test('cache button synchronization reads matching state without mutating the active route', () => {
  const syncStart = source.indexOf('function syncMatchingButtonWithCachedResults');
  const syncEnd = source.indexOf('function handleReadyForMatching', syncStart);
  const syncSource = source.slice(syncStart, syncEnd);
  const routeState = { pol: 'BEJAIA', pod: 'AVEIRO' };
  let receivedOptions = null;
  const button = {
    dataset: {},
    disabled: false,
    setAttribute() {},
  };
  const windowMock = {
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
      calculatedState: { route: { pol: 'POL', pod: 'POD' } },
      matchingSelection: { vesselCount: 936 },
    },
    refreshMatchingTaxonomySelectionState: () => ['category:cargo'],
    fetchMatchingRequestFromGlobalStore: (_state, options) => {
      receivedOptions = options;
      if (options?.applyToContext !== false) {
        routeState.pol = 'POL';
        routeState.pod = 'POD';
      }
      return { route: { pol: 'POL', pod: 'POD' } };
    },
  };
  const documentMock = { getElementById: id => id === 'btn-run-matching' ? button : null };
  new Function('window', 'document', syncSource)(windowMock, documentMock);

  windowMock.syncMatchingButtonWithCachedResults(936);

  assert.deepEqual(receivedOptions, { applyToContext: false, persist: false });
  assert.deepEqual(routeState, { pol: 'BEJAIA', pod: 'AVEIRO' });
  assert.equal(button.dataset.matchingResultCount, '936');
});

test('matching lifecycle resets, commits, and rehydrates source counters', () => {
  const executionStart = source.indexOf('async function executeMatchingEngine');
  const executionEnd = source.indexOf('function getMatchingExecutionRouteOverride', executionStart);
  const executionSource = source.slice(executionStart, executionEnd);
  const cachedStart = source.indexOf('function renderCachedMatchingResults');
  const cachedEnd = source.indexOf('function hydrateMatchingResultsFromCache', cachedStart);
  const cachedSource = source.slice(cachedStart, cachedEnd);

  assert.match(executionSource, /setRenderedMatchingVessels\?\.\(\[\], \{ source: 'matching-reset' \}\);\s*renderMatchingSourceCounts\(\[\]\)/);
  assert.match(executionSource, /const sourceCounts = renderMatchingSourceCounts\(matches\)/);
  assert.match(executionSource, /sourceCounts,/);
  assert.match(executionSource, /sourceCounts: renderMatchingSourceCounts\(\[\]\)/);
  assert.match(cachedSource, /renderMatchingSourceCounts\(renderedMatches\)/);
});
