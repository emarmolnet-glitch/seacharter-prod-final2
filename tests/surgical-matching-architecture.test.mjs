import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const localMatchingSource = await readFile(new URL('../netlify/functions/matching-local.ts', import.meta.url), 'utf8');
const vesselsMasterSource = await readFile(new URL('../db/vessels-master.ts', import.meta.url), 'utf8');
const connectionStatusSource = await readFile(new URL('../public/ConnectionStatusBar.js', import.meta.url), 'utf8');

test('matching execution queries vessels_master without automatic radar fallback', () => {
  const executionStart = indexSource.indexOf('async function executeMatchingEngine');
  const executionEnd = indexSource.indexOf('window.runMatchingEngine = runMatchingEngine', executionStart);
  const executionSource = indexSource.slice(executionStart, executionEnd);

  assert.match(executionSource, /requestMatchingLocal\('execute', \[\], payload\)/);
  assert.match(executionSource, /No se encontraron coincidencias locales/);
  assert.match(executionSource, /Caché Validada/);
  assert.doesNotMatch(executionSource, /requestAiAisFilter|ai-ais-filter/);
  assert.doesNotMatch(executionSource, /radarSnapshot/);
  assert.doesNotMatch(executionSource, /await window\.fetchAisData/);
  assert.doesNotMatch(executionSource, /await window\.ejecutarBarridoAIS/);
  assert.doesNotMatch(executionSource, /await window\.executeAISSweep/);
});

