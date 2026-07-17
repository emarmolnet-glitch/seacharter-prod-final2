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
  assert.match(indexSource, /audit-database-readonly/);
});

test('density map restores globally filtered vessels without refetching', () => {
  const tabInitialization = indexSource.slice(indexSource.indexOf("if(tabId === 'ais')"), indexSource.indexOf("} else if (typeof destroyAisMap"));
  assert.doesNotMatch(tabInitialization, /resetAisDensityResults\(\)/);
  assert.match(tabInitialization, /getFilteredVessels\(\)/);
  assert.match(tabInitialization, /updateAisMarkers\(persistedFilteredVessels\)/);
  assert.doesNotMatch(tabInitialization, /loadValidatedAisDensityVessels\(\)/);
});

test('density map disables live capture and pending polling on open', () => {
  assert.match(indexSource, /window\.aisDensityReadOnly = openingReadOnlyDensityMap/);
  assert.match(indexSource, /window\.MapLoader\.stopAisProxyPolling\(\)/);
  assert.match(indexSource, /reason: 'density-map-read-only'/);
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

test('read-only refresh button performs a GET instead of blocking the click', () => {
  assert.match(indexSource, /if \(window\.aisDensityReadOnly \|\| window\.matchingAuditModeState\?\.enabled\) \{[\s\S]*?return window\.executeReadOnlyAisRefresh\(\)/);
  assert.match(indexSource, /loadValidatedAisDensityVessels\(\{[\s\S]*?throwOnError: true,[\s\S]*?selectedTaxonomy[\s\S]*?\}\)/);
  assert.doesNotMatch(indexSource, /Mapa de Densidad está bloqueado en modo de solo lectura/);
  assert.doesNotMatch(indexSource, /querySelectorAll\('#btn-refresh-ais, #btn-search-closest-vessels, #btn-freeze-radar'\)/);
});

test('read-only response feeds rendering, counters, and freight calculation', () => {
  assert.match(indexSource, /const validatedVessels = Array\.isArray\(payload\.vessels\) \? payload\.vessels : \[\]/);
  assert.match(indexSource, /dispatchEvent\(new CustomEvent\('ais:vessels-updated'/);
  assert.match(indexSource, /aisDensityCount\.innerText = primaryVisibleVessels\.length/);
  assert.match(indexSource, /calculateAndDisplayAisFreight\(\)/);
});

test('vessel filter decodes text and uses a parameterized ILIKE query', () => {
  assert.match(filterFunctionSource, /decodeURIComponent\(/);
  assert.match(filterFunctionSource, /vessel_type ILIKE '%' \|\| \$9 \|\| '%'/);
  assert.match(filterFunctionSource, /distance_nm <= \$8/);
  assert.match(filterFunctionSource, /path: "\/api\/vessels-filter"/);
  assert.doesNotMatch(filterFunctionSource, /INSERT|UPDATE|DELETE/);
});

test('selected taxonomy is only loaded after an explicit read action', () => {
  assert.match(indexSource, /getAuditAisEndpoint\(selectedTaxonomy\)/);
  assert.match(indexSource, /executeReadOnlyAisRefresh/);
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
  assert.match(indexSource, /const renderableVessels = \(Array\.isArray\(vessels\)/);
  assert.match(indexSource, /GlobalFleetGlobe\.updateVessels\(renderableVessels, 'density'\)/);
  assert.doesNotMatch(indexSource, /const renderableVessels = \(hasLoadingPort/);
});

test('filtered AIS state is global and immediately redraws every globe', () => {
  assert.match(indexSource, /filteredVessels: \[\]/);
  assert.match(indexSource, /setFilteredVessels\(newFilteredVessels/);
  assert.match(indexSource, /ais:filtered-vessels-updated/);
  assert.ok(globeSource.includes("window.addEventListener('ais:filtered-vessels-updated', syncAllViews)"));
  assert.ok(globeSource.includes('views.forEach((view) => updateVessels(null, view.key))'));
  assert.ok(globeSource.includes('view.vessels = prepareVessels(getFilteredVessels())'));
});

test('Core PRO and Data Bridge share Globe.gl 2.46.1', () => {
  assert.ok(indexSource.includes('globe.gl@2.46.1/dist/globe.gl.min.js'));
  assert.ok(dataBridgeSource.includes('globe.gl@2.46.1/dist/globe.gl.min.js'));
  assert.ok(indexSource.includes('GlobalFleetGlobe.js'));
  assert.ok(dataBridgeSource.includes('GlobalFleetGlobe.js'));
  assert.ok(globeSource.includes('window.Globe({ animateIn: false, waitForGlobeReady: true })(container)'));
  assert.ok(globeSource.includes('window.GlobalFleetGlobe = globalFleetGlobe'));
  assert.ok(dataBridgeSource.includes("window.GlobalFleetGlobe?.mount({ key: 'bridge'"));
  assert.doesNotMatch(indexSource, /deck\.gl|map_view\.js/);
  assert.doesNotMatch(dataBridgeSource, /deck\.gl|map_view\.js/);
});

test('both globe views expose nested radar vessel details on hover', () => {
  assert.ok(globeSource.includes('.pointLabel(getTooltip)'));
  assert.match(globeSource, /function getTooltip\(vessel\) \{[\s\S]*?return `<div class="global-fleet-tooltip">/);
  assert.ok(globeSource.includes('.onPointHover((vessel) => {'));
  assert.ok(globeSource.includes("'radarData'"));
  assert.ok(globeSource.includes("'source_payload'"));
  assert.match(globeSource, /DWT · \$\{escapeHtml\(formatDwt\(vessel\?\.dwt\)\)\}/);
  assert.match(globeSource, /IMO · \$\{escapeHtml\(imo && imo !== 'N\/A' \? imo : 'IMO no disponible'\)\}/);
  assert.ok(globeSource.includes("'Buque sin nombre'"));
  assert.ok(globeSource.includes("'DWT no disponible'"));
});

test('globe hover styling increases raycast target and matches radar tooltip design', () => {
  assert.ok(globeSource.includes('POINT_HOVER_RADIUS_FACTOR = 1.45'));
  assert.ok(globeSource.includes('vessel === view.hoveredVessel ? view.pointRadius * POINT_HOVER_RADIUS_FACTOR'));
  assert.ok(globeSource.includes('if (cameraAltitude <= 0.45) return 0.075'));
  assert.match(globeCssSource, /\.global-fleet-tooltip \{[\s\S]*?border-radius: 7px;[\s\S]*?background: rgba\(4, 18, 34, 0\.92\);[\s\S]*?font-family: 'Inter'/);
  assert.match(globeCssSource, /\.global-fleet-tooltip strong \{[\s\S]*?color: #ffffff;[\s\S]*?font-weight: 800;[\s\S]*?text-transform: uppercase/);
  assert.match(globeCssSource, /\.global-fleet-tooltip span \{[\s\S]*?color: #32d6c3/);
});

test('Core PRO tooltip escapes map clipping and floats above interface overlays', () => {
  assert.match(globeCssSource, /\.global-fleet-globe \.scene-tooltip \{[\s\S]*?z-index: 9999 !important/);
  assert.match(globeCssSource, /#view-map #map-container,[\s\S]*?#view-ais #ais-map \{[\s\S]*?overflow: visible !important/);
  assert.ok(indexSource.includes('density-globe.css?v=20260716-radar-tooltip-visible'));
  assert.ok(dataBridgeSource.includes('density-globe.css?v=20260716-radar-tooltip-visible'));
});

test('custom point highlighting waits until native pointLabel handling completes', () => {
  assert.ok(globeSource.includes('function schedulePointInteractionStyle(view)'));
  assert.ok(globeSource.includes('view.hoverStyleFrameId = requestAnimationFrame(() => {'));
  assert.ok(globeSource.includes('schedulePointInteractionStyle(view)'));
  assert.doesNotMatch(globeSource, /\.onPointHover\(\(vessel\) => \{[\s\S]{0,180}applyPointInteractionStyle\(view\)/);
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

test('all maps render independent AIS points without heatmaps or fixed labels', () => {
  assert.ok(globeSource.includes('.pointsData(view.vessels)'));
  assert.ok(globeSource.includes("POINT_COLOR = 'rgba(0, 255, 255, 0.8)'"));
  assert.ok(globeSource.includes('POINT_ALTITUDE = 0.008'));
  assert.ok(globeSource.includes('cameraAltitude <= 0.45) return 0.075'));
  assert.ok(globeSource.includes('cameraAltitude >= 2.40) return 0.032'));
  assert.doesNotMatch(globeSource, /ColumnLayer|TextLayer|ScatterplotLayer|heatmap|cluster/i);
});

test('Globe engine uses the requested earth textures atmosphere and camera', () => {
  assert.ok(globeSource.includes('earth-blue-marble.jpg'));
  assert.ok(globeSource.includes('earth-topology.png'));
  assert.ok(globeSource.includes(".atmosphereColor('#39D7E8')"));
  assert.ok(globeSource.includes('.atmosphereAltitude(0.16)'));
  assert.ok(globeSource.includes('lat: 12, lng: -24, altitude: 2.15'));
  assert.ok(globeSource.includes('dampingFactor = 0.08'));
  assert.ok(globeSource.includes('autoRotateSpeed = 0.45'));
});

test('Globe pauses automatic rotation on direct interaction', () => {
  assert.ok(globeSource.includes('.onPointClick(() => setAutoRotate(false, key))'));
  assert.ok(globeSource.includes("view.controls.addEventListener?.('start', view.handleInteractionStart)"));
  assert.ok(globeSource.includes("view.container.addEventListener('pointerdown', view.handleContainerPointerDown)"));
  assert.ok(globeSource.includes('view.handleInteractionStart = () => setAutoRotate(false, key)'));
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

test('Globe renders only the cyan maritime POL to POD path', () => {
  assert.ok(globeSource.includes("PATH_STYLE = Object.freeze({ color: '#00FFFF', width: 2, simplify: true })"));
  assert.ok(globeSource.includes('.arcsData([])'));
  assert.ok(globeSource.includes('.pathsData(view.routePaths)'));
  assert.ok(globeSource.includes('prepareRoutePoints(routes?.laden, pol, pod)'));
  assert.ok(globeSource.includes('.pathColor(() => PATH_STYLE.color)'));
  assert.ok(globeSource.includes('.pathStroke(() => PATH_STYLE.width)'));
  assert.ok(!globeSource.includes('routes?.ballast'));
  assert.ok(!globeSource.includes('BALLAST_COLOR'));
  assert.ok(!globeSource.includes("type: 'line'"));
});

test('Globe restores white POL and POD labels', () => {
  assert.ok(globeSource.includes("createPortLabel('POL', ports?.pol)"));
  assert.ok(globeSource.includes("createPortLabel('POD', ports?.pod)"));
  assert.ok(globeSource.includes('.labelsData(view.portLabels)'));
  assert.ok(globeSource.includes(".labelColor(() => '#FFFFFF')"));
});

test('GlobalStore retains normalized port and maritime path state', () => {
  assert.ok(globeSource.includes('window.GlobalStore.globeRouteState'));
  assert.ok(globeSource.includes('saveGlobalRouteState(ports, view.routePaths)'));
  assert.ok(globeSource.includes('restoreGlobalRouteState(view)'));
  assert.ok(globeSource.includes('.pointsData(view.vessels)'));
});

test('AIS normalization accepts nested payloads and rejects invalid coordinates', () => {
  assert.match(globeSource, /'vesselData'.*'source_payload'.*'ais'/);
  assert.ok(globeSource.includes('lat < -90 || lat > 90 || lng < -180 || lng > 180'));
  assert.ok(globeSource.includes('FOCUS_ALTITUDE = 1.8'));
  assert.ok(globeSource.includes('focusFirstVessel'));
});

test('vessel tooltip exposes name, DWT, and IMO with safe fallbacks', () => {
  assert.ok(globeSource.includes('function getTooltip'));
  assert.ok(globeSource.includes('Buque sin nombre'));
  assert.ok(globeSource.includes('DWT no disponible'));
  assert.ok(globeSource.includes('.pointLabel(getTooltip)'));
  assert.match(globeCssSource, /\.global-fleet-tooltip strong \{[\s\S]*?color: #ffffff;[\s\S]*?text-shadow:/);
  assert.ok(globeSource.includes('IMO no disponible'));
  assert.match(globeCssSource, /\.global-fleet-tooltip span \{[\s\S]*?color: #32d6c3/);
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

test('matching consumes the exact global filtered array and reports exclusions', () => {
  assert.match(indexSource, /source: 'global_filtered_vessels'/);
  assert.match(indexSource, /vessels: JSON\.parse\(JSON\.stringify\(filteredStoreVessels\)\)/);
  assert.match(indexSource, /value: 'All'/);
  assert.match(indexSource, /matching-source-integrity/);
  assert.match(indexSource, /Integridad de flota verificada/);
});

test('live vessel endpoint rejects unbounded requests and persists only strict taxonomy matches', () => {
  assert.match(getVesselsFunctionSource, /source: "geofence-required"/);
  assert.match(getVesselsFunctionSource, /status: 400/);
  assert.match(getVesselsFunctionSource, /insidePolGeofence/);
  assert.match(getVesselsFunctionSource, /filterVesselsByTaxonomies\(completedLiveVessels, requestedTaxonomies\)/);
  assert.match(getVesselsFunctionSource, /persistVesselMessages\(acceptedLiveVessels\)/);
  assert.match(getVesselsFunctionSource, /forceLive \? acceptedLiveVessels/);
});

test('radar taxonomy selector supports multiple choices and a saved preset', () => {
  assert.match(indexSource, /id="fleet-intel-taxonomy-options"/);
  assert.match(indexSource, /Guardar selección actual/);
  assert.match(indexSource, /ais_taxonomy_preset_v1/);
  assert.match(indexSource, /background: #FFFFFF !important/);
  assert.match(indexSource, /#fleet-intel-taxonomy-menu \{[\s\S]*?z-index: 9999 !important/);
  assert.match(indexSource, /<optgroup label="CARGO">[\s\S]*?<option value="category:cargo">All Cargo<\/option>[\s\S]*?<option value="type:bulk">Bulk Carrier<\/option>[\s\S]*?<option value="type:general">General Cargo<\/option>[\s\S]*?<option value="type:container">Container Ship<\/option>[\s\S]*?<option value="type:cement">Cement Carrier<\/option>[\s\S]*?<option value="type:mpv">Multipurpose \/ MPP<\/option>[\s\S]*?<option value="type:heavy_lift">Heavy Lift<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(indexSource, /<optgroup label="TANKERS">[\s\S]*?<option value="category:tanker">All Tankers<\/option>[\s\S]*?<option value="type:crude_tanker">Crude Oil Tanker<\/option>[\s\S]*?<option value="type:lng_tanker">LNG Tanker<\/option>[\s\S]*?<option value="type:chemical_tanker">Chemical Tanker<\/option>[\s\S]*?<option value="type:product_tanker">Product Tanker<\/option>[\s\S]*?<option value="type:lpg_tanker">LPG Tanker<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(indexSource, /<optgroup label="PASSENGER">[\s\S]*?<option value="category:passenger">All Passenger<\/option>[\s\S]*?<option value="type:passenger">Passenger Ship<\/option>[\s\S]*?<option value="type:cruise">Cruise Ship<\/option>[\s\S]*?<option value="type:ferry">Ferry \/ RoPax<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(indexSource, /<optgroup label="OTHER">[\s\S]*?<option value="category:other">All Other<\/option>[\s\S]*?<option value="type:offshore">Offshore<\/option>[\s\S]*?<option value="type:tug">Tug \/ Support<\/option>[\s\S]*?<option value="type:fishing">Fishing<\/option>[\s\S]*?<\/optgroup>/);
  assert.match(indexSource, /fleet-taxonomy-section-title/);
  assert.doesNotMatch(indexSource, /id="fleet-intel-listing-url"/);
  assert.doesNotMatch(indexSource, /id="btn-fleet-intel-capture"/);
  assert.match(indexSource, /getSelectedFleetTaxonomies\(\)/);
  assert.match(indexSource, /params\.set\('taxonomies', JSON\.stringify\(selectedTaxonomies\)\)/);
  assert.match(indexSource, /params\.set\('taxonomyMode', 'strict'\)/);
});

test('fleet density and POL counters render positive ship type breakdowns from their exact arrays', () => {
  assert.match(indexSource, /id="ais-density-taxonomy-breakdown"/);
  assert.match(indexSource, /id="ais-pol-taxonomy-breakdown"/);
  assert.match(indexSource, /window\.groupAisVesselsByTaxonomy = function\(vessels\)/);
  assert.match(indexSource, /\.filter\(\(\[, count\]\) => count > 0\)/);
  assert.match(indexSource, /window\.renderAisTaxonomyBreakdown\('ais-density-taxonomy-breakdown', primaryVisibleVessels\)/);
  assert.match(indexSource, /'ais-pol-taxonomy-breakdown',[\s\S]*?isAisWaitingForHydration \? \[\] : nearbyVessels/);
  assert.match(indexSource, /const breakdownTotal = groups\.reduce\(\(sum, group\) => sum \+ group\.count, 0\)/);
  assert.match(indexSource, /window\.resolveAisTaxonomyBreakdownSource = function\(targetCount\)/);
  assert.match(indexSource, /window\.syncAisTaxonomyBreakdowns = function\(\)/);
  assert.match(indexSource, /new MutationObserver\(scheduleBreakdownSync\)/);
  assert.match(indexSource, /window\.aisMatchingExecutionState = aisMatchingExecutionState/);
  assert.doesNotMatch(indexSource, /currentVessels\.length === total \? currentVessels : \[\]/);
});

test('taxonomy breakdown renderer produces visible totals for simulated fleet and POL arrays', () => {
  const blockStart = indexSource.indexOf('const AIS_TAXONOMY_BREAKDOWN_ORDER');
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
    { ship_type: 'LNG Tanker' },
    { ship_type: 'Research vessel' }
  ];
  const windowMock = {
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
    () => {}
  );
  const groups = windowMock.groupAisVesselsByTaxonomy(totalVessels);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 6);
  assert.deepEqual(groups.find(group => group.label === 'Bulk Carrier'), { label: 'Bulk Carrier', count: 2 });
  windowMock.renderAisTaxonomyBreakdown('ais-density-taxonomy-breakdown', totalVessels);
  windowMock.renderAisTaxonomyBreakdown('ais-pol-taxonomy-breakdown', totalVessels.slice(0, 3), { compact: true });
  assert.equal(densityBreakdown.dataset.total, '6');
  assert.equal(polBreakdown.dataset.total, '3');
  assert.match(densityBreakdown.textContent, /Bulk Carrier: 2/);
  assert.match(polBreakdown.textContent, /Bulk: 2/);
});

test('filter endpoint reads the exact vesselType parameter and matches audit response shape', () => {
  assert.match(filterFunctionSource, /searchParams\.get\("vesselType"\)/);
  assert.doesNotMatch(filterFunctionSource, /searchParams\.get\("taxonomy"\)/);
  assert.match(filterFunctionSource, /auditStatus: "VALIDATED"/);
  assert.match(filterFunctionSource, /filterApplied: true/);
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
  assert.match(costPlusSource, /const totalCosts = sharedCostBasis\.totalCosts/);
  assert.doesNotMatch(costPlusSource, /totalOpex \+ bunkerCost \+ portCosts/);
  assert.match(syncSource, /SeaCharterStore\.set\(\{[\s\S]*totalCosts: sharedCostBasis\.totalCosts/);
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

test('voyage reference is moved to the left vessel card and the print backup card is removed', () => {
  const estimatorStart = indexSource.indexOf('<div id="view-estimator"');
  const estimatorEnd = indexSource.indexOf('<!-- MÓDULO 5: CUMPLIMIENTO CBAM', estimatorStart);
  const estimatorMarkup = indexSource.slice(estimatorStart, estimatorEnd);
  const vesselCardEnd = estimatorMarkup.indexOf('<!-- 3. Bunkers y Gastos -->');
  const quickReferencePosition = estimatorMarkup.indexOf('id="quick-ref"');

  assert.ok(quickReferencePosition > 0 && quickReferencePosition < vesselCardEnd);
  assert.equal((estimatorMarkup.match(/id="quick-ref"/g) || []).length, 1);
  assert.doesNotMatch(estimatorMarkup, /Impresión y Respaldo de Cotizaciones/);
  assert.match(estimatorMarkup, /5\. Simulador de Negociación y Contraofertas/);
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
