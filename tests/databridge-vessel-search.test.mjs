import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const searchFunctionSource = readFileSync(
  new URL('../netlify/functions/databridge-vessel-search.ts', import.meta.url),
  'utf8',
);

test('index.html connects magnifying glass button exclusively to searchLocalVesselDataBridge', () => {
  assert.match(
    indexSource,
    /<button id="btn-vessel-specs-real-2" onclick="searchLocalVesselDataBridge\(\)"/,
  );
});

test('index.html preserves Specs (IA) button connected to autoFillVesselSpecs', () => {
  assert.match(
    indexSource,
    /<button id="btn-vessel-specs-real-1" onclick="autoFillVesselSpecs\(\)"/,
  );
});

test('searchLocalVesselDataBridge queries local backend endpoint and handles not-found locally', () => {
  assert.match(indexSource, /async function searchLocalVesselDataBridge\(\)/);
  assert.match(indexSource, /\/api\/databridge-vessel-search\?q=/);
  assert.match(indexSource, /showToast\("Buque no encontrado en Data Bridge"\)/);
});

test('databridge-vessel-search function queries vessels_master for EN_CARTERA and VALIDADO', () => {
  assert.match(searchFunctionSource, /FROM vessels_master/);
  assert.match(searchFunctionSource, /imo_number::text = \$1/);
  assert.match(searchFunctionSource, /vessel_name ILIKE \$2/);
  assert.match(searchFunctionSource, /status = 'EN_CARTERA'/);
  assert.match(searchFunctionSource, /validation_status = 'VALIDADO'/);
});
