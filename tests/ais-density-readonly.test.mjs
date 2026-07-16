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
  assert.ok(globeSource.includes('cameraAltitude <= 0.45) return 0.060'));
  assert.ok(globeSource.includes('cameraAltitude >= 2.40) return 0.025'));
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

test('vessel tooltip exposes only name and DWT with safe fallbacks', () => {
  assert.ok(globeSource.includes('function getTooltip'));
  assert.ok(globeSource.includes('Buque sin nombre'));
  assert.ok(globeSource.includes('DWT no disponible'));
  assert.ok(globeSource.includes('.pointLabel(getTooltip)'));
  assert.match(globeCssSource, /\.global-fleet-tooltip strong \{[\s\S]*?color: #ffffff;[\s\S]*?text-shadow:/);
  assert.match(globeCssSource, /\.global-fleet-tooltip span \{[\s\S]*?color: #8fc7d0/);
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

test('live vessel endpoint rejects unbounded fleet requests and filters streamed positions', () => {
  assert.match(getVesselsFunctionSource, /source: "geofence-required"/);
  assert.match(getVesselsFunctionSource, /status: 400/);
  assert.match(getVesselsFunctionSource, /insidePolGeofence/);
  assert.match(getVesselsFunctionSource, /forceLive \? completedLiveVessels/);
});

test('filter endpoint reads the exact vesselType parameter and matches audit response shape', () => {
  assert.match(filterFunctionSource, /searchParams\.get\("vesselType"\)/);
  assert.doesNotMatch(filterFunctionSource, /searchParams\.get\("taxonomy"\)/);
  assert.match(filterFunctionSource, /auditStatus: "VALIDATED"/);
  assert.match(filterFunctionSource, /filterApplied: true/);
  assert.match(filterFunctionSource, /count: vessels\.length,[\s\S]*vessels/);
});
