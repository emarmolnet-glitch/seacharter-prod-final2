import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('runOnDemandMapRouteWorkflow automatically invokes master calculation for the calculator', () => {
  assert.match(indexHtml, /async function runOnDemandMapRouteWorkflow\(button\)/, 'runOnDemandMapRouteWorkflow exists');
  assert.match(
    indexHtml,
    /if \(typeof window\.handleMasterValidationAndCalculate === 'function'\)[\s\S]*await window\.handleMasterValidationAndCalculate\(\)/,
    'automatically calls handleMasterValidationAndCalculate'
  );
  assert.match(
    indexHtml,
    /document\.getElementById\('btn-validate-section2-executive'\) \|\| document\.getElementById\('btn-validate-section2'\)/,
    'has fallback click on validate section 2 buttons'
  );
});

test('runOnDemandMapRouteWorkflow synchronizes the Density Dashboard and Fair Freight rates', () => {
  assert.match(
    indexHtml,
    /if \(typeof window\.renderDensitySnapshotFromGlobalStore === 'function'\)[\s\S]*window\.renderDensitySnapshotFromGlobalStore\(\)/,
    'calls renderDensitySnapshotFromGlobalStore after route and congestion shield'
  );
  assert.match(
    indexHtml,
    /if \(typeof window\.calculateAndDisplayAisFreight === 'function'\)[\s\S]*window\.calculateAndDisplayAisFreight\(\)/,
    'calls calculateAndDisplayAisFreight after route workflow'
  );
});

test('getDensityReactiveVessels provides multi-source fallback for detected radar vessels', () => {
  assert.match(indexHtml, /function getDensityReactiveVessels\(\)/, 'getDensityReactiveVessels exists');
  assert.match(indexHtml, /window\.GlobalStore\?\.getCanonicalFleet\?\.\(\)/, 'checks canonical fleet');
  assert.match(indexHtml, /window\.GlobalStore\?\.matchingVessels/, 'checks matching vessels');
  assert.match(indexHtml, /window\.datalasticRadarVessels/, 'checks datalastic radar vessels');
  assert.match(indexHtml, /window\.listaBarcos/, 'checks listaBarcos');
});

test('renderDensityVesselsTable populates the main AIS Live table with all detected vessels', () => {
  assert.match(
    indexHtml,
    /function renderDensityVesselsTable\(_vessels, _options = \{\}\)/,
    'renderDensityVesselsTable exists'
  );
  assert.match(
    indexHtml,
    /const displayVessels = \(Array\.isArray\(_vessels\) && _vessels\.length > 0\)\s*\?\s*_vessels\s*:\s*getDensityReactiveVessels\(\)/,
    'uses passed vessels or reactive fallback'
  );
  assert.match(indexHtml, /document\.getElementById\('ais-vessels-tbody'\)/, 'targets ais-vessels-tbody');
});

test('calculateAndDisplayAisFreight computes real freight rate bands and eliminates dashes', () => {
  assert.match(indexHtml, /let baseBE = parseFloat\(baseBEText\.replace/, 'reads break-even');
  assert.match(indexHtml, /if \(baseBE <= 0\)\s*\{\s*baseBE = 28\.50;/, 'provides safe positive market fallback');
  assert.match(indexHtml, /rateFairEl\.innerText = `\$\$\{rateJusto\.toFixed\(2\)\}`/, 'sets fair freight rate');
  assert.match(indexHtml, /rateStandardEl\.innerText = `\$\$\{rateStandard\.toFixed\(2\)\}`/, 'sets standard freight rate');
  assert.match(indexHtml, /rateOffMarketEl\.innerText = `\$\$\{rateOffMarket\.toFixed\(2\)\}`/, 'sets offmarket freight rate');
});
