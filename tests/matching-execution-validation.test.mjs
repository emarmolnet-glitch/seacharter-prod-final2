import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...classes) => classes.forEach(value => values.add(value)),
    remove: (...classes) => classes.forEach(value => values.delete(value)),
    toggle(value, force) {
      if (force === true) values.add(value);
      else if (force === false) values.delete(value);
      else if (values.has(value)) values.delete(value);
      else values.add(value);
    },
    contains: value => values.has(value),
  };
}

test('matching button routes manual clicks through the frontend validator', () => {
  assert.match(source, /id="btn-run-matching"[^>]*onclick="handleMatchingExecutionClick\(event\)"/);
  assert.match(source, /id="matching-execution-validation"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(source, /aria-describedby="matching-execution-validation btn-matching-subtitle"/);
});

test('frontend validation mirrors every unchanged core requirement', () => {
  assert.match(source, /function getMatchingExecutionValidation\(routeOverride = null\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'taxonomy', label: 'Taxonomía de Flota' \}\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'cargo-type', label: 'Tipo de Carga' \}\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'quantity', label: 'Cantidad \(MT\)' \}\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'pol', label: 'POL' \}\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'pod', label: 'POD' \}\)/);
  assert.match(source, /missingFields\.push\(\{ key: 'laycan', label: 'Laycan' \}\)/);

  const coreStart = source.indexOf('async function executeMatchingEngine');
  const coreEnd = source.indexOf('const captureRadarSnapshotForFleetMatching', coreStart);
  const coreGuard = source.slice(coreStart, coreEnd);
  assert.match(coreGuard, /selectedVesselTaxonomies\.length === 0/);
  assert.match(coreGuard, /!matchingCargoType/);
  assert.match(coreGuard, /!Number\.isFinite\(matchingQuantity\)/);
  assert.match(coreGuard, /matchingQuantity <= 0/);
  assert.match(coreGuard, /!matchingLoadPort/);
  assert.match(coreGuard, /!matchingUnloadPort/);
  assert.match(coreGuard, /!matchingLaycan/);
  assert.match(coreGuard, /return false/);
});