test('local matching endpoint performs read-only exact lookup and audit suggestions', () => {
  assert.match(vesselsMasterSource, /FROM vessels_master/);
  assert.match(localMatchingSource, /listLocalVesselsMaster/);
  assert.match(localMatchingSource, /runAiAisFilter\(scoringRequest\)/);
  assert.match(localMatchingSource, /operation === "audit"/);
  assert.match(localMatchingSource, /createAuditSuggestions/);
  assert.match(localMatchingSource, /readOnly: true/);
  assert.doesNotMatch(localMatchingSource, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  assert.doesNotMatch(vesselsMasterSource, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
});

test('audit mode only processes unknown records and never replaces the fleet', () => {
  const auditStart = indexSource.indexOf('async function toggleMatchingAuditMode');
  const auditEnd = indexSource.indexOf('window.toggleMatchingAuditMode = toggleMatchingAuditMode', auditStart);
  const auditSource = indexSource.slice(auditStart, auditEnd);

  assert.match(auditSource, /window\.matchingLocalState\?\.unknown/);
  assert.match(auditSource, /requestMatchingLocal\('audit', unknown\)/);
  assert.match(auditSource, /renderMatchingAuditSuggestions/);
  assert.doesNotMatch(auditSource, /GlobalStore\.(rawVessels|vessels|matchingVessels)\s*=/);
});

test('route laycan and fleet telemetry stay pending before manual radar activation', () => {
  assert.match(indexSource, /function isExternalRadarSweepActivated\(\)/);
  assert.match(indexSource, /if \(!isExternalRadarSweepActivated\(\)\) \{[\s\S]*keepRadarSynchronizationPending\(\);[\s\S]*return;/);
  assert.match(indexSource, /Inactivo · requiere Barrido de Radar/);
  assert.match(indexSource, /manual-radar-sweep-required/);
});

test('continuous scan cannot initiate an external request', () => {
  const continuousStart = indexSource.indexOf('window.AISContinuousScan = async function()');
  const continuousEnd = indexSource.indexOf('window.escaneoContinuoAIS', continuousStart);
  const continuousSource = indexSource.slice(continuousStart, continuousEnd);

  assert.match(continuousSource, /isExternalRadarSweepActivated/);
  assert.doesNotMatch(continuousSource, /fetch\s*\(|fetchAisData|trigger-ais-sweep/);
});

test('LOCAL-ONLY interceptor blocks DataBridge and connection verification routes', () => {
  assert.match(indexSource, /LOCAL_ONLY: 'LOCAL-ONLY'/);
  assert.match(indexSource, /isCoreProBlockedNetworkRequest/);
  assert.match(indexSource, /databridge-/i);
  assert.match(indexSource, /verify-connection/);
  assert.match(indexSource, /trigger-ais-sweep/);
  assert.match(indexSource, /LOCAL_ONLY_NETWORK_BLOCKED/);

  const clickStart = indexSource.indexOf('async function handleMatchingExecutionClick');
  const clickEnd = indexSource.indexOf('window.handleMatchingExecutionClick', clickStart);
  const clickSource = indexSource.slice(clickStart, clickEnd);
  assert.ok(clickSource.indexOf('enforceLocalOnlyMatchingMode();') < clickSource.indexOf('getMatchingExecutionRouteOverride'));
});

test('manual radar sweep remains isolated behind an explicit button', () => {
  assert.match(indexSource, /id="btn-manual-radar-sweep"[^>]*onclick="ejecutarBarridoManual\(event\)"/);
  assert.match(indexSource, /window\.ejecutarBarridoManual = async function\(event = null\)/);
  assert.match(indexSource, /MANUAL_RADAR \|\| 'MANUAL-RADAR'/);
  assert.match(indexSource, /return window\.executeSweepAIS\(MANUAL_EXTERNAL_RADAR_SWEEP_TOKEN\)/);
});

test('connection status and contextual radar have no automatic network startup', () => {
  assert.match(connectionStatusSource, /label: "Inactivo"/);
  assert.doesNotMatch(connectionStatusSource, /useEffect|setInterval|fetch\s*\(|verifyConnection/);

  const contextualStart = indexSource.indexOf('window.scheduleContextualAisRadarRefresh = function()');
  const contextualEnd = indexSource.indexOf('window.getAisRouteReadiness', contextualStart);
  const contextualSource = indexSource.slice(contextualStart, contextualEnd);
  assert.match(contextualSource, /setAisRadarStatus\('inactive'\)/);
  assert.doesNotMatch(contextualSource, /setTimeout|fetch\s*\(|ejecutarRadarDualAIS|addEventListener/);
});

test('matching action dock groups the four primary controls on the left', () => {
  const dockStart = indexSource.indexOf('<div id="matching-action-dock"');
  const dockEnd = indexSource.indexOf('</div>', dockStart);
  const dockSource = indexSource.slice(dockStart, dockEnd);
  assert.match(dockSource, /id="btn-run-matching"/);
  assert.match(dockSource, /id="btn-manual-radar-sweep"/);
  assert.match(dockSource, /id="btnGenerateReport"/);
  assert.match(dockSource, /id="commercial-nlp-send-btn"/);
  assert.equal((indexSource.match(/id="commercial-nlp-send-btn"/g) || []).length, 1);
});

test('matching header uses one compact desktop row and standardized controls', () => {
  const styleStart = indexSource.indexOf('#matching-action-dock {');
  const styleEnd = indexSource.indexOf('#matching-results-panel .collapsible-section__chevron', styleStart);
  const styleSource = indexSource.slice(styleStart, styleEnd);
  assert.match(styleSource, /justify-content: flex-start/);
  assert.match(styleSource, /flex-wrap: nowrap/);
  assert.match(styleSource, /gap: 0\.75rem/);
  assert.match(styleSource, /\.matching-action-button \{[\s\S]*flex: 0 0 auto[\s\S]*padding: 0\.5rem 1rem !important[\s\S]*white-space: nowrap/);
  assert.match(styleSource, /matching-results-collapsible > \.collapsible-section__header \{[\s\S]*display: flex[\s\S]*flex-direction: row[\s\S]*flex-wrap: nowrap[\s\S]*align-items: center/);
  assert.match(styleSource, /\.collapsible-section__actions \{[\s\S]*flex-direction: row[\s\S]*flex-wrap: nowrap[\s\S]*align-items: center/);
});
