import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, endpointSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/databridge-vessel-search.ts', import.meta.url), 'utf8'),
]);

test('AIS selection hydrates the calculator from Data Bridge before publishing the selection', () => {
  const selectionStart = indexSource.indexOf('window.selectShip = function');
  const selectionEnd = indexSource.indexOf('window.contactShipowner', selectionStart);
  const selectionSource = indexSource.slice(selectionStart, selectionEnd);

  assert.match(indexSource, /async function hydrateSelectedVesselFromDataBridge/);
  assert.match(indexSource, /async function fetchDataBridgeVesselProfile/);
  assert.match(indexSource, /const lookup = imo\.length === 7 \? imo : \(mmsi\.length === 9 \? mmsi : ''\)/);
  assert.match(indexSource, /fetch\('\/api\/databridge-vessel-search'/);
  assert.ok(selectionSource.indexOf('await hydrateSelectedVesselFromDataBridge') < selectionSource.indexOf("CustomEvent('vessel-selection:changed'"));
});

test('Data Bridge hydration fills the static vessel specification fields', () => {
  [
    'vessel-dwt',
    'vessel-identity-dwt',
    'vessel-identity-gt',
    'vessel-loa',
    'vessel-identity-loa',
    'vessel-identity-beam',
    'vessel-draft',
    'vessel-net-tonnage',
    'vessel-flag',
    'vessel-identity-flag',
    'vessel-identity-year',
  ].forEach(fieldId => {
    assert.match(indexSource, new RegExp(`setDataBridgeHydratedValue\\('${fieldId}'`));
  });
  assert.match(indexSource, /setVesselScrubber\(vessel\.has_scrubber, false\)/);
  assert.match(indexSource, /window\.GlobalStore\.calculatorVessel = window\.objetoCalculadoraPrincipal/);
});

test('hydrated values expose their Data Bridge provenance in the UI', () => {
  assert.match(indexSource, /id="data-bridge-hydration-badge" hidden role="status" aria-live="polite"/);
  assert.match(indexSource, /Datos recuperados de Data Bridge/);
  assert.match(indexSource, /\.data-bridge-hydrated/);
  assert.match(indexSource, /markDataBridgeHydratedField/);
  assert.match(indexSource, /clearWhenMissing/);
  assert.match(indexSource, /clearVesselScrubberSelection/);
  assert.match(indexSource, /id="vessel-profile-completeness-badge"/);
  assert.match(indexSource, /Perfil Parcial/);
  assert.match(indexSource, /Ficha Completa/);
});

test('matching cards expose master profile completeness without assuming non-null fields', () => {
  assert.match(indexSource, /function getVesselProfileCompleteness/);
  assert.match(indexSource, /data-vessel-profile-status="partial"/);
  assert.match(indexSource, /data-vessel-profile-status="complete"/);
  assert.match(indexSource, /data-vessel-profile-state="\$\{profileCompleteness\.complete \? 'complete' : 'partial'\}"/);
});

test('the Data Bridge endpoint returns scrubber metadata with the master profile', () => {
  assert.match(endpointSource, /function nullableBoolean/);
  assert.match(endpointSource, /sourcePayload\.has_scrubber \?\? sourcePayload\.hasScrubber \?\? sourcePayload\.scrubber/);
  assert.match(endpointSource, /has_scrubber: hasScrubber/);
  assert.match(endpointSource, /hasScrubber,/);
});

test('service speed hydrates both editable calculator speeds without clearing manual values on null', () => {
  assert.match(indexSource, /source\.service_speed_knots \?\? source\.serviceSpeedKnots \?\? source\.spd_ballast/);
  assert.match(indexSource, /source\.service_speed_knots \?\? source\.serviceSpeedKnots \?\? source\.spd_laden/);
  assert.match(indexSource, /\['spd-ballast', Number\(vessel\.spd_ballast \?\? vessel\.service_speed_knots\)\]/);
  assert.match(indexSource, /\['spd-laden', Number\(vessel\.spd_laden \?\? vessel\.service_speed_knots\)\]/);
  assert.match(indexSource, /setDataBridgeHydratedValue\('spd-ballast', vessel\.spd_ballast, \{ numeric: true \}\)/);
  assert.match(indexSource, /setDataBridgeHydratedValue\('spd-laden', vessel\.spd_laden, \{ numeric: true \}\)/);
  assert.doesNotMatch(indexSource, /setDataBridgeHydratedValue\('spd-(?:ballast|laden)', vessel\.spd_(?:ballast|laden), \{ \.\.\.clearMissing, numeric: true \}\)/);
});
