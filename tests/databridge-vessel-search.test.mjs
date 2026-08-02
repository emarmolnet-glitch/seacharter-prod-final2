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

test('calculator search hydrates and validates technical data before persisting parameters', () => {
  const fetchIndex = localSearchSource.indexOf("fetch('/api/databridge-vessel-search'");
  const hydrateIndex = localSearchSource.indexOf("const formattedName =");
  const validateIndex = localSearchSource.indexOf('const hasValidatedTechnicalData =');
  const persistIndex = localSearchSource.indexOf('await saveVesselToIndexedDB({');
  assert.ok(fetchIndex >= 0);
  assert.ok(fetchIndex < hydrateIndex);
  assert.ok(hydrateIndex < validateIndex);
  assert.ok(validateIndex < persistIndex);
  assert.match(localSearchSource, /handleDWTChange\(true, false\)/);
  assert.match(localSearchSource, /autoClassifySpecialtyFromInputs\(\)/);
});

test('databridge-vessel-search function queries vessels_master for EN_CARTERA and VALIDADO', () => {
  assert.match(searchFunctionSource, /FROM vessels_master/);
  assert.match(searchFunctionSource, /imo_number::text = \$1/);
  assert.match(searchFunctionSource, /vessel_name ILIKE \$2/);
  assert.match(searchFunctionSource, /status = 'EN_CARTERA'/);
  assert.match(searchFunctionSource, /validation_status = 'VALIDADO'/);
});
