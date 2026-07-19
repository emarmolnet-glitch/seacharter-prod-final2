import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('synchronization panel renders five horizontal telemetry blocks', () => {
  assert.match(source, /id="matching-sequential-status-console"[^>]*min-w-\[980px\][^>]*grid-cols-5/);
  assert.match(source, /id="matching-route-status-block"/);
  assert.match(source, /id="matching-laycan-status-block"/);
  assert.match(source, /id="matching-fleet-status-block"/);
  assert.match(source, /id="matching-execution-success-stick"/);
  assert.match(source, /id="matching-databridge-status-block"/);
});

test('telemetry renderer changes presentation classes without mutating application state', () => {
  const rendererStart = source.indexOf('function updateSequentialTelemetryBlock');
  const rendererEnd = source.indexOf("window.updateSequentialTelemetryBlock = updateSequentialTelemetryBlock", rendererStart);
  const rendererSource = source.slice(rendererStart, rendererEnd);
  assert.match(rendererSource, /block\.dataset\.telemetryState = state/);
  assert.match(rendererSource, /valueElement\.textContent = value/);
  assert.doesNotMatch(rendererSource, /fetch\s*\(|GlobalStore|SeaCharterStore|localStorage/);
});

test('route and laycan blocks listen to the existing SEA_ROUTE_DEFINED event', () => {
  const routeStart = source.indexOf("window.addEventListener('SEA_ROUTE_DEFINED'");
  const routeEnd = source.indexOf('function getCoreProMatchingRequestContext', routeStart);
  const routeSource = source.slice(routeStart, routeEnd);
  assert.match(routeSource, /'matching-route-status-block',[\s\S]*routeReady \? 'success' : 'pending'/);
  assert.match(routeSource, /'matching-laycan-status-block',[\s\S]*laycanReady \? 'success' : 'pending'/);
});

test('fleet telemetry consumes the derived filtered array and clean taxonomy labels', () => {
  assert.match(source, /window\.getFleetTaxonomyLabels = getFleetTaxonomyLabels/);
  assert.match(source, /window\.addEventListener\('ais:filtered-vessels-updated',[\s\S]*updateFleetTelemetryFromDerivedVessels/);
  assert.match(source, /const detailHasVessels = Array\.isArray\(detail\.vessels\)/);
  assert.match(source, /const vesselCount = vessels\.length/);
  assert.match(source, /'Cargo': 'Cargo',[\s\S]*'Tankers': 'Tankers',[\s\S]*'Passengers': 'Passengers',[\s\S]*'Others': 'Others'/);
  assert.match(source, /countSource: detailHasVessels \? 'derived-filter' : 'committed-selection'/);
  assert.doesNotMatch(source, /vesselCount = Math\.max\(0, Number\(event\?\.detail\?\.vesselCount\)/);
});

test('matching block consumes MATCHING_EXECUTION_SUCCESS', () => {
  assert.match(source, /window\.addEventListener\('MATCHING_EXECUTION_SUCCESS'/);
  assert.match(source, /`\$\{vessels\.length\} Buque\$\{vessels\.length === 1 \? '' : 's'\} en Caché`/);
});

test('Data Bridge send control stays disabled until matching has results', () => {
  assert.match(source, /id="commercial-nlp-send-btn"[^>]*disabled[^>]*aria-disabled="true"[^>]*data-databridge-transmission="true"/);
  assert.match(source, /function setDataBridgeTransmissionAvailability\(hasMatchingResults\)/);
  assert.match(source, /control\.disabled = !enabled/);
  assert.match(source, /setDataBridgeTransmissionAvailability\(vessels\.length > 0\)/);
  assert.match(source, /if \(matchingResultCount === 0\)[\s\S]*setDataBridgeTransmissionAvailability\?\.\(false\)[\s\S]*return/);
  assert.match(source, /setDataBridgeTransmissionAvailability\?\.\(currentMatchingResultCount > 0\)/);
});

test('Data Bridge telemetry exposes processing, success and network error states', () => {
  assert.match(source, /new CustomEvent\('DATABRIDGE_SYNC_STATUS', \{[\s\S]*state: 'processing'/);
  assert.match(source, /const visualSyncSucceeded = \[200, 201\]\.includes\(response\.status\)/);
  assert.match(source, /state: visualSyncSucceeded \? 'success' : 'error'/);
  assert.match(source, /state === 'processing'[\s\S]*'Enviando\.\.\.'/);
  assert.match(source, /state === 'success'[\s\S]*'Sincronizado'/);
  assert.match(source, /`Error de Red\$\{httpStatus \? ` \/ \$\{httpStatus\}` : ''\}`/);
  assert.match(source, /if \(response\.status !== 200 \|\| responsePayload\?\.success !== true/);
});

test('telemetry implementation adds no toast notifications', () => {
  const telemetryStart = source.indexOf('const SEQUENTIAL_TELEMETRY_STYLES');
  const telemetryEnd = source.indexOf('async function syncCoreProMatchingReport', telemetryStart);
  assert.doesNotMatch(source.slice(telemetryStart, telemetryEnd), /showToast\s*\(/);
});