test('invalid clicks show exact missing fields and never call the core engine', async () => {
  const blockStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const blockEnd = source.indexOf('window.runMatchingEngine = runMatchingEngine;', blockStart)
    + 'window.runMatchingEngine = runMatchingEngine;'.length;
  const blockSource = source.slice(blockStart, blockEnd);

  const elements = new Map();
  const addElement = (id, value = '') => {
    const attributes = new Map();
    const element = {
      value,
      textContent: '',
      dataset: {},
      classList: createClassList(id === 'matching-execution-validation' ? ['hidden'] : []),
      setAttribute(name, nextValue) { attributes.set(name, String(nextValue)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    elements.set(id, element);
    return element;
  };

  addElement('btn-run-matching');
  const feedback = addElement('matching-execution-validation');
  addElement('match-cargo-type', '');
  addElement('match-quantity', '0');
  addElement('match-load-port', 'oran');
  addElement('match-unload-port', 'freetown');
  addElement('match-laycan-start', '2026-07-20');
  addElement('match-load-lat', '35.6971');
  addElement('match-load-lon', '-0.6308');
  addElement('match-unload-lat', '13.4549');
  addElement('match-unload-lon', '-16.5790');

  let coreCalls = 0;
  const windowMock = {
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
    },
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', 'executeMatchingEngine', 'MATCHING_MANUAL_EXECUTION_TOKEN', blockSource)(
    windowMock,
    documentMock,
    async () => { coreCalls += 1; return true; },
    Symbol('manual'),
  );

  const invalidResult = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(invalidResult, false);
  assert.equal(coreCalls, 0);
  assert.equal(feedback.dataset.missingFields, 'cargo-type,quantity');
  assert.equal(feedback.textContent, 'Validación fallida: Falta definir Tipo de Carga y Cantidad (MT).');
  assert.equal(feedback.classList.contains('hidden'), false);

  elements.get('match-cargo-type').value = 'Grain';
  elements.get('match-quantity').value = '25000';
  const validResult = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(validResult, true);
  assert.equal(coreCalls, 1);
  assert.equal(feedback.textContent, '');
  assert.equal(feedback.classList.contains('hidden'), true);
});

test('global route hydration supplies POL and POD to validation and core execution', async () => {
  const blockStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const blockEnd = source.indexOf('window.runMatchingEngine = runMatchingEngine;', blockStart)
    + 'window.runMatchingEngine = runMatchingEngine;'.length;
  const blockSource = source.slice(blockStart, blockEnd);

  const elements = new Map();
  const addElement = (id, value = '') => {
    const attributes = new Map();
    const element = {
      value,
      textContent: '',
      dataset: {},
      classList: createClassList(id === 'matching-execution-validation' ? ['hidden'] : []),
      setAttribute(name, nextValue) { attributes.set(name, String(nextValue)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    elements.set(id, element);
    return element;
  };

  addElement('btn-run-matching');
  const feedback = addElement('matching-execution-validation');
  addElement('match-cargo-type', 'Grain');
  addElement('match-quantity', '25000');
  addElement('match-load-port', '');
  addElement('match-unload-port', '');
  addElement('match-laycan-start', '');
  addElement('match-load-lat', '');
  addElement('match-load-lon', '');
  addElement('match-unload-lat', '');
  addElement('match-unload-lon', '');

  let receivedRoute = null;
  const windowMock = {
    coreProMatchingRouteContext: {
      pol: { lat: 35.6971, lon: -0.6308 },
      pod: { lat: 13.4549, lon: -16.5790 },
      laycan: '2026-07-20',
    },
    SeaCharterStore: {
      getState: () => ({ pol: 'ORAN (DZ)', pod: 'BANJUL (GM)', laycanDate: '' }),
    },
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
    },
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', 'executeMatchingEngine', 'MATCHING_MANUAL_EXECUTION_TOKEN', blockSource)(
    windowMock,
    documentMock,
    async routeOverride => { receivedRoute = routeOverride; return true; },
    Symbol('manual'),
  );

  const result = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(result, true);
  assert.deepEqual(receivedRoute, {
    pol: 'ORAN (DZ)',
    pod: 'BANJUL (GM)',
    laycan: '2026-07-20',
    pol_coordinates: { lat: 35.6971, lon: -0.6308 },
    pod_coordinates: { lat: 13.4549, lon: -16.579 },
    lat: { pol: 35.6971, pod: 13.4549 },
    lon: { pol: -0.6308, pod: -16.579 },
  });
  assert.equal(feedback.dataset.missingFields, '');
  assert.equal(feedback.classList.contains('hidden'), true);
});

test('Null Island route context recovers the matching coordinates from session storage', async () => {
  const blockStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const blockEnd = source.indexOf('window.runMatchingEngine = runMatchingEngine;', blockStart)
    + 'window.runMatchingEngine = runMatchingEngine;'.length;
  const blockSource = source.slice(blockStart, blockEnd);
  const elements = new Map();
  const addElement = (id, value = '') => {
    const element = {
      value,
      textContent: '',
      dataset: {},
      classList: createClassList(id === 'matching-execution-validation' ? ['hidden'] : []),
      setAttribute() {},
    };
    elements.set(id, element);
    return element;
  };

  addElement('btn-run-matching');
  addElement('matching-execution-validation');
  addElement('match-cargo-type', '60');
  addElement('match-quantity', '25000');
  addElement('match-load-port', 'ORAN (DZ)');
  addElement('match-unload-port', 'BANJUL (GM)');
  addElement('match-laycan-start', '2026-07-20');
  addElement('match-load-lat', '0');
  addElement('match-load-lon', '0');
  addElement('match-unload-lat', '0');
  addElement('match-unload-lon', '0');

  const storedRoute = {
    pol: 'ORAN (DZ)',
    pod: 'BANJUL (GM)',
    laycan: '2026-07-20',
    pol_coordinates: { lat: 35.6971, lon: -0.6308 },
    pod_coordinates: { lat: 13.4549, lon: -16.579 },
  };
  let receivedRoute = null;
  const windowMock = {
    coreProMatchingRouteContext: {
      pol: { lat: 0, lon: 0 },
      pod: { lat: 0, lon: 0 },
      laycan: '2026-07-20',
    },
    sessionStorage: {
      getItem: key => key === 'seacharter_last_valid_matching_route_v1' ? JSON.stringify(storedRoute) : null,
    },
    SeaCharterStore: { getState: () => ({ pol: 'ORAN (DZ)', pod: 'BANJUL (GM)', laycanDate: '2026-07-20' }) },
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
    },
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', 'executeMatchingEngine', 'MATCHING_MANUAL_EXECUTION_TOKEN', blockSource)(
    windowMock,
    documentMock,
    async routeOverride => { receivedRoute = routeOverride; return true; },
    Symbol('manual'),
  );

  const result = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(result, true);
  assert.deepEqual(receivedRoute.pol_coordinates, storedRoute.pol_coordinates);
  assert.deepEqual(receivedRoute.pod_coordinates, storedRoute.pod_coordinates);
});

test('empty and Null Island coordinates stop execution with actionable feedback', async () => {
  const blockStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const blockEnd = source.indexOf('window.runMatchingEngine = runMatchingEngine;', blockStart)
    + 'window.runMatchingEngine = runMatchingEngine;'.length;
  const blockSource = source.slice(blockStart, blockEnd);

  const elements = new Map();
  const addElement = (id, value = '') => {
    const attributes = new Map();
    const element = {
      value,
      textContent: '',
      dataset: {},
      classList: createClassList(id === 'matching-execution-validation' ? ['hidden'] : []),
      setAttribute(name, nextValue) { attributes.set(name, String(nextValue)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    elements.set(id, element);
    return element;
  };

  addElement('btn-run-matching');
  const feedback = addElement('matching-execution-validation');
  addElement('match-cargo-type', 'Grain');
  addElement('match-quantity', '25000');
  addElement('match-load-port', 'oran');
  addElement('match-unload-port', 'banjul');
  addElement('match-laycan-start', '2026-07-20');
  addElement('match-load-lat', '');
  addElement('match-load-lon', '');
  addElement('match-unload-lat', '');
  addElement('match-unload-lon', '');

  let coreCalls = 0;
  const windowMock = {
    coreProMatchingRouteContext: {
      pol: { lat: 0, lon: 0 },
      pod: { lat: 13.4549, lon: -16.5790 },
      laycan: '2026-07-20',
    },
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
    },
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', 'executeMatchingEngine', 'MATCHING_MANUAL_EXECUTION_TOKEN', blockSource)(
    windowMock,
    documentMock,
    async () => { coreCalls += 1; return true; },
    Symbol('manual'),
  );

  const result = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(result, false);
  assert.equal(coreCalls, 0);
  assert.equal(feedback.dataset.missingFields, 'route-coordinates');
  assert.equal(
    feedback.textContent,
    'Validación fallida: coordenadas POL/POD no disponibles o apuntan a (0,0). Vuelve a seleccionar la ruta en el mapa.',
  );
  assert.equal(feedback.classList.contains('hidden'), false);
});

test('valid clicks synchronize the complete global fleet before core execution', async () => {
  const blockStart = source.indexOf('function getMatchingExecutionRouteOverride');
  const blockEnd = source.indexOf('window.runMatchingEngine = runMatchingEngine;', blockStart)
    + 'window.runMatchingEngine = runMatchingEngine;'.length;
  const blockSource = source.slice(blockStart, blockEnd);

  const elements = new Map();
  const addElement = (id, value = '') => {
    const attributes = new Map();
    const element = {
      value,
      textContent: '',
      dataset: {},
      classList: createClassList(id === 'matching-execution-validation' ? ['hidden'] : []),
      setAttribute(name, nextValue) { attributes.set(name, String(nextValue)); },
      getAttribute(name) { return attributes.get(name) || null; },
    };
    elements.set(id, element);
    return element;
  };

  addElement('btn-run-matching');
  addElement('matching-execution-validation');
  const resultsList = addElement('matching-results-list');
  const integrityBanner = addElement('matching-source-integrity');
  addElement('match-cargo-type', 'Grain');
  addElement('match-quantity', '25000');
  addElement('match-load-port', 'oran');
  addElement('match-unload-port', 'banjul');
  addElement('match-laycan-start', '2026-07-19');
  addElement('match-load-lat', '35.6971');
  addElement('match-load-lon', '-0.6308');
  addElement('match-unload-lat', '13.4549');
  addElement('match-unload-lon', '-16.5790');

  const fleet = Array.from({ length: 750 }, (_, index) => ({ imo: String(9000000 + index), vesselName: `Cargo ${index + 1}` }));
  let coreFleetCount = 0;
  const windowMock = {
    SeaCharterStore: { getState: () => ({}) },
    getUnifiedMacroMatchingVessels: vessels => Array.isArray(vessels) ? vessels.filter(Boolean) : [],
    GlobalStore: {
      matchingReady: true,
      matchingSelectionPending: false,
      selectedTaxonomies: ['category:cargo'],
      filteredVesselsInitialized: true,
      getFilteredVessels: () => fleet,
      matchingVessels: [],
      matchingSelection: { taxonomies: ['category:cargo'], vessels: [], vesselCount: 0, committedAt: '2026-07-19T00:00:00.000Z' },
    },
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', 'executeMatchingEngine', 'MATCHING_MANUAL_EXECUTION_TOKEN', blockSource)(
    windowMock,
    documentMock,
    async () => {
      coreFleetCount = windowMock.GlobalStore.matchingSelection.vessels.length;
      return true;
    },
    Symbol('manual'),
  );

  const result = await windowMock.handleMatchingExecutionClick({ preventDefault() {} });
  assert.equal(result, true);
  assert.equal(coreFleetCount, 750);
  assert.equal(windowMock.GlobalStore.matchingVessels.length, 750);
  assert.equal(windowMock.GlobalStore.matchingSelection.vesselCount, 750);
  assert.equal(windowMock.GlobalStore.matchingSelection.vessels[0], fleet[0]);
  assert.equal(resultsList.dataset.executionFleetCount, '750');
  assert.equal(integrityBanner.dataset.executionFleetCount, '750');
  assert.match(source, /Integridad local verificada:[\s\S]*candidatos idóneos[\s\S]*advertencias técnicas calculados desde vessels_master/);
});

test('cache hydration remains distinct from a successful matching execution', () => {
  const cacheStart = source.indexOf('function renderCachedMatchingResults');
  const cacheEnd = source.indexOf('function runDensityMapPreflightChecklist', cacheStart);
  const cacheSource = source.slice(cacheStart, cacheEnd);
  assert.match(cacheSource, /resultsList\.dataset\.matchingExecutionState = 'cache-only'/);
  assert.doesNotMatch(cacheSource, /MATCHING_EXECUTION_SUCCESS/);

  assert.match(source, /window\.addEventListener\('MATCHING_EXECUTION_SUCCESS',[\s\S]*resultsList\.dataset\.matchingExecutionState = 'success'[\s\S]*updateMatchingExecutionSuccessStick\(matches\)/);
});
