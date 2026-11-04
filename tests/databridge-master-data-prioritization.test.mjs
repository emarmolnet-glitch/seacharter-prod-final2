import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const voyageCostEngineSource = await readFile(new URL('../voyage-cost-engine.js', import.meta.url), 'utf8');
const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. OPEX: applyDataBridgePayloadToCalculator assigns opexDaily/opex_daily and locks it against defaults', () => {
  const elements = {
    'opex-daily': { value: '0', dataset: {}, dispatchEvent: () => {} },
    'cost-plus-daily-opex': { value: '0', dataset: {}, dispatchEvent: () => {} }
  };
  const mockDocument = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };
  const mockWindow = { State: {} };

  const context = {
    document: mockDocument,
    window: mockWindow,
    State: mockWindow.State,
    Event: class MockEvent {},
    markDataBridgeHydratedField: () => {},
    setPdaCalculationStatus: () => {},
    applyDataBridgeHydrationToCalculator: () => {}
  };

  const fnMatch = indexSource.match(/function applyDataBridgePayloadToCalculator\([\s\S]*?\n        window\.applyDataBridgePayloadToCalculator = applyDataBridgePayloadToCalculator;/);
  assert.ok(fnMatch, 'applyDataBridgePayloadToCalculator must be defined in index.html');

  vm.runInNewContext(fnMatch[0], context);

  // Test with opexDaily
  context.applyDataBridgePayloadToCalculator({ opexDaily: 7200 });
  assert.equal(elements['opex-daily'].value, '7200', 'opexDaily must be assigned to #opex-daily');
  assert.equal(elements['opex-daily'].dataset.dataBridgeLocked, 'true', 'Must be locked by DataBridge');
  assert.equal(mockWindow.State.opexDaily, 7200);

  // Test with opex_daily
  context.applyDataBridgePayloadToCalculator({ opex_daily: 8500 });
  assert.equal(elements['opex-daily'].value, '8500', 'opex_daily must be assigned to #opex-daily');
  assert.equal(elements['opex-daily'].dataset.dataBridgeLocked, 'true');
  assert.equal(mockWindow.State.opexDaily, 8500);
});

test('2. OPEX: voyage-cost-engine does not overwrite locked OPEX with default 4800', () => {
  assert.match(voyageCostEngineSource, /isOpexLocked/, 'voyage-cost-engine must check isOpexLocked');
  assert.match(voyageCostEngineSource, /dataBridgeLocked/, 'voyage-cost-engine must respect dataBridgeLocked');
});

test('3. PDA: applyDataBridgePayloadToCalculator injects exact pda_pol and pda_pod and deactivates algorithmic estimation', () => {
  const elements = {
    'pda-pol': { value: '0', dataset: {}, dispatchEvent: () => {} },
    'pda-pod': { value: '0', dataset: {}, dispatchEvent: () => {} }
  };
  let statusPol = '';
  let statusPod = '';

  const mockDocument = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };
  const mockWindow = { State: {} };

  const context = {
    document: mockDocument,
    window: mockWindow,
    State: mockWindow.State,
    Event: class MockEvent {},
    markDataBridgeHydratedField: () => {},
    setPdaCalculationStatus: (type, mode) => {
      if (type === 'pol') statusPol = mode;
      if (type === 'pod') statusPod = mode;
    },
    applyDataBridgeHydrationToCalculator: () => {}
  };

  const fnMatch = indexSource.match(/function applyDataBridgePayloadToCalculator\([\s\S]*?\n        window\.applyDataBridgePayloadToCalculator = applyDataBridgePayloadToCalculator;/);
  vm.runInNewContext(fnMatch[0], context);

  context.applyDataBridgePayloadToCalculator({ pda_pol: 14500, pda_pod: 22000 });

  assert.equal(elements['pda-pol'].value, '14500', 'pda_pol must be injected into #pda-pol');
  assert.equal(elements['pda-pod'].value, '22000', 'pda_pod must be injected into #pda-pod');
  assert.equal(elements['pda-pol'].dataset.dataBridgeLocked, 'true');
  assert.equal(elements['pda-pod'].dataset.dataBridgeLocked, 'true');
  assert.equal(statusPol, 'official', 'Calculation status must be official');
  assert.equal(statusPod, 'official', 'Calculation status must be official');
});

test('4. PDA: autoFillPDA and debouncedAutoFillPDA return early without overwriting when locked', () => {
  const autoFillMatch = indexSource.match(/async function autoFillPDA\(type[\s\S]*?\n        \}/);
  assert.ok(autoFillMatch, 'autoFillPDA must be defined');
  assert.match(autoFillMatch[0], /dataBridgeLocked === 'true'/, 'autoFillPDA must check dataBridgeLocked');
  assert.match(autoFillMatch[0], /pdaPolLocked/, 'autoFillPDA must check pdaPolLocked');

  const debouncedMatch = indexSource.match(/function debouncedAutoFillPDA\(type[\s\S]*?\n\t        \}/);
  assert.ok(debouncedMatch, 'debouncedAutoFillPDA must be defined');
  assert.match(debouncedMatch[0], /dataBridgeLocked === 'true'/, 'debouncedAutoFillPDA must check dataBridgeLocked');
});

test('5. Bunkers: applyDataBridgePayloadToCalculator maps raw prices without markup (+%)', () => {
  const elements = {
    'price-sea': { value: '0', dataset: {}, dispatchEvent: () => {} },
    'price-ifo': { value: '0', dataset: {}, dispatchEvent: () => {} },
    'price-port': { value: '0', dataset: {}, dispatchEvent: () => {} }
  };

  const mockDocument = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };
  const mockWindow = { State: {} };

  const context = {
    document: mockDocument,
    window: mockWindow,
    State: mockWindow.State,
    Event: class MockEvent {},
    markDataBridgeHydratedField: () => {},
    setPdaCalculationStatus: () => {},
    applyDataBridgeHydrationToCalculator: () => {}
  };

  const fnMatch = indexSource.match(/function applyDataBridgePayloadToCalculator\([\s\S]*?\n        window\.applyDataBridgePayloadToCalculator = applyDataBridgePayloadToCalculator;/);
  vm.runInNewContext(fnMatch[0], context);

  context.applyDataBridgePayloadToCalculator({
    vlsfo: 615.50,
    ifo: 480.00,
    mgo: 825.25
  });

  assert.equal(elements['price-sea'].value, '615.50', 'Exact VLSFO price mapped without markup');
  assert.equal(elements['price-ifo'].value, '480.00', 'Exact IFO price mapped without markup');
  assert.equal(elements['price-port'].value, '825.25', 'Exact MGO price mapped without markup');
  assert.equal(mockWindow.State.priceSea, 615.50);
  assert.equal(mockWindow.State.priceIfo, 480.00);
  assert.equal(mockWindow.State.pricePort, 825.25);
});

test('6. TceCalculatorWorkspace and App.jsx integrate applyDataBridgePayloadToCalculator', () => {
  assert.match(tceWorkspaceSource, /applyDataBridgePayloadToCalculator/, 'TceCalculatorWorkspace must call applyDataBridgePayloadToCalculator');
  assert.match(appSource, /applyDataBridgePayloadToCalculator/, 'App.jsx must call applyDataBridgePayloadToCalculator');
});
