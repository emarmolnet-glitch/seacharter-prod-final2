import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const calculationStateSource = readFileSync(new URL('../netlify/functions/calculation-state.ts', import.meta.url), 'utf8');

test('matching header consolidates route, laycan and cargo operations', () => {
  assert.match(indexSource, /Ruta y Ventana \(Laycan\)/);
  assert.match(indexSource, /id="matching-laycan-status-text"/);
  assert.match(indexSource, /Carga y Operativa/);
  assert.match(indexSource, /id="matching-cargo-type-text"/);
  assert.match(indexSource, /id="matching-cargo-rates-text"/);
  assert.match(indexSource, /function\(candidateState = null\)[\s\S]*quantityMt:[\s\S]*loadRateMt:[\s\S]*dischargeRateMt:/);
  assert.match(indexSource, /`\$\{formatNumber\(operation\.quantityMt\)\} MT de \$\{operation\.cargoType\}`/);
  assert.match(indexSource, /`Carga: \$\{formatNumber\(operation\.loadRateMt\)\} \/ Descarga: \$\{formatNumber\(operation\.dischargeRateMt\)\}`/);
  assert.match(indexSource, /laycanRange = \[formatContractDate\(route\.laydays\), formatContractDate\(route\.cancelling\)\]/);
});

test('matching header reads only canonical global voyage parameters', () => {
  const operationStart = indexSource.indexOf('window.getMatchingContractOperationalState = function');
  const operationEnd = indexSource.indexOf('window.getCommercialTargetCargoDwt', operationStart);
  const operationSource = indexSource.slice(operationStart, operationEnd);

  assert.match(operationSource, /const voyageParams = getGlobalVoyageParams\(\)/);
  assert.match(operationSource, /quantityMt: Number\(voyageParams\.cargoQuantity\) \|\| 0/);
  assert.match(operationSource, /loadRateMt: Number\(voyageParams\.loadRate\) \|\| 0/);
  assert.match(operationSource, /dischargeRateMt: Number\(voyageParams\.dischargeRate\) \|\| 0/);
  assert.doesNotMatch(operationSource, /document\.getElementById|matchingRequest|calculatedState/);
});

test('active voyage store publishes canonical laycan and cargo fields', () => {
  assert.match(indexSource, /laycan: \{ laydays: "", cancelling: "" \}/);
  assert.match(indexSource, /function normalizeActiveVoyageState\(partial = \{\}, baseState = State\)/);
  assert.match(indexSource, /function buildCanonicalVoyageParams\(partial = \{\}, baseParams = null\)/);
  assert.match(indexSource, /voyageParams: getGlobalVoyageParams\(\)/);
  assert.match(indexSource, /cargoQuantity,/);
  assert.match(indexSource, /dischargeRate,/);
  assert.match(indexSource, /SeaCharterStore\.set\(readValidatedCargoOperationState\(\), \{ force: true \}\)/);
  assert.match(indexSource, /cargoQuantity: cargoState\.cargoQuantity/);
  assert.match(indexSource, /laycan: \{ laydays, cancelling \}/);
});

test('Neon calculation state normalizes legacy and canonical contract payloads', () => {
  assert.match(calculationStateSource, /function normalizeCalculationContractFields/);
  assert.match(calculationStateSource, /const laydays = firstText\(laycan\.laydays, laycan\.start/);
  assert.match(calculationStateSource, /const cargoQuantity = firstPositiveNumber\(cargo\.cargoQuantity, cargo\.quantity/);
  assert.match(calculationStateSource, /const calculation = isRecord\(parsedCalculation\) \? normalizeCalculationContractFields/);
  assert.match(calculationStateSource, /const persistedCalculation = normalizeCalculationContractFields/);
  assert.match(indexSource, /const hydratedVoyageState = normalizeActiveVoyageState\(quote\.calculation_data \|\| \{\}\)/);
  assert.match(indexSource, /const hydratedCalculation = injectCalculatedState\(\{/);
  assert.match(indexSource, /syncMatchingRouteSummary\(hydratedCalculation\)/);
});

test('strict DWT filtering blocks unknown and undersized vessels', () => {
  assert.match(indexSource, /strictRequiredDwt = quantity > 0 \? quantity \* 1\.05 : 0/);
  assert.match(indexSource, /if \(!Number\.isFinite\(dwt\) \|\| dwt <= 0 \|\| missingCriticalType\) return false/);
  assert.match(indexSource, /return dwt >= strictRequiredDwt/);
  assert.match(indexSource, /isDwtUnknown \? 'opacity-65' : 'opacity-80'/);
});
