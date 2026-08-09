import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mapLoaderSource = await readFile(new URL('../map_loader.js', import.meta.url), 'utf8');
const globeSource = await readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');
const globeCssSource = await readFile(new URL('../assets/css/density-globe.css', import.meta.url), 'utf8');
const dataBridgeSource = await readFile(new URL('../public/databridge.html', import.meta.url), 'utf8');
const auditFunctionSource = await readFile(new URL('../netlify/functions/audit-vessels.ts', import.meta.url), 'utf8');
const filterFunctionSource = await readFile(new URL('../netlify/functions/vessels-filter.ts', import.meta.url), 'utf8');
const getVesselsFunctionSource = await readFile(new URL('../netlify/functions/get-vessels.ts', import.meta.url), 'utf8');

test('density map loads validated vessels through the read-only endpoint', () => {
  assert.match(indexSource, /getAuditAisEndpoint/);
  assert.match(indexSource, /fetch\(endpoint,[\s\S]*?method: 'GET'/);
  assert.match(indexSource, /loadValidatedAisDensityVessels/);
  assert.match(indexSource, /fair-freight-background-readonly/);
});

test('Radar LIVE activation loads audited ais_vessels into isolated fair-freight state', () => {
  const toggleStart = indexSource.indexOf('window.toggleLiveTracking = async function');
  const toggleEnd = indexSource.indexOf('window.isFirstLoad', toggleStart);
  const toggleSource = indexSource.slice(toggleStart, toggleEnd);
  const loaderStart = indexSource.indexOf('window.loadValidatedAisDensityVessels = async function');
  const loaderEnd = indexSource.indexOf('window.runInitialAisRadarLoad', loaderStart);
  const loaderSource = indexSource.slice(loaderStart, loaderEnd);

  assert.match(indexSource, /window\.RadarGlobalControl = \(\(\) => \{/);
  assert.match(indexSource, /const activatingLive = state\.mode !== 'live'/);
  assert.match(toggleSource, /window\.loadValidatedAisDensityVessels\(\{/);
  assert.match(toggleSource, /liveMode: true/);
  assert.match(toggleSource, /selectedTaxonomy: selectedTaxonomy \|\| 'All Cargo'/);
  assert.match(toggleSource, /Radar LIVE actualizado con/);
  assert.match(loaderSource, /window\.getAuditAisEndpoint\(selectedTaxonomy, \{ refresh: options\.refresh === true, radarContext, selectedTaxonomies \}\)/);
  assert.match(loaderSource, /taxonomyMode: 'strict'/);
  assert.match(loaderSource, /await fetch\(endpoint/);
  assert.match(loaderSource, /window\.setBackgroundAisData\(validatedVessels\)/);
  assert.match(loaderSource, /new CustomEvent\('ais:background-data-updated'/);
  assert.doesNotMatch(loaderSource, /window\.GlobalStore\.rawVessels = validatedVessels/);
  assert.doesNotMatch(loaderSource, /new CustomEvent\('ais:vessels-updated'/);
});

test('density filter enriches AIS rows with one batch master lookup', () => {
  assert.match(auditFunctionSource, /FROM ais_vessels/);
  assert.match(filterFunctionSource, /FROM ais_vessels/);
  assert.match(auditFunctionSource, /source: "ais_vessels"/);
  assert.match(filterFunctionSource, /source: "ais_vessels"/);
  assert.doesNotMatch(auditFunctionSource, /FROM vessels_master/);
  assert.match(filterFunctionSource, /FROM vessels_master/);
  assert.match(filterFunctionSource, /imo_number = ANY\(\$1::integer\[\]\)/);
  assert.doesNotMatch(filterFunctionSource, /JOIN LATERAL/);
  assert.match(filterFunctionSource, /const masterByImo = new Map/);
  assert.match(filterFunctionSource, /status: degraded \? 206 : 200/);
  assert.match(filterFunctionSource, /gross_tonnage/);
  assert.match(filterFunctionSource, /loa_meters/);
  assert.match(filterFunctionSource, /beam_meters/);
  assert.match(filterFunctionSource, /year_built/);
});

test('database ingestion summary groups the raw payload taxonomy before normalization', () => {
  const loaderStart = indexSource.indexOf('window.loadValidatedAisDensityVessels = async function');
  const loaderEnd = indexSource.indexOf('window.runInitialAisRadarLoad', loaderStart);
  const loaderSource = indexSource.slice(loaderStart, loaderEnd);
  const payloadIndex = loaderSource.indexOf('const validatedVessels = Array.isArray(payload.vessels)');
  const summaryIndex = loaderSource.indexOf('window.buildAisIngestionTaxonomySummary(validatedVessels)');
  const normalizationIndex = loaderSource.indexOf('const normalizedVessels = validatedVessels');

  assert.ok(payloadIndex >= 0 && summaryIndex > payloadIndex && normalizationIndex > summaryIndex);

  const helperStart = indexSource.indexOf('window.buildAisIngestionTaxonomySummary = function');
  const helperEnd = indexSource.indexOf('window.groupAisVesselsByTaxonomy', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const windowMock = {};
  const readAisVesselDeclaredTaxonomyType = vessel => vessel?.ship_type || vessel?.vessel_type || vessel?.shipType || vessel?.ShipType || vessel?.vesselType || vessel?.type || 'Unknown';
  new Function('window', 'readAisVesselDeclaredTaxonomyType', helperSource)(windowMock, readAisVesselDeclaredTaxonomyType);

  const summary = windowMock.buildAisIngestionTaxonomySummary([
    { ship_type: 'Bulk Carrier' },
    { shipType: 'General Cargo' },
    { ship_type: 'Bulk Carrier' },
  ]);

  assert.deepEqual(summary.groups, [
    { label: 'Bulk Carrier', count: 2 },
    { label: 'General Cargo', count: 1 },
  ]);
  assert.equal(
    summary.message,
    'Consulta completada: 3 buques cargados desde la base de datos. (2 Bulk Carrier, 1 General Cargo)',
  );
  assert.doesNotMatch(summary.message, /0 /);
});

test('ingestion summary catches taxonomy failures without interrupting the UI flow', () => {
  const helperStart = indexSource.indexOf('window.buildAisIngestionTaxonomySummary = function');
  const helperEnd = indexSource.indexOf('window.groupAisVesselsByTaxonomy', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const windowMock = {};
  const readAisVesselDeclaredTaxonomyType = vessel => vessel.ship_type || 'Unknown';
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    new Function('window', 'readAisVesselDeclaredTaxonomyType', helperSource)(windowMock, readAisVesselDeclaredTaxonomyType);
    const brokenVessel = {};
    Object.defineProperty(brokenVessel, 'ship_type', {
      get() { throw new Error('taxonomy getter failed'); },
    });

    const summary = windowMock.buildAisIngestionTaxonomySummary([brokenVessel]);

    assert.deepEqual(summary.groups, []);
    assert.equal(summary.details, '');
    assert.equal(summary.message, 'Consulta completada: 1 buques cargados desde la base de datos.');
  } finally {
    console.warn = originalWarn;
  }
});

test('parent taxonomies aggregate their real child vessel types without cross-field contamination', () => {
  const filterStart = indexSource.indexOf('function getAisVesselDeclaredTaxonomyType');
  const filterEnd = indexSource.indexOf('function isStrictFleetMode', filterStart);
  const filterSource = indexSource.slice(filterStart, filterEnd);
  const windowMock = {};
  const normalizeFleetTaxonomyText = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const getAisShipTypeCode = value => {
    const match = String(value || '').match(/\b(\d{2})\b/);
    return match ? Number(match[1]) : null;
  };
  const fleetTaxonomy = {
    bulk: ['bulk carrier', 'bulker'],
    general: ['general cargo'],
    container: ['container ship'],
    cement: ['cement carrier', 'cement'],
    mpv: ['multipurpose', 'mpp'],
    heavy_lift: ['heavy lift'],
    crude_tanker: ['crude tanker'],
    lng_tanker: ['lng tanker'],
    chemical_tanker: ['chemical tanker'],
    product_tanker: ['product tanker'],
    lpg_tanker: ['lpg tanker'],
    passenger: ['passenger'],
    cruise: ['cruise'],
    ferry: ['ferry'],
    offshore: ['offshore'],
    tug: ['tug'],
    fishing: ['fishing'],
  };
  new Function('window', 'normalizeFleetTaxonomyText', 'getAisShipTypeCode', 'FLEET_INTEL_TAXONOMY', filterSource)(
    windowMock,
    normalizeFleetTaxonomyText,
    getAisShipTypeCode,
    fleetTaxonomy,
  );

  const vessels = [
    { ship_type: 'Bulk Carrier', cargoType: 'Cement Carrier' },
    { ship_type: 'Bulk Carrier' },
    { ship_type: 'Cement Carrier', cargoType: 'Bulk Carrier' },
    { ship_type: 'General Cargo' },
    { ship_type: 'Container Ship' },
    { ship_type: 'LNG Tanker' },
  ];
  const elements = new Map([
    ['ais-density-count', { textContent: '0' }],
    ['buques-count', { textContent: '0' }],
  ]);
  let currentFilteredVessels = [];
  windowMock.GlobalStore = {
    filteredVesselsInitialized: true,
    getFilteredVessels: () => currentFilteredVessels,
  };
  windowMock.renderFleet = currentFilteredVessels;
  windowMock.getDensityReactiveVessels = () => currentFilteredVessels;
  windowMock.renderAisTaxonomyBreakdown = () => {};
  const counterStart = indexSource.indexOf('window.getDerivedFilteredAisVessels = function()');
  const counterEnd = indexSource.indexOf('window.reiniciarMemoriaBarridoAIS', counterStart);
  new Function('window', 'document', indexSource.slice(counterStart, counterEnd))(
    windowMock,
    { getElementById: id => elements.get(id) || null },
  );

  currentFilteredVessels = windowMock.filterVessels(vessels, 'Bulk Carrier');
  windowMock.renderFleet = currentFilteredVessels;
  assert.equal(windowMock.renderFilteredAisCounters(), 2);
  assert.equal(elements.get('ais-density-count').textContent, '2');

  currentFilteredVessels = windowMock.filterVessels(vessels, 'type:cement');
  windowMock.renderFleet = currentFilteredVessels;
  assert.equal(windowMock.renderFilteredAisCounters(), 1);
  assert.equal(elements.get('ais-density-count').textContent, '1');

  currentFilteredVessels = windowMock.filterVessels(vessels, ['type:general']);
  windowMock.renderFleet = currentFilteredVessels;
  assert.deepEqual(currentFilteredVessels.map(vessel => vessel.ship_type), ['General Cargo']);
  assert.equal(windowMock.renderFilteredAisCounters(), 1);
  assert.equal(elements.get('buques-count').textContent, '1');

  currentFilteredVessels = windowMock.filterVessels(vessels, ['type:general', 'type:container']);
  windowMock.renderFleet = currentFilteredVessels;
  assert.deepEqual(currentFilteredVessels.map(vessel => vessel.ship_type), ['General Cargo', 'Container Ship']);

  currentFilteredVessels = windowMock.filterVessels(vessels, ['ALL CARGO']);
  assert.equal(windowMock.renderFilteredAisCounters(), 5);
  assert.equal(elements.get('buques-count').textContent, '5');
  assert.deepEqual(currentFilteredVessels.map(vessel => vessel.ship_type), [
    'Bulk Carrier',
    'Bulk Carrier',
    'Cement Carrier',
    'General Cargo',
    'Container Ship',
  ]);

  currentFilteredVessels = windowMock.filterVessels(vessels, ['category:tanker']);
  assert.deepEqual(currentFilteredVessels.map(vessel => vessel.ship_type), ['LNG Tanker']);
});

test('calculator cargo state does not overwrite AIS taxonomy selection or vessel types', () => {
  const manualInputStart = indexSource.indexOf('function handleCargoManualInput()');
  const manualInputEnd = indexSource.indexOf('function syncCBAMModuleFromCalculator()', manualInputStart);
  const manualInputSource = indexSource.slice(manualInputStart, manualInputEnd);
  assert.match(manualInputSource, /window\.inferFleetCargoTaxonomy\(cargoValue\)/);
  assert.doesNotMatch(manualInputSource, /applyFleetCargoTaxonomy|reapplyCentralFiltersAndRedraw/);
  assert.match(indexSource, /const storedRecord = findFleetIntelRecord\(vessel\);[\s\S]*record = storedRecord && storedRecord\.source !== 'calculator'/);
  assert.doesNotMatch(indexSource, /findFleetIntelRecord\(vessel\) \|\| syncCalculatorCargoRecordForVessel\(vessel\)/);
  assert.match(indexSource, /const vesselTypeLabel = getAisTaxonomyBreakdownLabel\(v\);[\s\S]*btn\.innerHTML = `[\s\S]*\$\{vesselTypeLabel\}/);
});

test('taxonomy view resolves the declared AIS type across script scopes', () => {
  assert.match(indexSource, /window\.getAisVesselDeclaredTaxonomyType = getAisVesselDeclaredTaxonomyType/);
  assert.match(indexSource, /function readAisVesselDeclaredTaxonomyType\(vessel\)[\s\S]*window\.getAisVesselDeclaredTaxonomyType\(vessel\)/);
  assert.match(indexSource, /function getAisTaxonomyBreakdownLabel\(vessel\)[\s\S]*const declaredType = readAisVesselDeclaredTaxonomyType\(vessel\)/);
  assert.match(indexSource, /window\.buildAisIngestionTaxonomySummary[\s\S]*const type = readAisVesselDeclaredTaxonomyType\(vessel\)/);
});

test('ingestion reduce groups by each vessel declared type without cross-field contamination', () => {
  const helperStart = indexSource.indexOf('window.buildAisIngestionTaxonomySummary = function');
  const helperEnd = indexSource.indexOf('window.groupAisVesselsByTaxonomy', helperStart);
  const helperSource = indexSource.slice(helperStart, helperEnd);
  const windowMock = {};
  const readAisVesselDeclaredTaxonomyType = vessel => vessel?.ship_type
    || vessel?.vessel_type
    || vessel?.shipType
    || vessel?.ShipType
    || vessel?.vesselType
    || vessel?.type
    || 'Unknown';
  new Function('window', 'readAisVesselDeclaredTaxonomyType', helperSource)(windowMock, readAisVesselDeclaredTaxonomyType);

  const summary = windowMock.buildAisIngestionTaxonomySummary([
    { ship_type: 'Bulk Carrier', cargoType: 'Cement Carrier' },
    { ship_type: 'Bulk Carrier', cargoType: 'Cement Carrier' },
    { ship_type: 'Cement Carrier', cargoType: 'Cement Carrier' },
  ]);

  assert.deepEqual(summary.groups, [
    { label: 'Bulk Carrier', count: 2 },
    { label: 'Cement Carrier', count: 1 },
  ]);
  assert.equal(
    summary.message,
    'Consulta completada: 3 buques cargados desde la base de datos. (2 Bulk Carrier, 1 Cement Carrier)',
  );
});

test('read-only density synchronization publishes no success toast', () => {
  assert.doesNotMatch(indexSource, /showToast\([\s\S]*?state\.taxonomySummary\?\.message/);
  assert.doesNotMatch(indexSource, /updateAisAvailabilitySweepFeedback/);
});

test('density map restores globally filtered vessels without refetching', () => {
  const switchStart = indexSource.indexOf('function switchTab(tabId)');
  const switchEnd = indexSource.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexSource.slice(switchStart, switchEnd);
  assert.match(switchSource, /renderDensitySnapshotFromGlobalStore/);
  assert.doesNotMatch(switchSource, /fetch\s*\(|updateOpenShipsRadar|loadValidatedAisDensityVessels|runDensityMapPreflightChecklist|calculateAndDisplayAisFreight/);
  assert.match(indexSource, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*getDensityReactiveVessels\(\)[\s\S]*GlobalFleetGlobe\?\.updateVessels/);
});

test('density tab remains mounted while CSS hides inactive views', () => {
  const switchStart = indexSource.indexOf('function switchTab(tabId)');
  const switchEnd = indexSource.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexSource.slice(switchStart, switchEnd);
  assert.match(switchSource, /view\.classList\.toggle\('hidden', !isActiveView\)/);
  assert.doesNotMatch(switchSource, /destroyAisMap\(\)|initAisMap\(\)|clearRadarSnapshot/);
});

test('density globe renders native corporate tactical vectors', () => {
  assert.match(globeSource, /COMMERCIAL_VESSEL_COLOR = '#10B981'/);
  assert.match(globeSource, /new THREE\.ConeGeometry/);
  assert.match(globeSource, /color: COMMERCIAL_VESSEL_COLOR/);
  assert.match(globeSource, /VESSEL_VECTOR_FLAT_SCALE = 0\.16/);
  assert.match(globeSource, /\.customLayerData\(\[\]\)/);
  assert.doesNotMatch(globeSource, /vessel-vector|VESSEL_VECTOR_GLYPH|htmlElementsData|htmlElement\(/);
});

test('density map navigation preserves the global background radar state', () => {
  const switchStart = indexSource.indexOf('function switchTab(tabId)');
  const switchEnd = indexSource.indexOf('function closeMobileSessionMenu()', switchStart);
  const switchSource = indexSource.slice(switchStart, switchEnd);
  assert.doesNotMatch(switchSource, /RadarGlobalControl|deactivateDataBridgeLiveTracking|syncDataBridgeRadarTransport|aisDensityReadOnly|isLiveTrackingEnabled/);
  assert.match(switchSource, /targetView\.classList\.add\(tabId === 'auditor' \? 'active-flex' : 'active-block'\)/);
});

test('map loader defaults to the audit read endpoint', () => {
  assert.match(mapLoaderSource, /endpoint: '\/api\/audit-vessels'/);
  assert.doesNotMatch(mapLoaderSource, /endpoint: '\/\.netlify\/functions\/get-vessels\?force=1'/);
});

test('audit endpoint performs only a validated SELECT', () => {
  assert.match(auditFunctionSource, /FROM ais_vessels[\s\S]*audit_status = \$9/);
  assert.match(auditFunctionSource, /distance_nm <= \$8/);
  assert.doesNotMatch(auditFunctionSource, /\.insert\(|\.update\(|\.delete\(/);
});

test('audit endpoint returns the database error message for diagnostics', () => {
  assert.match(auditFunctionSource, /const errorMessage = getErrorMessage\(error\)/);
  assert.match(auditFunctionSource, /error: errorMessage/);
});

test('density exposes no radar command and consumes the matching snapshot only', () => {
  const densityStart = indexSource.indexOf('<div id="view-ais"');
  const densityEnd = indexSource.indexOf('<div id="view-matching"', densityStart);
  const densitySource = indexSource.slice(densityStart, densityEnd);

  assert.doesNotMatch(densitySource, /btn-refresh-ais|Barrido de Radar Externo|trigger-ais-sweep/);
  assert.doesNotMatch(indexSource, /ejecutarBarridoManual|executeSweepAIS|waitForManualAisSweepCompletion/);
  assert.match(indexSource, /data-radar-global-control data-radar-context="matching"/);
  assert.match(indexSource, /window\.executeMatchingRadarSweep = async function\(\)/);
});

test('read-only response feeds rendering, counters, and freight calculation', () => {
  assert.match(indexSource, /const validatedVessels = Array\.isArray\(payload\.vessels\) \? payload\.vessels : \[\]/);
  assert.match(indexSource, /dispatchEvent\(new CustomEvent\('ais:vessels-updated'/);
  assert.match(indexSource, /renderFilteredAisCounters\(primaryVisibleVessels\)/);
  assert.match(indexSource, /calculateAndDisplayAisFreight\(\)/);
});

test('main AIS KPI is derived only from the provided displayVessels snapshot', () => {
  const derivedCounterStart = indexSource.indexOf('window.getDerivedFilteredAisVessels = function()');
  const derivedCounterEnd = indexSource.indexOf('// Global Store (Shared Memory)', derivedCounterStart);
  const derivedCounterSource = indexSource.slice(derivedCounterStart, derivedCounterEnd);
  const elements = new Map([
    ['ais-density-count', { textContent: '--' }],
    ['buques-count', { textContent: '--' }]
  ]);
  const filteredVessels = [
    { ship_type: 'Bulk Carrier' },
    { ship_type: 'Cement Carrier' }
  ];
  let breakdownVessels = null;
  const windowMock = {
    renderFleet: filteredVessels,
    getDensityReactiveVessels: () => filteredVessels,
    GlobalStore: {
      filteredVesselsInitialized: true,
      getFilteredVessels: () => filteredVessels
    },
    renderAisTaxonomyBreakdown: (_containerId, vessels) => {
      breakdownVessels = vessels;
    }
  };
  const documentMock = { getElementById: id => elements.get(id) || null };
  new Function('window', 'document', derivedCounterSource)(windowMock, documentMock);

  assert.equal(windowMock.renderFilteredAisCounters(filteredVessels), 2);
  assert.equal(elements.get('ais-density-count').textContent, '2');
  assert.equal(elements.get('buques-count').textContent, '2');
  assert.equal(breakdownVessels, filteredVessels);

  assert.equal(windowMock.renderFilteredAisCounters([]), 2);
  assert.equal(elements.get('ais-density-count').textContent, '2');
  assert.equal(breakdownVessels, filteredVessels);
});

test('empty taxonomy selection stays empty instead of falling back to All Cargo', () => {
  const filterLabelStart = indexSource.indexOf('function getFleetTypeFilterLabel()');
  const filterLabelEnd = indexSource.indexOf('const VESSEL_CLASS_CONTEXT_PROFILES', filterLabelStart);
  const filterLabelSource = indexSource.slice(filterLabelStart, filterLabelEnd);
  assert.match(filterLabelSource, /return getSelectedFleetTaxonomies\(\)/);
  assert.doesNotMatch(filterLabelSource, /category:cargo/);
});

test('empty taxonomy selection keeps audited POL vessels visible', () => {
  const redrawStart = indexSource.indexOf('window.reapplyCentralFiltersAndRedraw = function');
  const redrawEnd = indexSource.indexOf("window.addEventListener('ais:vessels-updated'", redrawStart);
  const redrawSource = indexSource.slice(redrawStart, redrawEnd);

  assert.match(redrawSource, /const hasSelectedVesselTypes = Array\.isArray\(vesselTypes\) && vesselTypes\.length > 0/);
  assert.match(redrawSource, /!hasSelectedVesselTypes \|\| AIS_RAW_FLEET_DIAGNOSTIC_MODE[\s\S]*\? hydratedRawVessels/);
  assert.doesNotMatch(redrawSource, /vesselTypes\.length === 0[\s\S]{0,300}updateAisMarkers\(\[\]\)/);
});

test('POL matching cache invalidates when filtered taxonomy composition changes', () => {
  assert.match(indexSource, /const selectedTaxonomySignature = typeof getSelectedFleetTaxonomies/);
  assert.match(indexSource, /const sourceVesselSignature = proximitySourceVessels\.map/);
  assert.match(indexSource, /lastSourceSignature !== sourceSignature/);
  assert.match(indexSource, /\|\| \(!geographicInputsChanged && filteredSourceChanged\)/);
});

test('vessel filter decodes text and applies taxonomy after the batch lookup', () => {
  assert.match(filterFunctionSource, /decodeURIComponent\(/);
  assert.match(filterFunctionSource, /matchesRequestedType\(master\?\.vessel_type \|\| row\.vessel_type, vesselType\)/);
  assert.match(filterFunctionSource, /WHERE imo_number = ANY\(\$1::integer\[\]\)/);
  assert.match(filterFunctionSource, /distance_nm <= \$8/);
  assert.match(filterFunctionSource, /path: "\/api\/vessels-filter"/);
  assert.doesNotMatch(filterFunctionSource, /INSERT|UPDATE|DELETE/);
});

test('selected taxonomy schedules one debounced Radar refresh', () => {
  const bindingStart = indexSource.indexOf('function bindReactiveRadarInputs()');
  const bindingEnd = indexSource.indexOf('window.bindReactiveRadarInputs = bindReactiveRadarInputs;', bindingStart);
  const bindingSource = indexSource.slice(bindingStart, bindingEnd);
  assert.match(bindingSource, /mode: 'manual-only'/);
  assert.doesNotMatch(bindingSource, /addEventListener|scheduleAisMatchingRefresh|executeMatchingRadarSweep/);
  assert.match(indexSource, /host\.querySelector\('\[data-radar-global-button\]'\)\?\.addEventListener\('click',[\s\S]*executeMatchingRadarSweep/);
});

test('All Cargo uses the general audit endpoint as an explicit reset', () => {
  assert.match(indexSource, /normalizedType !== 'All Cargo'/);
  assert.match(indexSource, /return `\/api\/audit-vessels\?\$\{params\.toString\(\)\}`/);
});

test('Core PRO sends POL coordinates and a bounded radius to AIS endpoints', () => {
  assert.match(indexSource, /polLat: String\(pol\.lat\)/);
  assert.match(indexSource, /polLon: String\(pol\.lon\)/);
  assert.match(indexSource, /radiusNm: String\(AIS_PROSPECTION_RADII_NM\.POL\)/);
  assert.match(indexSource, /POL: 1000/);
});

test('Core PRO renders the globally filtered AIS fleet independently of route ports', () => {
  assert.match(indexSource, /getDensityMapSourceVessels\(\);[\s\S]*const displayVessels = getDensityDisplayVessels\(\)/);
  assert.match(indexSource, /GlobalFleetGlobe\.updateVessels\(displayVessels, 'density'\)/);
  assert.doesNotMatch(indexSource, /const renderableVessels = \(hasLoadingPort/);
});

test('filtered AIS state redraws visible globes and defers hidden views', () => {
  assert.match(indexSource, /filteredVessels: \[\]/);
  assert.match(indexSource, /setFilteredVessels\(newFilteredVessels/);
  assert.match(indexSource, /ais:filtered-vessels-updated/);
  assert.ok(globeSource.includes("window.addEventListener('ais:filtered-vessels-updated', syncAllViews)"));
  assert.match(globeSource, /views\.forEach\(\(view\) => \{[\s\S]*if \(!isViewVisible\(view\)\)[\s\S]*view\.pendingVesselSync = true[\s\S]*updateVessels\(null, view\.key\)/);
  assert.match(globeSource, /const centralRadarVessels = getCentralRadarVessels\(\)/);
  assert.match(globeSource, /Array\.isArray\(centralRadarVessels\) \? centralRadarVessels : requestedVessels/);
  assert.doesNotMatch(globeSource, /key === 'density'[\s\S]*getDensityMapSourceVessels/);
});

test('Core PRO and Data Bridge share Globe.gl 2.46.1', () => {
  assert.ok(indexSource.includes('globe.gl@2.46.1/dist/globe.gl.min.js'));
  assert.ok(dataBridgeSource.includes('globe.gl@2.46.1/dist/globe.gl.min.js'));
  assert.ok(indexSource.includes('GlobalFleetGlobe.js'));
  assert.ok(dataBridgeSource.includes('GlobalFleetGlobe.js'));
  assert.ok(globeSource.includes('window.Globe({ animateIn: false, waitForGlobeReady: false })(container)'));
  assert.ok(globeSource.includes('window.GlobalFleetGlobe = globalFleetGlobe'));
  assert.ok(dataBridgeSource.includes("window.GlobalFleetGlobe?.mount({ key: 'bridge'"));
  assert.doesNotMatch(indexSource, /deck\.gl|map_view\.js/);
  assert.doesNotMatch(dataBridgeSource, /deck\.gl|map_view\.js/);
});

test('both globe views expose nested radar vessel details on hover', () => {
  assert.match(globeSource, /function getGlobePointLabel\(vessel\)/);
  assert.match(globeSource, /\.customLayerLabel\(\(vessel\) => safeVesselTacticalLabel\(view, vessel\)\)/);
  assert.ok(globeSource.includes("'radarData'"));
  assert.ok(globeSource.includes("'source_payload'"));
  assert.ok(globeSource.includes('· IMO'));
  assert.ok(globeSource.includes("'Buque sin nombre'"));
  assert.match(globeSource, /global-fleet-tooltip--tactical/);
  assert.doesNotMatch(globeSource, /onLabelHover|label\?\.vessel/);
});

test('globe hover styling preserves flat tactical geometry and matches radar tooltip design', () => {
  assert.ok(globeSource.includes('SURFACE_ALTITUDE = 0'));
  assert.match(globeSource, /mesh\.scale\.set\(1, 1, VESSEL_VECTOR_FLAT_SCALE\)/);
  assert.match(globeSource, /\.customLayerLabel\(\(vessel\) => safeVesselTacticalLabel/);
  assert.match(globeSource, /Distancia al POL/);
  assert.match(globeSource, /ETA al POL/);
  assert.doesNotMatch(globeSource, /VESSEL_VECTOR_GLYPH|vessel-vector|FIXED_POINT_RADIUS|POINT_HOVER_RADIUS_FACTOR|htmlElementsData/);
});

test('Core PRO tooltip escapes map clipping and floats above interface overlays', () => {
  assert.match(globeCssSource, /\.global-fleet-globe \.scene-tooltip \{[\s\S]*?z-index: 9999 !important/);
  assert.match(globeCssSource, /#view-map #map-container,[\s\S]*?#view-ais #ais-map \{[\s\S]*?overflow: visible !important/);
  assert.match(indexSource, /density-globe\.css\?v=[^"']+/);
  assert.match(dataBridgeSource, /density-globe\.css\?v=[^"']+/);
});

test('custom tactical highlighting uses the shared vessel interaction handler', () => {
  assert.doesNotMatch(globeSource, /scheduleTacticalLabelRefresh|hoverStyleFrameId|onLabelHover/);
  assert.match(globeSource, /function handleVesselClick\(view, vessel\)[\s\S]*setSelectedVessel\(view, vessel\)[\s\S]*setAutoRotate\(false, view\.key\)/);
  assert.match(globeSource, /\.onCustomLayerClick\(\(vessel\) => handleVesselClick\(view, vessel\)\)/);
  assert.match(globeSource, /renderVesselLayer\(view, view\.vessels\)/);
});

test('Globe View containers have explicit visible dimensions and responsive rules', () => {
  assert.match(indexSource, /html,[\s\S]*?body \{[\s\S]*?height: 100%;/);
  assert.match(globeCssSource, /\.global-fleet-globe,[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;[\s\S]*?min-height: 280px !important;/);
  assert.ok(globeCssSource.includes('border: 1px solid #cad8e7'));
  assert.ok(globeCssSource.includes('box-shadow: 0 20px 50px rgba(15, 52, 124, 0.16)'));
  assert.ok(globeCssSource.includes('background-size: 30px 30px, 30px 30px'));
  assert.match(globeCssSource, /@media \(max-width: 1180px\)[\s\S]*?width: 32%/);
  assert.match(globeCssSource, /@media \(max-width: 820px\)[\s\S]*?display: none/);
  assert.ok(dataBridgeSource.includes('global-fleet-globe-responsive'));
});

test('master globe waits for layout and reports mounting diagnostics', () => {
  assert.ok(indexSource.includes('mapBounds.width <= 1 || mapBounds.height <= 1'));
  assert.ok(indexSource.includes("dataset.renderKey = 'loading'"));
  assert.ok(indexSource.includes("dataset.renderKey = 'mounted'"));
  assert.ok(globeSource.includes('size.width <= 1 || size.height <= 1'));
  assert.ok(globeSource.includes('globalFleetGlobeDiagnostics'));
  assert.ok(globeSource.includes('mapboxTokenRequired: false'));
  assert.ok(globeSource.includes("typeof ResizeObserver !== 'undefined'"));
  assert.ok(globeSource.includes('globalFleetGlobeLastError'));
});

test('all maps render independent AIS tactical vectors without heatmaps', () => {
  assert.ok(globeSource.includes('.customLayerData([])'));
  assert.ok(globeSource.includes('new THREE.ConeGeometry'));
  assert.ok(globeSource.includes('color: COMMERCIAL_VESSEL_COLOR'));
  assert.ok(globeSource.includes('renderVesselLayer(view, view.vessels)'));
  assert.ok(globeSource.includes('.arcDashAnimateTime(2600)'));
  assert.doesNotMatch(globeSource, /ColumnLayer|TextLayer|ScatterplotLayer|heatmap|cluster|htmlElementsData/i);
});

test('Globe engine uses the requested earth textures atmosphere and camera', () => {
  assert.ok(globeSource.includes('earth-blue-marble.jpg'));
  assert.ok(globeSource.includes('earth-topology.png'));
  assert.ok(globeSource.includes(".atmosphereColor('#39D7E8')"));
  assert.ok(globeSource.includes('.atmosphereAltitude(0.16)'));
  assert.ok(globeSource.includes('lat: 24, lng: -24, altitude: 2.5'));
  assert.ok(globeSource.includes('dampingFactor = 0.08'));
  assert.ok(globeSource.includes('autoRotateSpeed = 0.45'));
});

test('Globe pauses automatic rotation on direct interaction', () => {
  assert.match(globeSource, /\.onCustomLayerClick\(\(vessel\) => handleVesselClick\(view, vessel\)\)/);
  assert.match(globeSource, /function handleVesselClick\(view, vessel\)[\s\S]*setAutoRotate\(false, view\.key\)/);
  assert.ok(globeSource.includes("view.controls.addEventListener?.('start', view.handleInteractionStart)"));
  assert.ok(globeSource.includes("view.container.addEventListener('pointerdown', view.handleContainerPointerDown)"));
  assert.ok(globeSource.includes('view.handleInteractionStart = () => setAutoRotate(false, key)'));
});

test('Globe stops its camera controller immediately when a route is calculated or drawn', () => {
  assert.ok(globeSource.includes('view.controls.autoRotate = shouldRotate'));
  assert.ok(globeSource.includes('view.controls.update?.()'));
  assert.ok(globeSource.includes('if (view.routePaths.length) setAutoRotate(false, key)'));
  assert.match(indexSource, /async function applyMapRouteToCalculator[\s\S]*?stopRouteGlobeRotation\(\);[\s\S]*?await [\s\S]*?stopRouteGlobeRotation\(\);/);
  assert.ok(indexSource.includes("window.GlobalFleetGlobe.setAutoRotate(false, 'main')"));
  assert.ok(indexSource.includes("window.GlobalFleetGlobe.setAutoRotate(false, 'density')"));
});

test('Globe exposes an accessible manual Play Pause control', () => {
  assert.ok(globeSource.includes("button.className = 'global-fleet-rotation-toggle'"));
  assert.ok(globeSource.includes('toggleAutoRotate(view.key)'));
  assert.ok(globeSource.includes("button.setAttribute('aria-pressed', String(isActive))"));
  assert.ok(globeSource.includes("Pausar rotación automática"));
  assert.ok(globeSource.includes("Reanudar rotación automática"));
  assert.ok(globeSource.includes('setAutoRotate(true, key)'));
  assert.ok(globeCssSource.includes('.global-fleet-rotation-toggle {'));
  assert.ok(globeCssSource.includes('z-index: 8;'));
  assert.match(globeCssSource, /.global-fleet-rotation-toggle:focus-visible/);
});

test('Globe renders an orange ballast path and preserves the cyan laden path', () => {
  assert.ok(globeSource.includes("PATH_STYLE = Object.freeze({ color: '#00FFFF', width: 2, simplify: true })"));
  assert.ok(globeSource.includes("BALLAST_PATH_COLOR = '#F59E0B'"));
  assert.ok(globeSource.includes('.arcsData([])'));
  assert.ok(globeSource.includes('.pathsData(renderableRoutePaths)'));
  assert.ok(globeSource.includes('prepareRoutePoints(routes?.ballast, ballast, pol)'));
  assert.ok(globeSource.includes('prepareRoutePoints(routes?.laden, pol, pod)'));
  assert.ok(globeSource.includes('view.routePaths = [ballastPath, maritimePath].filter((path) => path.length > 1)'));
  assert.ok(globeSource.includes("coordinates?.routeType === 'ballast' ? BALLAST_PATH_COLOR : PATH_STYLE.color"));
  assert.ok(globeSource.includes('.pathStroke(() => PATH_STYLE.width)'));
  assert.ok(indexSource.includes('.map-route-legend .ballast { --route-color: #F59E0B; }'));
  assert.ok(!globeSource.includes("type: 'line'"));
});

test('Globe omits ballast routing when the ballast port text is empty', () => {
  assert.ok(globeSource.includes("const ballastPort = typeof result?.portBallast === 'string' ? result.portBallast.trim() : ''"));
  assert.ok(globeSource.includes("const hasBallastPort = ballastPort !== '' && ballastPort !== 'TBA'"));
  assert.ok(globeSource.includes("{ ...(result?.coordinates || {}), ballast: null }"));
  assert.ok(globeSource.includes("{ ...(result?.routes || {}), ballast: null }"));
});

test('Globe filters invalid ballast geometry at the pathsData rendering boundary', () => {
  const helperStart = globeSource.indexOf('function applyRoutes(view)');
  const helperEnd = globeSource.indexOf('function saveGlobalRouteState', helperStart);
  const helperSource = globeSource.slice(helperStart, helperEnd);
  const applyRoutes = new Function('PATH_STYLE', 'BALLAST_PATH_COLOR', 'getTacticalLabels', `${helperSource}; return applyRoutes;`)(
    { color: '#00FFFF', width: 2 },
    '#F59E0B',
    view => view.portLabels
  );
  let renderedPaths = null;
  const globe = {};
  ['arcsData', 'pathPoints', 'pathPointLat', 'pathPointLng', 'pathPointAlt', 'pathColor', 'pathStroke', 'pathTransitionDuration', 'labelsData']
    .forEach((method) => { globe[method] = () => globe; });
  globe.pathsData = (paths) => {
    renderedPaths = paths;
    return globe;
  };
  const tbaBallast = [{ lat: 10, lng: 10 }, { lat: 20, lng: 20 }];
  tbaBallast.routeType = 'ballast';
  tbaBallast.ballastPortName = 'TBA ';
  const nullIslandBallast = [{ lat: 0, lng: 0 }, { lat: 20, lng: 20 }];
  nullIslandBallast.routeType = 'ballast';
  nullIslandBallast.ballastPortName = 'Puerto válido';
  const laden = [{ lat: 20, lng: 20 }, { lat: 30, lng: 30 }];
  laden.routeType = 'laden';

  applyRoutes({ globe, routePaths: [tbaBallast, nullIslandBallast, laden], portLabels: [] });

  assert.deepEqual(renderedPaths, [laden]);
});

test('Main map controls stay below the header and reset in fullscreen mode', () => {
  assert.match(indexSource, /\.map-control-stack\s*\{[\s\S]*?top:\s*82px;/);
  assert.match(indexSource, /body\.route-map-fullscreen \.map-control-stack\s*\{[\s\S]*?top:\s*18px;/);
});

test('Globe renders and restores white LASTRE, POL, and POD labels', () => {
  assert.match(globeSource, /function createPortLabel\(role, port, explicitName = ''\)/);
  assert.match(globeSource, /\^POS\\s\*-\\s\*/);
  assert.match(globeSource, /\^POL\\s\*-\\s\*/);
  assert.match(globeSource, /: role \+ ' · ' \+ name/);
  assert.match(globeSource, /\.labelColor\(\(\) => '#FFFFFF'\)/);
  assert.match(globeSource, /view\.portLabels = \[createPortLabel\('LASTRE'[\s\S]*createPortLabel\('POL'[\s\S]*createPortLabel\('POD'/);
  assert.match(globeSource, /function getTacticalLabels\(view\)[\s\S]*view\?\.portLabels/);
});

test('GlobalStore retains normalized port and maritime path state', () => {
  assert.ok(globeSource.includes('window.GlobalStore.globeRouteState'));
  assert.ok(globeSource.includes('saveGlobalRouteState(ports, view.routePaths, options?.ballastPortName)'));
  assert.ok(globeSource.includes('ballastPortName: String(ballastPortName'));
  assert.ok(globeSource.includes('restoreGlobalRouteState(view)'));
  assert.ok(globeSource.includes('applyTacticalLabels(view)'));
});

test('AIS normalization accepts nested payloads and rejects invalid coordinates', () => {
  assert.match(globeSource, /'vesselData'.*'source_payload'.*'ais'/);
  assert.ok(globeSource.includes('lat < -90 || lat > 90 || lng < -180 || lng > 180'));
  assert.ok(globeSource.includes('FOCUS_ALTITUDE = 1.8'));
  assert.ok(globeSource.includes('focusFirstVessel'));
});

test('vessel tooltip exposes name, distance, ETA, DWT, and IMO with safe fallbacks', () => {
  assert.match(globeSource, /function safeVesselTacticalLabel\(view, vessel\)/);
  assert.ok(globeSource.includes('Buque sin nombre'));
  assert.ok(globeSource.includes('IMO '));
  assert.ok(globeSource.includes('DWT '));
  assert.ok(globeSource.includes('Distancia al POL'));
  assert.ok(globeSource.includes('ETA al POL'));
  assert.match(globeSource, /\.customLayerLabel\(\(vessel\) => safeVesselTacticalLabel\(view, vessel\)\)/);
  assert.doesNotMatch(globeSource, /htmlElementsData|htmlElement\(/);
});

test('Data Bridge publishes its audit fleet through filteredVessels', () => {
  assert.match(dataBridgeSource, /filteredVessels: \[\]/);
  assert.match(dataBridgeSource, /setFilteredVessels\(vessels\)/);
  assert.match(dataBridgeSource, /window\.GlobalStore\.setFilteredVessels\(pendingAudits\)/);
  assert.match(dataBridgeSource, /id="databridge-map"/);
});

test('taxonomy changes reapply filters without clearing the global fleet', () => {
  const filterHandler = indexSource.slice(indexSource.indexOf("document.getElementById('fleet-intel-vessel-type')?.addEventListener('change'"), indexSource.indexOf("['cargo-type'", indexSource.indexOf("document.getElementById('fleet-intel-vessel-type')?.addEventListener('change'")));
  assert.match(filterHandler, /reapplyCentralFiltersAndRedraw\(\)/);
  assert.match(filterHandler, /getFilteredVessels\(\)/);
  assert.doesNotMatch(filterHandler, /resetAisDensityResults\(\)/);
});

test('matching delegates the unified triple-source query independently from the client radar array', () => {
  const executionStart = indexSource.indexOf('async function executeMatchingEngine');
  const executionEnd = indexSource.indexOf('window.runMatchingEngine = runMatchingEngine', executionStart);
  const executionSource = indexSource.slice(executionStart, executionEnd);
  assert.match(executionSource, /requestMatchingLocal\('execute', openShipsCandidates, payload\)/);
  assert.match(executionSource, /value: selectedVesselTaxonomies\.slice\(\)/);
  assert.match(executionSource, /values: selectedVesselTaxonomies\.slice\(\)/);
  assert.doesNotMatch(executionSource, /captureRadarSnapshotForFleetMatching\(\)/);
  assert.match(indexSource, /matching-source-integrity/);
  assert.match(indexSource, /Integridad verificada/);
});

test('live vessel endpoint rejects unbounded requests and persists only strict taxonomy matches', () => {
  assert.match(getVesselsFunctionSource, /source: "geofence-required"/);
  assert.match(getVesselsFunctionSource, /status: 400/);
  assert.match(getVesselsFunctionSource, /insidePolGeofence/);
  assert.match(getVesselsFunctionSource, /filterVesselsByTaxonomies\(completedLiveVessels, requestedTaxonomies\)/);
  assert.match(getVesselsFunctionSource, /persistVesselMessages\(acceptedLiveVessels\)/);
  assert.match(getVesselsFunctionSource, /forceLive \? acceptedLiveVessels/);
});

test('radar taxonomy selector exposes only four saved macro-categories', () => {
  assert.match(indexSource, /id="fleet-intel-taxonomy-options"/);
  assert.match(indexSource, /Guardar selección actual/);
  assert.match(indexSource, /ais_taxonomy_preset_v1/);
  assert.match(indexSource, /background: #FFFFFF !important/);
  assert.match(indexSource, /#fleet-intel-taxonomy-menu \{[\s\S]*?z-index: 9999 !important/);

  const selectorStart = indexSource.indexOf('<select id="fleet-intel-vessel-type"');
  const selectorEnd = indexSource.indexOf('</select>', selectorStart);
  const selectorSource = indexSource.slice(selectorStart, selectorEnd);
  assert.match(selectorSource, /<optgroup label="MACRO-CATEGORÍAS">[\s\S]*?<option value="category:cargo">Cargo<\/option>[\s\S]*?<option value="category:tanker">Tankers<\/option>[\s\S]*?<option value="category:passenger">Passengers<\/option>[\s\S]*?<option value="category:other">Others<\/option>/);
  assert.equal((selectorSource.match(/<option /g) || []).length, 4);
  assert.doesNotMatch(selectorSource, /value="type:/);
  assert.match(indexSource, /fleet-taxonomy-section-title/);
  assert.doesNotMatch(indexSource, /id="fleet-intel-listing-url"/);
  assert.doesNotMatch(indexSource, /id="btn-fleet-intel-capture"/);
  assert.match(indexSource, /getSelectedFleetTaxonomies\(\)/);
  assert.match(indexSource, /params\.set\('taxonomies', JSON\.stringify\(selectedTaxonomies\)\)/);
  assert.match(indexSource, /params\.set\('taxonomyMode', 'strict'\)/);
});

test('macro-categories retain broad in-memory subtype grouping', () => {
  assert.match(indexSource, /'category:cargo': \['bulk', 'general', 'container', 'cement', 'mpv', 'heavy_lift'\]/);
  assert.match(indexSource, /'category:tanker': \['crude_tanker', 'lng_tanker', 'chemical_tanker', 'product_tanker', 'lpg_tanker'\]/);
  assert.match(indexSource, /'category:passenger': \['passenger', 'cruise', 'ferry'\]/);
  assert.match(indexSource, /'category:other': \['offshore', 'tug', 'fishing'\]/);
  assert.match(indexSource, /if \(normalizedCategory\.startsWith\('category:'\)\) \{[\s\S]*return source\.filter\(vessel => matchesFleetTaxonomyCategory\(vessel, normalizedCategory\)\)/);
  assert.match(indexSource, /shipTypeCode >= 70 && shipTypeCode <= 79/);
  assert.match(indexSource, /shipTypeCode >= 80 && shipTypeCode <= 89/);
  assert.match(indexSource, /shipTypeCode >= 60 && shipTypeCode <= 69/);
});

test('fleet density and POL counters render positive ship type breakdowns from their exact arrays', () => {
  assert.match(indexSource, /id="ais-density-taxonomy-breakdown"/);
  assert.match(indexSource, /id="ais-pol-taxonomy-breakdown"/);
  assert.match(indexSource, /window\.groupAisVesselsByTaxonomy = function\(vessels\)/);
  assert.match(indexSource, /return \[\{ label: selectedLabels\.join\(' \+ '\), count: list\.length \}\]/);
  assert.match(indexSource, /window\.renderFilteredAisCounters\(primaryVisibleVessels\)/);
  assert.match(indexSource, /'ais-pol-taxonomy-breakdown',[\s\S]*?isAisWaitingForHydration \? \[\] : nearbyVessels/);
  assert.match(indexSource, /const breakdownTotal = groups\.reduce\(\(sum, group\) => sum \+ group\.count, 0\)/);
  assert.match(indexSource, /window\.resolveAisTaxonomyBreakdownSource = function\(targetCount\)/);
  assert.match(indexSource, /window\.syncAisTaxonomyBreakdowns = function\(\)/);
  assert.match(indexSource, /new MutationObserver\(scheduleBreakdownSync\)/);
  assert.match(indexSource, /window\.aisMatchingExecutionState = aisMatchingExecutionState/);
  assert.doesNotMatch(indexSource, /currentVessels\.length === total \? currentVessels : \[\]/);
});

test('taxonomy breakdown renderer produces visible totals for simulated fleet and POL arrays', () => {
  const blockStart = indexSource.indexOf('function readAisVesselDeclaredTaxonomyType');
  const blockEnd = indexSource.indexOf('function classifyBulkCarrierRealTime', blockStart);
  const breakdownSource = indexSource.slice(blockStart, blockEnd);
  class FakeNode {
    constructor(tag = '') {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.className = '';
      this.value = '';
    }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) {
      this.children.push(...(node?.isFragment ? node.children : [node]));
      return node;
    }
    replaceChildren(...nodes) {
      this.children = [];
      nodes.forEach(node => this.appendChild(node));
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) || null; }
    get textContent() { return this.value + this.children.map(child => child?.textContent || '').join(''); }
    set textContent(value) { this.value = String(value); this.children = []; }
  }
  const elements = new Map();
  const addElement = (id, text = '') => {
    const element = new FakeNode('div');
    element.textContent = text;
    elements.set(id, element);
    return element;
  };
  const densityBreakdown = addElement('ais-density-taxonomy-breakdown');
  densityBreakdown.setAttribute('aria-label', 'Desglose total');
  const polBreakdown = addElement('ais-pol-taxonomy-breakdown');
  polBreakdown.setAttribute('aria-label', 'Desglose POL');
  addElement('ais-density-count', '6');
  addElement('buques-count', '6');
  addElement('ais-nearby-vessels-badge', '3 buques');
  const documentMock = {
    getElementById: id => elements.get(id) || null,
    createDocumentFragment() { const node = new FakeNode(); node.isFragment = true; return node; },
    createElement: tag => new FakeNode(tag),
    createTextNode(text) { const node = new FakeNode('#text'); node.textContent = text; return node; }
  };
  const totalVessels = [
    { ship_type: 'Bulk Carrier' },
    { shipType: 'Handysize Bulk Carrier' },
    { vessel_type: 'Cement Carrier' },
    { ShipType: 'Multipurpose / MPP' },
    { ship_type: 'General Cargo' },
    { ship_type: 'Container Ship' }
  ];
  const windowMock = {
    getSelectedFleetTaxonomies: () => ['category:cargo'],
    getUnifiedMacroMatchingVessels: vessels => Array.isArray(vessels) ? vessels.filter(Boolean) : [],
    GlobalStore: {
      filteredVesselsInitialized: true,
      getFilteredVessels: () => totalVessels,
      polPrimaryVessels: totalVessels,
      getRawVessels: () => totalVessels,
      getVessels: () => totalVessels
    },
    aisMatchingExecutionState: { nearbyVessels: totalVessels.slice(0, 3) },
    addEventListener() {}
  };
  class MutationObserverMock { observe() {} }
  new Function('window', 'document', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', breakdownSource)(
    windowMock,
    documentMock,
    MutationObserverMock,
    () => 1,
    () => {},
  );
  const groups = windowMock.groupAisVesselsByTaxonomy(totalVessels);
  assert.deepEqual(groups, [{ label: 'Cargo', count: 6 }]);
  windowMock.renderAisTaxonomyBreakdown('ais-density-taxonomy-breakdown', totalVessels);
  windowMock.renderAisTaxonomyBreakdown('ais-pol-taxonomy-breakdown', totalVessels.slice(0, 3), { compact: true });
  assert.equal(densityBreakdown.dataset.total, '6');
  assert.equal(polBreakdown.dataset.total, '3');
  assert.match(densityBreakdown.textContent, /Cargo: 6/);
  assert.match(polBreakdown.textContent, /Cargo: 3/);
  assert.doesNotMatch(densityBreakdown.textContent, /Bulk|Cement|General|Container/);
});

test('filter endpoint reads the exact vesselType parameter and matches audit response shape', () => {
  assert.match(filterFunctionSource, /searchParams\.get\("vesselType"\)/);
  assert.doesNotMatch(filterFunctionSource, /searchParams\.get\("taxonomy"\)/);
  assert.match(filterFunctionSource, /auditStatus: "VALIDATED"/);
  assert.match(filterFunctionSource, /filterApplied: !degraded/);
  assert.match(filterFunctionSource, /status: degraded \? 206 : 200/);
  assert.match(filterFunctionSource, /count: vessels\.length,[\s\S]*vessels/);
});

test('Cost-Plus and negotiation consume the same global total cost basis', () => {
  const costPlusStart = indexSource.indexOf('function calculateCostPlusFreight()');
  const costPlusEnd = indexSource.indexOf('function setCostPlusMarginType', costPlusStart);
  const costPlusSource = indexSource.slice(costPlusStart, costPlusEnd);
  const syncStart = indexSource.indexOf('function syncCostPlusFromRoute');
  const syncEnd = indexSource.indexOf('function vesselHasScrubber', syncStart);
  const syncSource = indexSource.slice(syncStart, syncEnd);

  assert.match(indexSource, /costTotal: 0, totalCosts: 0/);
  assert.match(indexSource, /State\.totalCosts = isZeroCalculation \? 0 : adjustedCostTotal/);
  assert.match(indexSource, /const sharedTotalCosts = State\.totalCosts/);
  assert.match(indexSource, /netProfitOwner = isZeroCalculation \? 0 : \(voyageRevenues - sharedTotalCosts\)/);
  assert.match(costPlusSource, /const sharedCostBasis = getSharedVoyageCostBasis\(\)/);
  assert.match(costPlusSource, /if \(!sharedCostBasis \|\| !Number\.isFinite\(Number\(sharedCostBasis\?\.totalCosts\)\)\) return null/);
  assert.match(costPlusSource, /const totalCosts = sharedCostBasis\?\.totalCosts/);
  assert.doesNotMatch(costPlusSource, /totalOpex \+ bunkerCost \+ portCosts/);
  assert.match(syncSource, /if \(!sharedCostBasis \|\| !Number\.isFinite\(Number\(sharedCostBasis\?\.totalCosts\)\)\) return false/);
  assert.match(syncSource, /SeaCharterStore\.set\(\{[\s\S]*totalCosts: sharedCostBasis\?\.totalCosts/);
  assert.match(indexSource, /cost-plus-total-costs-breakdown/);
});

test('Cost-Plus projects margins and freight from the exact 291017 global cost', () => {
  const functionStart = indexSource.indexOf('function calculateCostPlusFreight()');
  const functionEnd = indexSource.indexOf('function setCostPlusMarginType', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const elements = new Map();
  const inputValues = {
    'cost-plus-daily-opex': 4500,
    'cost-plus-target-margin': 15,
    'cost-plus-days-sea': 10,
    'cost-plus-days-port': 4,
    'cost-plus-bunker-cost': 100000,
    'cost-plus-port-costs': 75000,
    'cost-plus-cargo-volume': 8000,
  };
  const context = {
    costPlusMarginType: 'percentage',
    State: {},
    readInverseTceNumber: (id) => inputValues[id] || 0,
    getSharedVoyageCostBasis: () => ({
      totalCosts: 291017,
      disclosure: 'Incluye posicionamiento, ETS. Misma base usada por Negociación.',
    }),
    roundCalculationMoney: (value) => Number(value.toFixed(2)),
    formatInverseTceMoney: (value) => `$${Math.round(value).toLocaleString('en-US')}`,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: '', classList: { toggle() {} } });
        return elements.get(id);
      },
    },
  };

  const calculateCostPlusFreight = Function(
    ...Object.keys(context),
    `${functionSource}; return calculateCostPlusFreight;`,
  )(...Object.values(context));
  const result = calculateCostPlusFreight();

  assert.equal(result.totalCosts, 291017);
  assert.equal(result.minFreightRate, 36.38);
  assert.equal(result.calculatedMargin, 43652.55);
  assert.equal(context.State.costPlusTotalCosts, 291017);
  assert.equal(elements.get('cost-plus-total-costs').textContent, '$291,017');
});

test('Cost-Plus Coaster strategy toggle dynamically updates title, price, disabled margin, and projected profit', () => {
  assert.match(indexSource, /id="cost-plus-strategy-costplus"/);
  assert.match(indexSource, /id="cost-plus-strategy-market"/);
  assert.match(indexSource, /id="cost-plus-box-title"/);
  assert.match(indexSource, /id="cost-plus-target-margin-container"/);

  const calcStart = indexSource.indexOf('function calculateCostPlusFreight()');
  const calcEnd = indexSource.indexOf('const VESSEL_PRICING_CLASSES', calcStart);
  const calcCode = indexSource.slice(calcStart, calcEnd).trim();

  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, { textContent: '', disabled: false, value: '0', classList: { add() {}, remove() {}, toggle() {} } });
    }
    return elements.get(id);
  };
  getEl('cost-plus-cargo-volume').value = '8000';
  getEl('cost-plus-target-margin').value = '15';

  const context = {
    costPlusMarginType: 'percentage',
    costPlusStrategy: 'cost-plus',
    State: {
      marketBenchmark: { rate: 25.52 }
    },
    readInverseTceNumber: (id) => {
      if (id === 'cost-plus-cargo-volume') return 8000;
      if (id === 'cost-plus-target-margin') return 15;
      return 0;
    },
    getSharedVoyageCostBasis: () => ({
      totalCosts: 142240,
      disclosure: 'Shared cost disclosure',
    }),
    roundCalculationMoney: (val) => Number(val.toFixed(2)),
    formatInverseTceMoney: (val) => `$${val.toFixed(2)}`,
    document: {
      getElementById: getEl
    }
  };

  const evalFunc = Function(
    'costPlusMarginType', 'costPlusStrategy', 'State', 'readInverseTceNumber', 'getSharedVoyageCostBasis', 'roundCalculationMoney', 'formatInverseTceMoney', 'document',
    `${calcCode}; return { calculateCostPlusFreight, setCostPlusStrategy };`
  )(
    context.costPlusMarginType, context.costPlusStrategy, context.State, context.readInverseTceNumber, context.getSharedVoyageCostBasis, context.roundCalculationMoney, context.formatInverseTceMoney, context.document
  );

  // 1. Test Cost-Plus Strategy
  evalFunc.setCostPlusStrategy('cost-plus');
  let result = evalFunc.calculateCostPlusFreight();

  assert.equal(getEl('cost-plus-box-title').textContent, 'FLETE MÍNIMO COST-PLUS');
  assert.equal(getEl('cost-plus-target-margin').disabled, false);
  // Total costs = 142,240, 15% margin = 21,336 -> target revenue = 163,576. Unit rate = 163,576 / 8000 = 20.45
  // Projected profit = (20.45 * 8000) - 142,240 = 163,600 - 142,240 = 21,360
  assert.equal(result.selectedFreightRate, 20.45);
  assert.equal(result.projectedProfit, 21360);

  // 2. Test Market Strategy
  evalFunc.setCostPlusStrategy('market');
  result = evalFunc.calculateCostPlusFreight();

  assert.equal(getEl('cost-plus-box-title').textContent, 'FLETE OBJETIVO MERCADO');
  assert.equal(getEl('cost-plus-target-margin').disabled, true);
  assert.equal(result.selectedFreightRate, 25.52);
  // Net profit = (25.52 * 8000) - 142,240 = 204,160 - 142,240 = 61,920
  assert.equal(result.projectedProfit, 61920);
  assert.equal(getEl('cost-plus-calculated-margin').textContent, '$61920.00');
});

test('voyage reference is moved to top navigation header and the print backup card is removed', () => {
  const headerStart = indexSource.indexOf('<header class="app-header');
  const headerEnd = indexSource.indexOf('</header>', headerStart);
  const headerMarkup = indexSource.slice(headerStart, headerEnd);
  const estimatorStart = indexSource.indexOf('<div id="view-estimator"');
  const estimatorEnd = indexSource.indexOf('<!-- MÓDULO 5: CUMPLIMIENTO CBAM', estimatorStart);
  const estimatorMarkup = indexSource.slice(estimatorStart, estimatorEnd);

  const quickReferencePosition = headerMarkup.indexOf('id="quick-ref"');

  assert.ok(quickReferencePosition > 0);
  assert.equal((indexSource.match(/id="quick-ref"/g) || []).length, 1);
  assert.doesNotMatch(estimatorMarkup, /Impresión y Respaldo de Cotizaciones/);
  assert.match(estimatorMarkup, /10\. SIMULADOR DE NEGOCIACIÓN Y CONTRAOFERTAS/i);
});

test('charterer negotiation simulator calculates spread, savings, and viability against break-even', () => {
  const functionStart = indexSource.indexOf('function updateChartererNegotiationSimulator()');
  const functionEnd = indexSource.indexOf('window.updateChartererNegotiationSimulator', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const elements = new Map();
  const createElement = (overrides = {}) => ({
    value: '',
    textContent: '',
    className: '',
    dataset: {},
    style: {},
    classList: { toggle() {} },
    ...overrides,
  });

  elements.set('negotiation-owner-offer', createElement({ value: '40', dataset: { userEdited: 'true' } }));
  elements.set('negotiation-charterer-target', createElement({ value: '35', dataset: { userEdited: 'true' } }));
  elements.set('cargo-qty', createElement({ value: '10000' }));
  elements.set('comm-pct', createElement({ value: '2.5' }));
  elements.set('negotiation-safety-factor', createElement({ value: '0' }));
  elements.set('pda-pol', createElement({ value: '20000' }));
  elements.set('pda-pod', createElement({ value: '30000' }));
  elements.set('opex-daily', createElement({ value: '2800' }));
  elements.set('quick-ref', createElement({ value: 'RDM/GC/2026-0716-TEST' }));
  elements.set('res-breakeven', createElement({ textContent: '$32.00' }));
  [
    'negotiation-spread-pmt',
    'negotiation-spread-caption',
    'negotiation-total-savings',
    'negotiation-cargo-caption',
    'negotiation-break-even',
    'negotiation-target-delta',
    'negotiation-viability-card',
    'negotiation-viability-dot',
    'negotiation-viability-meter',
    'negotiation-viability-message',
    'negotiation-owner-tce',
    'negotiation-target-tce',
    'negotiation-ai-suggestion',
    'negotiation-friction-limit',
    'negotiation-vessel-sync-title',
    'negotiation-fuel-strategy',
    'negotiation-navigation-summary',
    'negotiation-days-summary',
    'negotiation-contingency-summary',
    'negotiation-demurrage-summary',
    'negotiation-algorithmic-reference',
    'negotiation-safety-caption',
  ].forEach((id) => elements.set(id, createElement()));

  const context = {
    State: {
      breakEvenArmador: 32,
      cargo: 10000,
      daysSea: 10,
      daysPort: 5,
      commPct: 2.5,
      hasScrubber: true,
      navigationStrategy: 'eco',
      speedBallast: 10.5,
      speedLaden: 9.5,
      activeSeaFuel: 'IFO 380',
      activeSeaFuelPrice: 475,
      costBreakdown: { bunkers: 100000, pda: 50000 },
    },
    calculateNegotiationTce: ({ freightPerMt, cargoTons, commissionPct, bunkerTotal, portCostsTotal, extraVoyageCosts = 0, totalDays }) => {
      const grossRevenue = freightPerMt * cargoTons;
      const commissionCost = grossRevenue * (commissionPct / 100);
      const netRevenue = grossRevenue - commissionCost;
      const voyageCosts = bunkerTotal + portCostsTotal + extraVoyageCosts;
      return { grossRevenue, commissionCost, netRevenue, voyageCosts, totalDays, tceDaily: totalDays > 0 ? (netRevenue - voyageCosts) / totalDays : 0 };
    },
    calculateSuggestedNegotiationTarget: (breakEven) => Math.floor((breakEven * 1.05) * 100) / 100,
    calculateNegotiationAlgorithmicStress: ({ pdaPol, pdaPod, dailyOpex, totalDays, factorPct }) => {
      const multiplier = 1 + (factorPct / 100);
      const basePda = pdaPol + pdaPod;
      const baseOpex = dailyOpex * totalDays;
      const stressedPda = basePda * multiplier;
      const stressedOpex = baseOpex * multiplier;
      return {
        factorPct,
        multiplier,
        basePda,
        baseOpex,
        stressedPda,
        stressedOpex,
        pdaIncrement: stressedPda - basePda,
        opexIncrement: stressedOpex - baseOpex,
        totalIncrement: (stressedPda - basePda) + (stressedOpex - baseOpex),
      };
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
    },
  };
  const updateSimulator = Function(
    ...Object.keys(context),
    `${functionSource}; return updateChartererNegotiationSimulator;`,
  )(...Object.values(context));

  const viableResult = updateSimulator();
  assert.equal(viableResult.spreadPerMt, 5);
  assert.equal(viableResult.projectedSavings, 50000);
  assert.equal(viableResult.isViable, true);
  assert.equal(viableResult.ownerTceDaily, 16000);
  assert.equal(viableResult.targetTceDaily, 12750);
  assert.equal(viableResult.TargetSugerido, 33.6);
  assert.equal(elements.get('negotiation-total-savings').textContent, '$50,000');
  assert.equal(elements.get('negotiation-owner-tce').textContent, 'TCE Proyectado: $16,000 / día');
  assert.equal(elements.get('negotiation-target-tce').textContent, 'TCE Proyectado: $12,750 / día');
  assert.equal(elements.get('negotiation-ai-suggestion').textContent, 'Sugerencia IA: $33.60 / MT (Margen +5%)');
  assert.match(elements.get('negotiation-friction-limit').textContent, /\$33\.60/);
  assert.match(elements.get('negotiation-viability-message').textContent, /Target viable/);
  assert.match(elements.get('negotiation-vessel-sync-title').textContent, /ECO-SPEED · Scrubber activo/);
  assert.match(elements.get('negotiation-fuel-strategy').textContent, /IFO 380 · \$475 \/t/);
  assert.match(elements.get('negotiation-navigation-summary').textContent, /10\.5 \/ 9\.5 kn/);
  assert.match(elements.get('negotiation-days-summary').textContent, /15\.00 d/);
  assert.match(elements.get('negotiation-algorithmic-reference').textContent, /RDM\/GC\/2026-0716-TEST/);
  assert.match(elements.get('negotiation-contingency-summary').textContent, /PDA \$50,000 · OPEX \$2,800\/d/);

  elements.get('negotiation-charterer-target').value = '30';
  const rejectedResult = updateSimulator();
  assert.equal(rejectedResult.isViable, false);
  assert.equal(rejectedResult.targetDelta, -2);
  assert.match(elements.get('negotiation-viability-message').textContent, /Riesgo de rechazo/);

  elements.get('negotiation-charterer-target').value = '10';
  const negativeTceResult = updateSimulator();
  assert.equal(negativeTceResult.targetTceDaily, -3500);
  assert.match(elements.get('negotiation-target-tce').className, /text-red-700/);
});

test('negotiation simulator uses the light application design system', () => {
  const moduleStart = indexSource.indexOf('id="charterer-negotiation-simulator"');
  const moduleEnd = indexSource.indexOf('<!-- Acciones Finales -->', moduleStart);
  const moduleMarkup = indexSource.slice(moduleStart, moduleEnd);
  const logicStart = indexSource.indexOf('function updateChartererNegotiationSimulator()');
  const logicEnd = indexSource.indexOf('window.updateChartererNegotiationSimulator', logicStart);
  const simulatorLogic = indexSource.slice(logicStart, logicEnd);

  assert.match(moduleMarkup, /border border-slate-200 bg-white/);
  assert.match(moduleMarkup, /input-gc mono border-slate-300 bg-white/);
  assert.doesNotMatch(moduleMarkup, /bg-(?:slate|gray|stone|neutral|amber|emerald|red|cyan|indigo)-9\d\d/);
  assert.doesNotMatch(simulatorLogic, /bg-(?:slate|gray|stone|neutral|amber|emerald|red|cyan|indigo)-9\d\d/);
  assert.match(simulatorLogic, /text-emerald-700/);
  assert.match(simulatorLogic, /text-red-700/);
});

test('negotiation consumes vessel strategy, scrubber fuel, contingency, ETS, and demurrage from shared state', () => {
  const functionStart = indexSource.indexOf('function updateChartererNegotiationSimulator()');
  const functionEnd = indexSource.indexOf('window.updateChartererNegotiationSimulator', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd);
  const engineStart = indexSource.indexOf('function runEngine()');
  const engineEnd = indexSource.indexOf('function syncQuickRef', engineStart);
  const engineSource = indexSource.slice(engineStart, engineEnd);

  assert.match(engineSource, /const pSea = hasScrubber \? ifoPrice : vlsfoPrice/);
  assert.match(engineSource, /State\.navigationStrategy = navigationStrategy/);
  assert.match(engineSource, /State\.speedBallast = spdBal/);
  assert.match(engineSource, /State\.speedLaden = spdLaden/);
  assert.match(engineSource, /costPlusContingency\.totalCost \+ demurrageExposureCost/);
  assert.match(engineSource, /demurrageExposure: demurrageExposureCost/);
  assert.match(functionSource, /const extraVoyageCosts = demurrageExposureCost \+ etsCost \+ algorithmicStress\.pdaIncrement/);
  assert.match(functionSource, /extraVoyageCosts,/);
  assert.match(functionSource, /document\.getElementById\('pda-pol'\)/);
  assert.match(functionSource, /document\.getElementById\('pda-pod'\)/);
  assert.match(functionSource, /document\.getElementById\('opex-daily'\)/);
  assert.match(functionSource, /negotiation-safety-factor/);
  assert.match(functionSource, /Contingencia aplicada:/);
  assert.match(functionSource, /negotiation-navigation-summary/);
  assert.match(functionSource, /negotiation-demurrage-summary/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('id="charterer-negotiation-simulator"'), indexSource.indexOf('<!-- Acciones Finales -->')), /vessel-has-scrubber-choice/);
});

test('algorithmic negotiation stress multiplies PDA and voyage OPEX by the selected safety factor', () => {
  const functionStart = indexSource.indexOf('function calculateNegotiationAlgorithmicStress');
  const functionEnd = indexSource.indexOf('window.calculateNegotiationAlgorithmicStress', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const safeCalculationNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const calculateStress = Function(
    'safeCalculationNumber',
    `${functionSource}; return calculateNegotiationAlgorithmicStress;`,
  )(safeCalculationNumber);

  const result = calculateStress({
    pdaPol: 8675,
    pdaPod: 9375,
    dailyOpex: 2800,
    totalDays: 15,
    factorPct: 5,
  });

  assert.equal(result.basePda, 18050);
  assert.equal(result.stressedPda, 18952.5);
  assert.equal(result.baseOpex, 42000);
  assert.equal(result.stressedOpex, 44100);
  assert.equal(result.totalIncrement, 3002.5);
});

test('Cost-Plus contingency adds extra OPEX and average daily bunker cost', () => {
  const functionStart = indexSource.indexOf('function calculateCostPlusContingency');
  const functionEnd = indexSource.indexOf('window.calculateCostPlusContingency', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const safeCalculationNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const calculateContingency = Function(
    'safeCalculationNumber',
    `${functionSource}; return calculateCostPlusContingency;`,
  )(safeCalculationNumber);

  const result = calculateContingency({
    extraDays: 2,
    dailyOpex: 4500,
    totalBunkerCost: 25000,
    totalDays: 10,
  });

  assert.equal(result.dailyBunkerCost, 2500);
  assert.equal(result.opexCost, 9000);
  assert.equal(result.bunkerCost, 5000);
  assert.equal(result.totalCost, 14000);
  assert.match(indexSource, /cost-plus-contingency-days/);
  assert.match(indexSource, /costTotal \+ tugTotalCost \+ costPlusContingency\.totalCost/);
  assert.match(indexSource, /Cálculo estresado: Incluye/);
});

test('negotiation TCE excludes OPEX and CAPEX and applies commissions strictly', () => {
  const functionStart = indexSource.indexOf('function calculateNegotiationTce');
  const functionEnd = indexSource.indexOf('window.calculateNegotiationTce', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const safeCalculationNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const calculateTce = Function(
    'safeCalculationNumber',
    `${functionSource}; return calculateNegotiationTce;`,
  )(safeCalculationNumber);

  const result = calculateTce({
    freightPerMt: 40,
    cargoTons: 10000,
    commissionPct: 2.5,
    bunkerTotal: 100000,
    portCostsTotal: 50000,
    extraVoyageCosts: 5000,
    totalDays: 17,
  });

  assert.equal(result.grossRevenue, 400000);
  assert.equal(result.commissionCost, 10000);
  assert.equal(result.netRevenue, 390000);
  assert.equal(result.voyageCosts, 155000);
  assert.equal(Number(result.tceDaily.toFixed(2)), 13823.53);
  assert.match(indexSource, /negotiation-owner-tce/);
  assert.match(indexSource, /negotiation-target-tce/);
  assert.match(indexSource, /costBreakdown\.contingencyBunker/);
  assert.doesNotMatch(functionSource, /opex|capex/i);
});

test('suggested negotiation target applies the five percent psychological floor', () => {
  const functionStart = indexSource.indexOf('function calculateSuggestedNegotiationTarget');
  const functionEnd = indexSource.indexOf('window.calculateSuggestedNegotiationTarget', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  const safeCalculationNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const calculateSuggestedTarget = Function(
    'safeCalculationNumber',
    `${functionSource}; return calculateSuggestedNegotiationTarget;`,
  )(safeCalculationNumber);

  assert.equal(calculateSuggestedTarget(28.54), 29.96);
  assert.equal(calculateSuggestedTarget(32), 33.6);
  assert.equal(calculateSuggestedTarget(0), 0);
});

test('AI suggestion click fills target and recalculates negotiation immediately', () => {
  const functionStart = indexSource.indexOf('function applySuggestedNegotiationTarget()');
  const functionEnd = indexSource.indexOf('window.updateChartererNegotiationSimulator', functionStart);
  const functionSource = indexSource.slice(functionStart, functionEnd).trim();
  let recalculationCount = 0;
  let focusCount = 0;
  const targetInput = {
    value: '',
    dataset: {},
    focus() {
      focusCount += 1;
    },
  };
  const elements = new Map([
    ['negotiation-charterer-target', targetInput],
    ['res-breakeven', { textContent: '$28.54' }],
  ]);
  const context = {
    State: { breakEvenArmador: 28.54, negotiationSimulator: { TargetSugerido: 29.96 } },
    document: { getElementById: (id) => elements.get(id) || null },
    calculateSuggestedNegotiationTarget: (breakEven) => Math.floor((breakEven * 1.05) * 100) / 100,
    updateChartererNegotiationSimulator: () => {
      recalculationCount += 1;
    },
  };
  const applySuggestion = Function(
    ...Object.keys(context),
    `${functionSource}; return applySuggestedNegotiationTarget;`,
  )(...Object.values(context));

  assert.equal(applySuggestion(), true);
  assert.equal(targetInput.value, '29.96');
  assert.equal(targetInput.dataset.userEdited, 'true');
  assert.equal(recalculationCount, 1);
  assert.equal(focusCount, 1);
});

test('suggested floor reads break-even defensively without changing calculator state', () => {
  assert.match(indexSource, /id="negotiation-suggested-floor"[\s\S]*?Suelo Sugerido/);

  const scriptStart = indexSource.indexOf('(function initNegotiationSuggestedFloor()');
  const scriptEnd = indexSource.indexOf('</script>', scriptStart);
  const scriptSource = indexSource.slice(scriptStart, scriptEnd);

  function runSuggestedFloor(state) {
    const container = { hidden: true };
    const valueElement = { textContent: '' };
    const elements = new Map([
      ['negotiation-suggested-floor', container],
      ['negotiation-suggested-floor-value', valueElement],
    ]);
    const document = {
      readyState: 'complete',
      getElementById: id => elements.get(id) || null,
    };

    Function('State', 'document', 'MutationObserver', scriptSource)(state, document, undefined);
    return { container, valueElement, state };
  }

  const validState = { breakEvenArmador: 28.54 };
  const rendered = runSuggestedFloor(validState);
  assert.equal(rendered.container.hidden, false);
  assert.equal(rendered.valueElement.textContent, '$29.97 /MT');
  assert.deepEqual(rendered.state, validState);

  for (const breakEvenArmador of [null, undefined, '', Number.NaN]) {
    const missing = runSuggestedFloor({ breakEvenArmador });
    assert.equal(missing.container.hidden, true);
    assert.equal(missing.valueElement.textContent, '');
  }
});
