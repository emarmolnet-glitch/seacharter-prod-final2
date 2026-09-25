import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import esbuild from 'esbuild';
import vm from 'node:vm';

import {
  extractTheoreticalSpotTce,
  getMarketSpeedVesselClass,
  getTheoreticalSpotTce,
} from '../src/hooks/useDataBridgeSpotConnection.mjs';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const balticSpotSource = await readFile(new URL('../src/step7-baltic-spot-reference.js', import.meta.url), 'utf8');
const tceWorkspaceSource = await readFile(new URL('../TceCalculatorWorkspace.tsx', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('../src/hooks/useDataBridgeSpotConnection.js', import.meta.url), 'utf8');

// Bundle TceCalculatorWorkspace into a self-contained IIFE/CJS object for VM execution
const bundleResult = await esbuild.build({
  stdin: {
    contents: tceWorkspaceSource,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  format: 'cjs',
  write: false,
  plugins: [{
    name: 'mock-externals',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock' }));
      build.onLoad({ filter: /^react$/, namespace: 'mock' }, () => ({
        contents: 'module.exports = { useEffect: () => {}, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (v) => [v, () => {}] };',
      }));
    },
  }],
});

const sandbox = {
  module: { exports: {} },
  exports: {},
  window: {
    location: { protocol: 'https:', origin: 'https://app.seacharter.com', search: '', href: 'https://app.seacharter.com' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: { getElementById: () => null, querySelector: () => null },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  console,
  setTimeout,
  clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(bundleResult.outputFiles[0].text, sandbox);

const {
  calculateCoreFreight,
  calculateReverseTceResults,
} = sandbox.module.exports;

test('1. Variable de Origen: useDataBridgeSpotConnection extracts pure numeric theoretical spot TCE for Handysize and classes', () => {
  // Test class normalization
  assert.equal(getMarketSpeedVesselClass('Handysize / Small Tanker'), 'Handysize');
  assert.equal(getMarketSpeedVesselClass('Supramax / Ultramax'), 'Supramax');
  assert.equal(getMarketSpeedVesselClass('Panamax / Kamsarmax'), 'Panamax');
  assert.equal(getMarketSpeedVesselClass('Capesize / Newcastlemax'), 'Capesize');

  // Test extraction from Data Bridge snapshot with $16,918 Handysize value
  const sampleSnapshot = {
    source: 'DATA_BRIDGE',
    status: 'OK',
    tceSpotByClass: {
      Handysize: { theoreticalSpotTce: 16918, baseTc: 15500, status: 'LIVE' },
      Supramax: { theoreticalSpotTce: 18450, baseTc: 17200, status: 'LIVE' },
    },
  };

  const handysizeVal = extractTheoreticalSpotTce(sampleSnapshot, 'Handysize / Small Tanker');
  assert.equal(handysizeVal, 16918);
  assert.equal(typeof handysizeVal, 'number');

  // Test predictive_v2 extraction
  const v2Snapshot = {
    predictive_v2: {
      metrics: {
        handysize: { tceSpot: 16918 },
      },
    },
  };
  assert.equal(extractTheoreticalSpotTce(v2Snapshot, 'Handysize'), 16918);
});

test('2. Inyección Directa (Binding): TceCalculatorWorkspace imports useDataBridgeSpotConnection and binds without ReferenceError', () => {
  assert.match(tceWorkspaceSource, /import\s*\{[\s\S]*useDataBridgeSpotConnection[\s\S]*\}\s*from\s*'\.\/src\/hooks\/useDataBridgeSpotConnection\.js'/);
  assert.match(tceWorkspaceSource, /const\s*\{\s*spotTce:\s*theoreticalSpotTce,\s*refreshSpot\s*\}\s*=\s*useDataBridgeSpotConnection\(vesselCategory\)/);
  assert.match(tceWorkspaceSource, /name=\{isTceTarget \? 'tceObjetivo' : input\.key\}/);
  assert.match(tceWorkspaceSource, /data-testid=\{isTceTarget \? 'tce-objetivo' : undefined\}/);
});

test('3. Sincronización AUTO / LIVE: toggle AUTO and forceRefresh update tceTarget with pure numeric value', () => {
  // Verifies getSyncedValues injects theoreticalSpotTce
  assert.match(tceWorkspaceSource, /tceTarget:\s*nextTceTarget/);
  // Verifies forceRefresh updates tceTarget
  assert.match(tceWorkspaceSource, /nextValues\.tceTarget\s*=\s*Number\(spotVal\)/);
  // Verifies handleToggleSync re-injects on AUTO activation
  assert.match(tceWorkspaceSource, /tceTarget:\s*Number\(spotVal\)/);
});

test('4. Disparador de Recálculo (useEffect): changing tceObjetivo recalculates Flete Mínimo Armador upwards and eliminates negative loss', () => {
  // Verify useEffect listens to theoreticalSpotTce and triggers calculateCoreFreight
  assert.match(tceWorkspaceSource, /useEffect\(\(\) => \{[\s\S]*?isSyncEnabled && Number\.isFinite\(Number\(theoreticalSpotTce\)\)[\s\S]*?calculateCoreFreight\(nextValues\)/);

  // Compare mathematical results: with empty/zero tceTarget vs injected $16,918
  const baseParams = {
    cargoVolume: 30000,
    daysSea: 8,
    daysPort: 13.5,
    seaFuelConsumption: 5.5,
    portFuelConsumption: 0.5,
    vlsfoPrice: 610,
    ifoPrice: 0,
    mgoPrice: 830,
    bunkerCost: 104625,
    portCosts: 60000,
    bunkerDailyPortCost: 2250,
    totalCo2Emissions: 809.7,
    euaPrice: 75.5,
    etsCoverage: 0.5,
    opexDaily: 2800,
    contractShipments: 6,
    ownerMarginPercent: 15,
    chartererMarginPercent: 10,
    hasScrubber: false,
    laycanDiasLibres: 0,
    impactoRiesgo: 0,
    riesgoDias: 0,
    applyBunkerIndexAdjustment: false,
    contractBunkerIndexBase: 0,
  };

  const resultsWithoutTce = calculateReverseTceResults({
    ...baseParams,
    tceTarget: 0,
  });

  const resultsWithInjectedTce = calculateReverseTceResults({
    ...baseParams,
    tceTarget: 16918,
  });

  // Without TCE, net profit is a loss because OPEX and voyage costs are not covered
  assert.ok(resultsWithoutTce.netProfitTotal < 0);
  assert.ok(Math.abs(resultsWithoutTce.netProfitTotal - (-60200)) < 100);

  // With injected TCE ($16,918/day), net profit is positive (covers OPEX and returns surplus)
  assert.ok(resultsWithInjectedTce.netProfitTotal > 0);
  assert.ok(resultsWithInjectedTce.netProfitTotal > resultsWithoutTce.netProfitTotal);

  // Minimum freight rate and suggested owner sale are calculated upwards
  assert.ok(resultsWithInjectedTce.minFreightRate > resultsWithoutTce.minFreightRate);
  assert.ok(resultsWithInjectedTce.suggestedOwnerSale > resultsWithoutTce.suggestedOwnerSale);
  assert.equal(resultsWithInjectedTce.tceTarget, 16918);
});

test('5. Data Bridge & index.html event sync: step7 dispatches MARKET_REFERENCE_UPDATED and index.html handles input binding', () => {
  assert.match(balticSpotSource, /MARKET_REFERENCE_UPDATED/);
  assert.match(balticSpotSource, /window\.State\.theoreticalSpotTce\s*=\s*Number\(tceSpot\.theoreticalSpotTce\)/);

  assert.match(indexSource, /window\.addEventListener\('MARKET_REFERENCE_UPDATED'/);
  assert.match(indexSource, /document\.getElementById\('inverse-tce-target'\)/);
  assert.match(indexSource, /document\.querySelector\('input\[name="tceObjetivo"\]'\)/);
  assert.match(indexSource, /calculateInverseTce\(\)/);
});
