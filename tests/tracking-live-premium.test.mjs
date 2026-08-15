import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const netlifyConfigSource = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

const [indexSource, scriptSource, stylesSource, executiveSource, endpointSource, activeVoyageEndpointSource, vesselEndpointSource, routeEndpointSource, migrationSource, schemaSource, trackingStoreSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../calculator_view.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/DashboardExecutive.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/voyage-tracking.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/voyage-active.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-live-profile.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260803120000_create_voyages_tracking/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/stores/tracking-store.js', import.meta.url), 'utf8'),
]);

test('tracking header switches between GIS and the executive laytime dashboard', () => {
  assert.match(scriptSource, /import DashboardExecutive from '\.\/src\/components\/DashboardExecutive\.jsx'/);
  assert.match(scriptSource, /activeTab: 'gis'/);
  assert.match(scriptSource, /data-tracking-tab="gis"/);
  assert.match(scriptSource, /data-tracking-tab="executive"/);
  assert.match(scriptSource, /React\.createElement\(DashboardExecutive, \{ contractData:/);
  assert.match(scriptSource, /fetch\('\/api\/voyage\/active'/);
  assert.match(scriptSource, /activeVoyageLoading: false/);
  assert.match(scriptSource, /setTrackingFormLoading\(true\)/);
  assert.doesNotMatch(scriptSource, /RDM\/2026-0604|TEST VESSEL ALPHA|name: 'Bejaia'|name: 'Aveiro'/);
  assert.match(activeVoyageEndpointSource, /path: "\/api\/voyage\/active"/);
  assert.match(activeVoyageEndpointSource, /from\(voyagesTracking\)/);
  assert.doesNotMatch(scriptSource, /allowedHours: 72|demurrageRateUSD: 8500/);
  assert.match(scriptSource, /laytime: \{\}/);
  assert.match(scriptSource, /alerts: \[\]/);
  assert.match(scriptSource, /function unmountExecutiveDashboard/);
  assert.match(scriptSource, /trackingState\.executiveRoot\.unmount\(\)/);
  assert.match(executiveSource, /Dashboard Ejecutivo & Laytime/);
  assert.match(executiveSource, /min-h-full bg-\[#0B3040\] text-slate-100[^\n]*pb-16/);
  assert.match(executiveSource, /bg-white border border-slate-200/);
  assert.match(executiveSource, /text-cyan-600/);
  assert.match(executiveSource, /text-emerald-600/);
  assert.match(executiveSource, /Auditoría de Plancha & Tiempos de Puerto/);
  assert.doesNotMatch(executiveSource, /allowedHours: 72|datalastic-geofence|iot-performance/);
  assert.match(executiveSource, /Array\.isArray\(voyageData\?\.alerts\)/);
  assert.match(executiveSource, /if \(isLoading\) return <DashboardLoading \/>/);
  assert.match(executiveSource, /estimatedDemurrageUSD/);
  assert.match(stylesSource, /\.tracking-live-tab\.is-active/);
  assert.match(stylesSource, /\.tracking-executive-view[^}]*background: #0b3040/);
});

test('primary navigation exposes Tracking inside the shared application layout', () => {
  assert.match(indexSource, /\{ id: 'tracking', label: 'Tracking', presentation: 'module-overlay' \}/);
  assert.doesNotMatch(indexSource, /tracking-live\.css/);
  assert.match(indexSource, /tracking-live\.js/);
  assert.match(scriptSource, /overlay\.id = 'tracking-live-overlay'/);
  assert.match(scriptSource, /document\.querySelector\('main\.app-main'\)/);
  assert.doesNotMatch(scriptSource, /Maritime control room/i);
});

test('tracking open and close events synchronize the active header module', () => {
  assert.match(scriptSource, /CustomEvent\('tracking-live:open'\)/);
  assert.match(scriptSource, /CustomEvent\('tracking-live:close', \{ detail: \{ restoreNavigation \} \}\)/);
  assert.match(indexSource, /updateNavigationContext\('tracking'\)/);
  assert.match(indexSource, /document\.addEventListener\('tracking-live:close', restoreActiveViewNavigation\)/);
});

test('tracking uses a split GIS workspace with the complete commercial input', () => {
  assert.match(scriptSource, /Tracking contractual/);
  assert.match(scriptSource, /tracking-input-ballast/);
  assert.match(scriptSource, /tracking-input-pol/);
  assert.match(scriptSource, /tracking-input-pod/);
  assert.match(scriptSource, /tracking-input-laydays/);
  assert.match(scriptSource, /tracking-input-cancelling/);
  assert.match(scriptSource, /tracking-input-vessel/);
  assert.match(scriptSource, /tracking-input-cargo/);
  assert.match(scriptSource, /globeApi\.mount\?\./);
  assert.match(scriptSource, /calculateVoyageRouteService/);
  assert.match(scriptSource, /setRouteResult/);
  assert.match(scriptSource, /restoreRouteState: false/);
  assert.match(scriptSource, /persist: false/);
  assert.match(scriptSource, /bindUniversalPortAutocomplete/);
  assert.match(stylesSource, /\.tracking-input-drawer/);
  assert.match(stylesSource, /\.tracking-map-stage/);
});

test('tracking GIS HUD starts empty and supports voyage or basic AIS data', () => {
  assert.match(scriptSource, /<strong id="tracking-map-route-label"><\/strong>/);
  assert.match(scriptSource, /<span id="tracking-map-route-distance"><\/span>/);
  assert.match(scriptSource, /<article class="tracking-ais-card ecosystem-panel" id="tracking-ais-card" hidden aria-hidden="true">/);
  assert.match(scriptSource, /<strong id="tracking-ais-vessel"><\/strong>/);
  assert.match(scriptSource, /<span class="tracking-ais-details" id="tracking-ais-details"><\/span>/);
  assert.match(scriptSource, /<span id="tracking-ais-position"><\/span>/);
  assert.match(scriptSource, /<span class="tracking-ais-navigation" id="tracking-ais-navigation"><\/span>/);
  assert.match(scriptSource, /function setTrackingAisCardVisibility\(visible\)/);
  assert.match(scriptSource, /card\.hidden = !visible/);
  assert.match(scriptSource, /const hasVesselContext = hasTrackingVoyageData\(\) \|\| Boolean\(trackingState\.basicVessel\)/);
  assert.match(scriptSource, /if \(!hasVesselContext\) \{[\s\S]*tracking-ais-vessel'[\s\S]*textContent = ''/);
  assert.match(scriptSource, /const routeOrigin = pol\.name \|\| pol\.id \|\| ''/);
  assert.match(scriptSource, /const vesselName = contract\.vesselName \|\| trackingState\.activeVoyage\?\.vesselName \|\| 'Sin buque'/);
  assert.match(scriptSource, /Destino AIS:/);
  assert.doesNotMatch(scriptSource, /BEJAIA \(DZ\)|AVEIRO \(PT\)|TEST VESSEL ALPHA/);
});

test('tracking opens from DraftVoyage or free mode and never auto-fetches a contract', () => {
  const overlayStart = scriptSource.indexOf('function createTrackingOverlay()');
  const overlayEnd = scriptSource.indexOf('function toggleTrackingDrawer', overlayStart);
  const overlaySource = scriptSource.slice(overlayStart, overlayEnd);
  const openStart = scriptSource.indexOf('function openTrackingLive()');
  const openEnd = scriptSource.indexOf("window.addEventListener('vessel-selection:changed'", openStart);
  const openSource = scriptSource.slice(openStart, openEnd);
  const resetStart = scriptSource.indexOf('function resetTrackingViewState');
  const resetEnd = scriptSource.indexOf('function openTrackingLive()', resetStart);
  const resetSource = scriptSource.slice(resetStart, resetEnd);

  assert.ok(overlayStart >= 0 && overlayEnd > overlayStart);
  assert.doesNotMatch(overlaySource, /getActiveContractRef/);
  assert.match(overlaySource, /if \(contractInput\) contractInput\.value = ''/);
  assert.ok(openStart >= 0 && openEnd > openStart);
  assert.match(openSource, /resetTrackingViewState\(\{ mode: hasAuditDraft\(\) \? 'audit' : 'free' \}\)/);
  assert.doesNotMatch(openSource, /getActiveContractRef/);
  assert.doesNotMatch(openSource, /loadActiveVoyage|loadTrackingContract|fetch\(/);
  assert.match(resetSource, /trackingState\.contractRef = ''/);
  assert.match(resetSource, /trackingState\.data = null/);
  assert.match(resetSource, /trackingState\.basicVessel = null/);
  assert.match(resetSource, /trackingState\.routes = \{ ballast: \[\], laden: \[\] \}/);
  assert.match(resetSource, /trackingState\.activeVoyage = null/);
  assert.match(resetSource, /contractInput\.value = ''/);
  assert.match(scriptSource, /function closeTrackingLive[\s\S]*resetTrackingViewState\(\)/);
});

test('tracking supports contract lookup, live polling and detailed analytics', () => {
  assert.match(scriptSource, /\/api\/v1\/voyage\/tracking\/\$\{encodeURIComponent\(contractRef\)\}/);
  assert.match(scriptSource, /TRACKING_POLL_INTERVAL = 30_000/);
  assert.match(scriptSource, /Alertas en tiempo real/);
  assert.match(scriptSource, /Trazabilidad de punta a punta/);
  assert.match(scriptSource, /Asset Trail/);
  assert.match(scriptSource, /milestones\.map/);
  assert.match(scriptSource, /timeline\.map\(renderTrackingEvent\)/);
  assert.match(stylesSource, /\.tracking-stepper/);
  assert.match(stylesSource, /data-level="critical"/);
});

test('laytime fetching runs once per contract reference and stops after errors', () => {
  assert.match(scriptSource, /async function ensureLaytimeStatements\(data\)/);
  assert.match(scriptSource, /const contractRef = normalizeTrackingRef\(trackingState\.contractRef\)/);
  assert.match(scriptSource, /if \(!contractRef \|\| !\/\^\[A-Z0-9\]/);
  assert.match(scriptSource, /trackingState\.laytimeErrorRef === contractRef/);
  assert.match(scriptSource, /trackingState\.laytimeLoadedRef === contractRef/);
  assert.match(scriptSource, /trackingState\.laytimeRequestRef === contractRef/);
  assert.match(scriptSource, /const controller = new AbortController\(\)/);
  assert.match(scriptSource, /signal: controller\.signal/);
  assert.match(scriptSource, /if \(!response\.ok \|\| !payload\.success\) throw new Error/);
  assert.match(scriptSource, /trackingState\.laytimeErrorRef = contractRef/);
  assert.match(scriptSource, /function stopLaytimeRequest/);
  assert.match(scriptSource, /trackingState\.laytimeRequestController\?\.abort\(\)/);
  assert.match(scriptSource, /stopLaytimeRequest\(\);[\s\S]*stopTrackingVesselPolling\(\);/);
  assert.match(scriptSource, /TRACKING_POLL_INTERVAL = 30_000/);
  assert.match(scriptSource, /window\.clearInterval\(trackingState\.pollTimer\)/);
  assert.doesNotMatch(scriptSource, /async function loadLaytimeStatements/);
});

test('tracking exposes independent contract, audit and free triggers', () => {
  assert.match(scriptSource, /Referencia contractual <small>PREMIUM<\/small>/);
  assert.match(scriptSource, /Buque \/ IMO \/ MMSI <small>BÁSICO<\/small>/);
  assert.match(scriptSource, /function onSearchReference\(event\)/);
  assert.match(scriptSource, /function onSearchVessel\(event\)/);
  assert.match(scriptSource, /trackingState\.contractRef = ''/);
  assert.match(scriptSource, /trackingStore\.getState\(\)\.clearContract\(\)/);
  assert.match(scriptSource, /tracking-reference-search-form/);
  assert.match(scriptSource, /tracking-vessel-search-form/);
  assert.doesNotMatch(scriptSource, /contractLookupTimer = window\.setTimeout\(\(\) => loadTrackingContract/);
  assert.doesNotMatch(scriptSource, /vesselInput\?\.addEventListener\('input', scheduleTrackingVesselLookup\)/);
  assert.match(scriptSource, /function renderManualTrackingState/);
  assert.match(scriptSource, /Tracking Libre \/ Reset/);
  assert.match(stylesSource, /tracking-flow-status\[data-mode="contract"\]/);
  assert.match(stylesSource, /tracking-flow-status\[data-mode="audit"\]/);
  assert.match(stylesSource, /tracking-flow-status\[data-mode="free"\]/);
});

test('tracking routes the vessel profile API to its physical Netlify Function', () => {
  assert.match(netlifyConfigSource, /from = "\/api\/v1\/vessel\/live-profile"[\s\S]*to = "\/.netlify\/functions\/vessel-live-profile"/);
  assert.match(netlifyConfigSource, /from = "\/api\/v1\/\*"[\s\S]*to = "\/.netlify\/functions\/:splat"/);
});

test('tracking resolves vessel master and AIS without requiring a contract', () => {
  assert.match(scriptSource, /vesselLookupTimer/);
  assert.match(scriptSource, /function normalizeTrackingVesselQuery/);
  assert.match(scriptSource, /NOVI\b/);
  assert.match(scriptSource, /digits\.length === 7 \|\| digits\.length === 9/);
  assert.match(scriptSource, /payload.found === false/);
  assert.match(scriptSource, /TRACKING_AIS_POLL_INTERVAL = 30_000/);
  assert.match(scriptSource, /\/api\/v1\/vessel\/live-profile\?q=\$\{encodeURIComponent\(query\)\}/);
  assert.match(scriptSource, /function syncBasicVesselMap/);
  assert.match(scriptSource, /focusActiveVessel/);
  assert.match(scriptSource, /GlobalFleetGlobe\?\.updateVessels/);
  assert.match(scriptSource, /tracking-ais-navigation/);
  assert.match(scriptSource, /speedKnots/);
  assert.match(scriptSource, /course/);
  assert.match(scriptSource, /heading/);
  assert.doesNotMatch(scriptSource, /async function loadTrackingVessel\(rawQuery, silent = false\) \{\s*if \(!hasTrackingVoyageData\(\)\)/);
  assert.match(scriptSource, /Tracking Libre no calcula rutas/);
  assert.match(scriptSource, /Datalastic centra el mapa/);
});

test('tracking hydrates contractual fields and publishes changes through Zustand', () => {
  assert.match(scriptSource, /import \{ trackingStore \} from '\.\/src\/stores\/tracking-store\.js'/);
  assert.match(scriptSource, /function setContractFieldsReadOnly\(isReadOnly\)/);
  assert.match(scriptSource, /control\.readOnly = isReadOnly/);
  assert.match(scriptSource, /trackingStore\.getState\(\)\.hydrateContract\(payload\)/);
  assert.match(scriptSource, /bindTrackingStoreToGlobe/);
  assert.match(scriptSource, /trackingStore\.subscribe/);
  assert.match(scriptSource, /syncTrackingMap\(state\.contractPayload\)/);
  assert.match(trackingStoreSource, /createStore/);
  assert.match(trackingStoreSource, /mode: 'contract'/);
  assert.match(trackingStoreSource, /mode: 'free'/);
  assert.match(trackingStoreSource, /setMode/);
});

test('tracking keeps AIS and alert panels below the globe rotation control', () => {
  assert.match(stylesSource, /\.tracking-ais-card \{ top: 70px/);
  assert.match(stylesSource, /\.tracking-alerts-map-panel \{ top: 260px/);
  assert.match(stylesSource, /\.tracking-ais-navigation/);
});

test('tracking chrome follows the light MAPA visual system', () => {
  assert.match(scriptSource, /ecosystem-panel/);
  assert.match(scriptSource, /input-gc/);
  assert.match(scriptSource, /map-floating-panel/);
  assert.match(scriptSource, /btn-light-action/);
  assert.match(stylesSource, /Tracking GIS comparte el sistema visual claro de MAPA y Calculadora/);
  assert.match(stylesSource, /\.tracking-live-overlay[\s\S]*background: #f8fafc/);
  assert.doesNotMatch(stylesSource, /\.tracking-live-overlay[\s\S]*font-family/);
});

test('tracking reuses MAPA port search and maritime routing services', () => {
  assert.match(indexSource, /'tracking-input-ballast', 'tracking-input-pol', 'tracking-input-pod'/);
  assert.match(indexSource, /window\.bindUniversalPortAutocomplete = bindUniversalPortAutocomplete/);
  assert.match(indexSource, /window\.calculateVoyageRouteService = calculateVoyageRouteService/);
  assert.match(indexSource, /window\.findPortData = findPortData/);
  assert.match(scriptSource, /window\.calculateVoyageRouteService\(\{/);
  assert.match(scriptSource, /geocode: true/);
  assert.doesNotMatch(scriptSource, /async function fetchMaritimeRoute/);
});

test('contract route refresh hydrates shared stores and executive metrics', () => {
  assert.match(scriptSource, /async function requestTrackingMaritimeLeg\(origin, destination\)/);
  assert.match(scriptSource, /origin: \{ name: origin\.name, lat: origin\.lat, lon: origin\.lng \}/);
  assert.match(scriptSource, /destination: \{ name: destination\.name, lat: destination\.lat, lon: destination\.lng \}/);
  assert.match(scriptSource, /routeGeometry = asTrackingArray\(payload\?\.coordinates\)/);
  assert.match(scriptSource, /function syncTrackingRouteStores\(result\)/);
  assert.match(scriptSource, /window\.SeaCharterStore\?\.set\?\.\(\{/);
  assert.match(scriptSource, /voyageStore\.getState\(\)\.applyTrackingRoute\?\.\(\{/);
  assert.match(scriptSource, /routeGeometry: result/);
  assert.match(scriptSource, /liveRemainingDistanceNm > 0/);
  assert.match(scriptSource, /recalculatedDistanceNm > 0/);
  assert.match(scriptSource, /renderExecutiveDashboard\(\)/);
  assert.match(scriptSource, /console\.log\('Coordinates:', \{ origin, destination \}\)/);
  assert.match(scriptSource, /console\.log\('Routing Response:', payload\)/);
  assert.match(scriptSource, /const aisPosition = getBasicVesselPosition\(\)/);
  assert.match(scriptSource, /: contractBallast/);
  assert.match(scriptSource, /setOperationalMetrics\?\.\(\{/);
  assert.match(scriptSource, /await calculateTrackingRoute\(\{ focus: !silent, throwOnError: true \}\)/);
  assert.match(scriptSource, /if \(options\.throwOnError\) throw error/);
  assert.match(trackingStoreSource, /operationalMetrics: \{ \.\.\.EMPTY_OPERATIONAL_METRICS \}/);
  assert.match(trackingStoreSource, /setOperationalMetrics:/);
  assert.match(executiveSource, /useSyncExternalStore/);
  assert.match(executiveSource, /operationalMetrics\?\.totalDistanceNm/);
  assert.match(executiveSource, /operationalMetrics\?\.aisSpeedKnots/);
  assert.match(routeEndpointSource, /namespace: "maritime-routes-v2"/);
  assert.match(routeEndpointSource, /geojson: \{/);
  assert.match(routeEndpointSource, /type: "LineString"/);
  assert.match(routeEndpointSource, /coordinates: coordinates\.map\(\(\[lat, lon\]\) => \[lon, lat\]\)/);
});

test('pre-fixture tracking draws an ephemeral ballast route while free mode stays position-only', () => {
  assert.match(scriptSource, /normalizeAisDestination/);
  assert.match(scriptSource, /applyBasicAisDestination/);
  assert.match(scriptSource, /fetch\('\/api\/route'/);
  assert.match(scriptSource, /coordinateOrder: 'lonLat'/);
  assert.match(scriptSource, /ruta efímera/);
  assert.match(scriptSource, /routeKind === 'ballast'/);
  assert.match(scriptSource, /Tracking Libre solo geolocaliza/);
  assert.match(scriptSource, /DATALASTIC_REST_LIVE|Datalastic/);
  assert.doesNotMatch(scriptSource, /No hay un viaje activo en Neon para calcular la ruta/);
});

test('tracking endpoint uses the shared Postgres client and returns map and dashboard payloads', () => {
  assert.match(endpointSource, /import \{ db \} from "\.\.\/\.\.\/db\/index\.js"/);
  assert.match(endpointSource, /voyagesTracking/);
  assert.match(endpointSource, /path: "\/api\/v1\/voyage\/tracking\/\*"/);
  assert.match(endpointSource, /decodeURIComponent\(encodedParam\)/);
  assert.match(endpointSource, /if \(!name && !code\) return null/);
  assert.match(endpointSource, /lat: hasCoordinates \? latitude : null/);
  assert.match(endpointSource, /upper\(\$\{voyagesTracking\.contractRef\}\)/);
  assert.match(endpointSource, /contract:/);
  assert.match(endpointSource, /live:/);
  assert.match(endpointSource, /route:/);
  assert.match(endpointSource, /milestones:/);
  assert.match(endpointSource, /timeline:/);
  assert.doesNotMatch(endpointSource, /password|api_key|secret/i);
});

test('vessel live profile combines master data with the latest AIS position', () => {
  assert.match(vesselEndpointSource, /new WebSocketClient\(endpoint\)/);
  assert.match(vesselEndpointSource, /FiltersShipMMSI: \[mmsi\]/);
  assert.match(vesselEndpointSource, /AISSTREAM_LIVE/);
  assert.match(vesselEndpointSource, /liveFetchAttempted/);
  assert.match(vesselEndpointSource, /FROM vessels_master/);
  assert.match(vesselEndpointSource, /FROM ais_telemetry_buffer/);
  assert.match(vesselEndpointSource, /FROM ais_vessels/);
  assert.doesNotMatch(vesselEndpointSource, /fetched_at >= NOW\(\) - INTERVAL '24 hours'/);
  assert.match(vesselEndpointSource, /raw_data#>>'\{MetaData,IMO\}'/);
  assert.match(vesselEndpointSource, /masterPosition/);
  assert.match(vesselEndpointSource, /speed_over_ground/);
  assert.match(vesselEndpointSource, /course_over_ground/);
  assert.match(vesselEndpointSource, /telemetryLive/);
  assert.match(vesselEndpointSource, /"DATALASTIC_(?:REST_LIVE|BUFFER)"/);
  assert.match(vesselEndpointSource, /last_seen_at DESC/);
  assert.match(vesselEndpointSource, /positionSource/);
  assert.match(vesselEndpointSource, /found: false/);
  assert.match(vesselEndpointSource, /vessel: null/);
  assert.match(vesselEndpointSource, /lat: hasPosition/);
  assert.match(vesselEndpointSource, /lon: hasPosition/);
  assert.match(vesselEndpointSource, /speed:/);
  assert.match(vesselEndpointSource, /cog:/);
  assert.match(vesselEndpointSource, /timestamp: positionUpdatedAt/);
  assert.doesNotMatch(vesselEndpointSource, /status: 404/);
  assert.match(vesselEndpointSource, /path: "\/api\/v1\/vessel\/live-profile"/);
  assert.doesNotMatch(vesselEndpointSource, /(?:password|secret)\s*[:=]\s*["'][^"']+|APIKey:\s*["'][^"']+/i);
});

test('voyages_tracking schema persists GIS, AIS, commercial and audit data', () => {
  assert.match(schemaSource, /export const voyagesTracking = pgTable/);
  assert.match(schemaSource, /"voyages_tracking"/);
  assert.match(schemaSource, /ballastRoute: jsonb/);
  assert.match(schemaSource, /ladenRoute: jsonb/);
  assert.match(schemaSource, /alerts: jsonb/);
  assert.match(schemaSource, /assetTrail: jsonb/);
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS "voyages_tracking"/);
  assert.match(migrationSource, /voyages_tracking_contract_ref_unique_idx/);
  assert.match(migrationSource, /voyages_tracking_payloads_check/);
});
