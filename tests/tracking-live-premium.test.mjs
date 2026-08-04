import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const netlifyConfigSource = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

const [indexSource, scriptSource, stylesSource, executiveSource, endpointSource, vesselEndpointSource, migrationSource, schemaSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../calculator_view.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/DashboardExecutive.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/voyage-tracking.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-live-profile.ts', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/database/migrations/20260803120000_create_voyages_tracking/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../db/schema.ts', import.meta.url), 'utf8'),
]);

test('tracking header switches between GIS and the executive laytime dashboard', () => {
  assert.match(scriptSource, /import DashboardExecutive from '\.\/src\/components\/DashboardExecutive\.jsx'/);
  assert.match(scriptSource, /activeTab: 'gis'/);
  assert.match(scriptSource, /data-tracking-tab="gis"/);
  assert.match(scriptSource, /data-tracking-tab="executive"/);
  assert.match(scriptSource, /React\.createElement\(DashboardExecutive, \{ contractData:/);
  assert.match(scriptSource, /reference: 'RDM\/2026-0604'/);
  assert.match(scriptSource, /name: 'NERMIN KARABEKIR'/);
  assert.match(scriptSource, /name: 'Bejaia'/);
  assert.match(scriptSource, /name: 'Aveiro'/);
  assert.match(scriptSource, /allowedHours: 72/);
  assert.match(scriptSource, /demurrageRateUSD: 8500/);
  assert.match(executiveSource, /Dashboard Ejecutivo & Laytime/);
  assert.match(executiveSource, /min-h-full bg-\[#0B3040\] text-slate-100[^\n]*pb-16/);
  assert.match(executiveSource, /bg-white border border-slate-200/);
  assert.match(executiveSource, /text-cyan-600/);
  assert.match(executiveSource, /text-emerald-600/);
  assert.match(executiveSource, /Auditoría de Plancha & Tiempos de Puerto/);
  assert.match(executiveSource, /allowedHours: 72/);
  assert.match(executiveSource, /estimatedDemurrageUSD/);
  assert.match(stylesSource, /\.tracking-live-tab\.is-active/);
  assert.match(stylesSource, /\.tracking-executive-view[^}]*background: #0b3040/);
});

test('primary navigation exposes Tracking as an integrated dialog module', () => {
  assert.match(indexSource, /\{ id: 'tracking', label: 'Tracking', presentation: 'dialog' \}/);
  assert.doesNotMatch(indexSource, /tracking-live\.css/);
  assert.match(indexSource, /tracking-live\.js/);
  assert.match(scriptSource, /overlay\.id = 'tracking-live-overlay'/);
});

test('tracking open and close events synchronize the active header module', () => {
  assert.match(scriptSource, /CustomEvent\('tracking-live:open'\)/);
  assert.match(scriptSource, /CustomEvent\('tracking-live:close'\)/);
  assert.match(indexSource, /updateNavigationContext\('tracking'\)/);
  assert.match(indexSource, /document\.addEventListener\('tracking-live:close', restoreActiveViewNavigation\)/);
});

test('tracking uses a split GIS workspace with the complete commercial input', () => {
  assert.match(scriptSource, /Input geográfico/);
  assert.match(scriptSource, /tracking-input-ballast/);
  assert.match(scriptSource, /tracking-input-pol/);
  assert.match(scriptSource, /tracking-input-pod/);
  assert.match(scriptSource, /tracking-input-laydays/);
  assert.match(scriptSource, /tracking-input-cancelling/);
  assert.match(scriptSource, /tracking-input-vessel/);
  assert.match(scriptSource, /tracking-input-cargo/);
  assert.match(scriptSource, /GlobalFleetGlobe\.mount/);
  assert.match(scriptSource, /calculateVoyageRouteService/);
  assert.match(scriptSource, /setRouteResult/);
  assert.match(scriptSource, /restoreRouteState: false/);
  assert.match(scriptSource, /persist: false/);
  assert.match(scriptSource, /bindUniversalPortAutocomplete/);
  assert.match(stylesSource, /\.tracking-input-drawer/);
  assert.match(stylesSource, /\.tracking-map-stage/);
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

test('tracking keeps route calculation available without a contract', () => {
  assert.match(scriptSource, /Referencia contractual <small>OPCIONAL<\/small>/);
  assert.match(scriptSource, /function renderManualTrackingState/);
  assert.match(scriptSource, /if \(!contractRef\)/);
  assert.match(scriptSource, /if \(!trackingState\.data\) renderManualTrackingState\(totalDistance\)/);
  assert.match(scriptSource, /Modo Ruta Libre/);
  assert.match(scriptSource, /Vincula un contrato para activar alertas operativas/);
  assert.doesNotMatch(scriptSource, /Sin contrato sincronizado/);
});

test('tracking routes the vessel profile API to its physical Netlify Function', () => {
  assert.match(netlifyConfigSource, /from = "\/api\/v1\/vessel\/live-profile"[\s\S]*to = "\/.netlify\/functions\/vessel-live-profile"/);
  assert.match(netlifyConfigSource, /from = "\/api\/v1\/\*"[\s\S]*to = "\/.netlify\/functions\/:splat"/);
});

test('tracking resolves vessel master and AIS without a contract', () => {
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
  assert.match(scriptSource, /consulta básica del buque funcionan sin contrato/);
  assert.doesNotMatch(scriptSource, /AIS disponible al vincular contrato/);
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

test('tracking endpoint uses the shared Postgres client and returns map and dashboard payloads', () => {
  assert.match(endpointSource, /import \{ db \} from "\.\.\/\.\.\/db\/index\.js"/);
  assert.match(endpointSource, /voyagesTracking/);
  assert.match(endpointSource, /path: "\/api\/v1\/voyage\/tracking\/\*"/);
  assert.match(endpointSource, /decodeURIComponent\(encodedParam\)/);
  assert.match(endpointSource, /upper\(\$\{voyagesTracking\.contractRef\}\)/);
  assert.match(endpointSource, /contract:/);
  assert.match(endpointSource, /live:/);
  assert.match(endpointSource, /route:/);
  assert.match(endpointSource, /milestones:/);
  assert.match(endpointSource, /timeline:/);
  assert.doesNotMatch(endpointSource, /password|api_key|secret/i);
});

test('vessel live profile combines master data with the latest AIS position', () => {
  assert.match(vesselEndpointSource, /FROM vessels_master/);
  assert.match(vesselEndpointSource, /FROM ais_telemetry_buffer/);
  assert.match(vesselEndpointSource, /FROM ais_vessels/);
  assert.match(vesselEndpointSource, /fetched_at >= NOW\(\) - INTERVAL '24 hours'/);
  assert.match(vesselEndpointSource, /speed_over_ground/);
  assert.match(vesselEndpointSource, /course_over_ground/);
  assert.match(vesselEndpointSource, /telemetryLive/);
  assert.match(vesselEndpointSource, /"OPENSHIPS"/);
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
  assert.doesNotMatch(vesselEndpointSource, /password|api_key|secret/i);
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
