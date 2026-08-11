import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const searchFunctionSource = readFileSync(
  new URL('../netlify/functions/databridge-vessel-search.ts', import.meta.url),
  'utf8',
);
const localSearchStart = indexSource.indexOf('async function searchLocalVesselDataBridge()');
const localSearchEnd = indexSource.indexOf('const BUNKER_INDEX_DATA_KEY', localSearchStart);
const localSearchSource = indexSource.slice(localSearchStart, localSearchEnd);

test('index.html connects magnifying glass button exclusively to searchLocalVesselDataBridge', () => {
  assert.match(
    indexSource,
    /<button type="button" id="btn-vessel-specs-real-2" onclick="searchLocalVesselDataBridge\(\)"/,
  );
});

test('index.html preserves Specs (IA) button connected to autoFillVesselSpecs', () => {
  assert.match(
    indexSource,
    /<button id="btn-vessel-specs-real-1" onclick="autoFillVesselSpecs\(\)"/,
  );
});

test('searchLocalVesselDataBridge queries local backend endpoint and handles not-found locally', () => {
  assert.match(localSearchSource, /async function searchLocalVesselDataBridge\(\)/);
  assert.match(localSearchSource, /\/api\/databridge-vessel-search/);
  assert.match(localSearchSource, /if \(!response\.ok\)/);
  assert.match(localSearchSource, /showToast\("Buque no encontrado en Data Bridge"\)/);
});

test('calculator search accepts partial technical data and stages it for confirmation', () => {
  const fetchIndex = localSearchSource.indexOf("fetch('/api/databridge-vessel-search'");
  const normalizeIndex = localSearchSource.indexOf('const vessel = normalizeCalculatorStoreVessel');
  const confirmationIndex = localSearchSource.indexOf('openPdaVesselConfirmationModal');
  assert.ok(fetchIndex >= 0);
  assert.ok(fetchIndex < normalizeIndex);
  assert.ok(normalizeIndex < confirmationIndex);
  assert.doesNotMatch(localSearchSource, /hasValidatedTechnicalData|no contiene DWT válido/);
  assert.doesNotMatch(localSearchSource, /applyResolvedVesselToCalculator\(data\.vessel/);
});

test('databridge-vessel-search function queries vessels_master for EN_CARTERA and VALIDADO', () => {
  assert.match(searchFunctionSource, /FROM vessels_master/);
  assert.match(searchFunctionSource, /imo_number::text = \$1/);
  assert.match(searchFunctionSource, /vessel_name ILIKE \$2/);
  assert.match(searchFunctionSource, /status = 'EN_CARTERA'/);
  assert.match(searchFunctionSource, /validation_status = 'VALIDADO'/);
  assert.match(searchFunctionSource, /COALESCE\(status, ''\)[\s\S]*NOT IN \('PENDING', 'PENDING_AUDIT'\)/);
  assert.match(searchFunctionSource, /COALESCE\(audit_status, ''\)[\s\S]*NOT IN \('PENDING', 'IN_DUE_DILIGENCE', 'REJECTED'\)/);
  assert.match(searchFunctionSource, /COALESCE\(process_status, ''\)[\s\S]*NOT IN \('PENDING_REVIEW', 'DUE_DILIGENCE'\)/);
});
