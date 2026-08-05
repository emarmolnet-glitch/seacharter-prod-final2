import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createMockElement(id = '', mockElements = {}, textOutputs = {}) {
  const listeners = [];
  return {
    get value() { return String(id in mockElements ? mockElements[id] : ''); },
    set value(v) { mockElements[id] = v; },
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    addEventListener: (evt, fn) => listeners.push({ evt, fn }),
    querySelectorAll: () => [],
    set innerText(v) { textOutputs[id] = v; },
    get innerText() { return textOutputs[id] || ''; },
    title: '',
  };
}

function buildBaseMockElements(overrides = {}) {
  return {
    'cargo-qty': '10000',
    'dist-ballast': '1000',
    'dist-laden': '1000',
    'spd-ballast': '10',
    'spd-laden': '10',
    'rate-load': '5000',
    'rate-disch': '5000',
    'turn-time-hours': '0',
    'factor-clima': '0',
    'cons-sea': '20',
    'price-sea': '600',
    'cons-port': '5',
    'price-port': '700',
    'opex-daily': '5000',
    'pda-pol': '10000',
    'pda-pod': '10000',
    'stevedoring-costs': '0',
    'pda-misc': '0',
    'margin-owner': '0',
    'margin-charterer': '0',
    'freight-rate': '30',
    'freight-sell': '35',
    'comm-pct': '0',
    'vessel-dwt': '25000',
    'delta-historico': '0',
    't-fondeo': '0',
    'eu-carbon-price': '80',
    'ets-route-type': '0',
    'asb-delay-hours': '0',
    'dias-preparacion': '0',
    'coste-maniobra-especial': '0',
    'cargo-surcharge': '0',
    'freight-conditions': 'FIOS',
    'charter-party-standard': 'GENCON',
    'port-pol': 'Rotterdam',
    'port-pod': 'Bilbao',
    ...overrides,
  };
}

test('runEngine dynamically propagates lower port loading rate into T_port, totalDays, totalOpex, and breakEven', () => {
  assert.match(indexSource, /function runEngine\(\) \{/);
  assert.match(indexSource, /const T_port = isZeroCalculation \? 0 : Math\.max\(0, adjustedPortDays \+ extraRatePenaltyDays\);/);

  const mockElements = buildBaseMockElements();
  const textOutputs = {};
  const dummyEl = createMockElement('', mockElements, textOutputs);

  let demurrageExposureState = { active: false, exposedDays: 0, financialExposure: 0 };

  const context = {
    Math,
    Number,
    parseFloat,
    parseInt,
    window: {},
    navigationStrategy: 'ECO',
    navigationStrategyMode: 'ECO',
    firstNonEmpty: (...args) => args.find(a => Boolean(a)) || '',
    getNormalizedDateInputValue: () => '',
    validateCoreTradingSafety: () => {},
    syncGencon: () => {},
    syncAsbatankvoy: () => {},
    syncPrintPolicyClass: () => {},
    updateChartererNegotiationSimulator: () => {},
    translatePage: () => {},
    document: {
      activeElement: null,
      readyState: 'complete',
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (id in mockElements) {
          return createMockElement(id, mockElements, textOutputs);
        }
        return dummyEl;
      },
    },
    State: {},
    PORT_DB: {},
    COA_PDA_DILUTION_FACTOR: 1.0,
    hasRequiredCalculationInputs: () => true,
    ensureDetectedSpeedsBeforeCalculation: () => {},
    applyPendingDraftCargoAdjustment: () => {},
    getFuelStrategyText: () => '',
    updateSecaIndicator: () => {},
    getPortPdaBreakdown: () => [],
    calcularPrecioObjetivo: () => 0,
    updateHistoricalRiskEngine: () => ({ impact: 0 }),
    updateCoaPurchaseDetails: () => {},
    readMarketCalibrationFactor: () => 1.0,
    getRouteMarketBenchmark: () => null,
    updateMarketBenchmarkComparison: () => {},
    updateCargoRateArbitrageAlert: () => {},
    setCostPlusRouteSyncState: () => {},
    getMetodoEstibaActual: () => 'standard',
    getMetodoDescargaActual: () => 'standard',
    calcularRitmoEfectivo: () => 0,
    normalizarTipoCarga: () => 'granel',
    costeTrincajeCondicional: () => 0,
    vesselHasScrubber: () => false,
    readNumeroGruasPuerto: () => 1,
    calcularDiasPuertoPorEstiba: (cargo, rate) => (rate > 0 ? cargo / rate : 0),
    getOperacionModo: () => 'SPOT',
    getEtsRouteFactor: () => 0,
    getCountryFromPort: () => '',
    isSecaZone: () => false,
    getManualFuelBreakdown: () => null,
    buildExecutiveShipClassAnalysis: () => ({ capexDaily: 0 }),
    calculateCostPlusContingency: () => ({ totalCost: 0 }),
    updateDemurrageExposureAlert: () => demurrageExposureState,
    syncEtsRouteSelectorFromPorts: () => {},
    syncInverseTceFromVoyage: () => {},
    notifyPendingDraftRecalculation: () => {},
  };

  context.window = context;

  const runEngineStart = indexSource.indexOf('function runEngine()');
  const runEngineEnd = indexSource.indexOf('function bindShadowEstimator', runEngineStart);
  const runEngineCode = indexSource.slice(runEngineStart, runEngineEnd);

  vm.runInNewContext(`
    globalThis.navigationStrategy = 'ECO';
    globalThis.navigationStrategyMode = 'ECO';
    function getPortPdaBreakdown() { return []; }
    function updateHistoricalRiskEngine() { return { impact: 0 }; }
    ${runEngineCode};
    globalThis.runEngine = runEngine;
  `, context);

  // Fast rate scenario: 5000 TM/D -> POL port days = 2, POD port days = 2 => T_port = 4 days
  mockElements['rate-load'] = '5000';
  mockElements['rate-disch'] = '5000';
  demurrageExposureState = { active: false, exposedDays: 0, financialExposure: 0 };
  context.runEngine();

  const fastDaysPort = context.State.daysPort;
  const fastTotalDays = context.State.totalDays;
  const fastCostOpex = context.State.costOpex;
  const fastBreakEven = context.State.breakEven;

  assert.equal(fastDaysPort, 4); // 2 + 2
  assert.equal(fastTotalDays, 12.333333333333334); // 8.333 (transit) + 4 (port)
  assert.equal(fastCostOpex, fastTotalDays * 5000);

  // Inefficient rate scenario: rate-load drops to 1000 TM/D -> POL port days = 10, POD port days = 2 => base port days = 12 days.
  // Plus demurrage exposure penalty (+10 days exposed due to poor loading rate)
  mockElements['rate-load'] = '1000';
  demurrageExposureState = { active: true, exposedDays: 10, financialExposure: 50000 };
  context.runEngine();

  const slowDaysPort = context.State.daysPort;
  const slowTotalDays = context.State.totalDays;
  const slowCostOpex = context.State.costOpex;
  const slowBreakEven = context.State.breakEven;

  assert.equal(slowDaysPort, 22); // 10 (load) + 2 (disch) + 10 (demurrage penalty)
  assert.equal(slowTotalDays, fastTotalDays + 18);
  assert.equal(slowCostOpex, slowTotalDays * 5000);
  assert.ok(Math.abs((slowCostOpex - fastCostOpex) - (18 * 5000)) < 1e-9); // OPEX increased by exactly 18 days * daily OPEX
  assert.ok(slowBreakEven > fastBreakEven, 'Break-even must increase when OPEX increases due to poor loading rate');
});

test('runEngine incorporates demurrage exposure penalty days directly into T_port and totalOpex', () => {
  const mockElements = buildBaseMockElements();
  let demurrageState = { active: false, exposedDays: 0, financialExposure: 0 };
  const textOutputs = {};
  const dummyEl = createMockElement('', mockElements, textOutputs);

  const context = {
    Math,
    Number,
    parseFloat,
    parseInt,
    window: {},
    navigationStrategy: 'ECO',
    navigationStrategyMode: 'ECO',
    firstNonEmpty: (...args) => args.find(a => Boolean(a)) || '',
    getNormalizedDateInputValue: () => '',
    validateCoreTradingSafety: () => {},
    syncGencon: () => {},
    syncAsbatankvoy: () => {},
    syncPrintPolicyClass: () => {},
    updateChartererNegotiationSimulator: () => {},
    translatePage: () => {},
    document: {
      activeElement: null,
      readyState: 'complete',
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (id in mockElements) {
          return createMockElement(id, mockElements, textOutputs);
        }
        return dummyEl;
      },
    },
    State: {},
    PORT_DB: {},
    COA_PDA_DILUTION_FACTOR: 1.0,
    hasRequiredCalculationInputs: () => true,
    ensureDetectedSpeedsBeforeCalculation: () => {},
    applyPendingDraftCargoAdjustment: () => {},
    getFuelStrategyText: () => '',
    updateSecaIndicator: () => {},
    getPortPdaBreakdown: () => [],
    calcularPrecioObjetivo: () => 0,
    updateHistoricalRiskEngine: () => ({ impact: 0 }),
    updateCoaPurchaseDetails: () => {},
    readMarketCalibrationFactor: () => 1.0,
    getRouteMarketBenchmark: () => null,
    updateMarketBenchmarkComparison: () => {},
    updateCargoRateArbitrageAlert: () => {},
    setCostPlusRouteSyncState: () => {},
    getMetodoEstibaActual: () => 'standard',
    getMetodoDescargaActual: () => 'standard',
    calcularRitmoEfectivo: () => 0,
    normalizarTipoCarga: () => 'granel',
    costeTrincajeCondicional: () => 0,
    vesselHasScrubber: () => false,
    readNumeroGruasPuerto: () => 1,
    calcularDiasPuertoPorEstiba: (cargo, rate) => (rate > 0 ? cargo / rate : 0),
    getOperacionModo: () => 'SPOT',
    getEtsRouteFactor: () => 0,
    getCountryFromPort: () => '',
    isSecaZone: () => false,
    getManualFuelBreakdown: () => null,
    buildExecutiveShipClassAnalysis: () => ({ capexDaily: 0 }),
    calculateCostPlusContingency: () => ({ totalCost: 0 }),
    updateDemurrageExposureAlert: () => demurrageState,
    syncEtsRouteSelectorFromPorts: () => {},
    syncInverseTceFromVoyage: () => {},
    notifyPendingDraftRecalculation: () => {},
  };

  context.window = context;

  const runEngineStart = indexSource.indexOf('function runEngine()');
  const runEngineEnd = indexSource.indexOf('function bindShadowEstimator', runEngineStart);
  const runEngineCode = indexSource.slice(runEngineStart, runEngineEnd);

  vm.runInNewContext(`
    globalThis.navigationStrategy = 'ECO';
    globalThis.navigationStrategyMode = 'ECO';
    function getPortPdaBreakdown() { return []; }
    function updateHistoricalRiskEngine() { return { impact: 0 }; }
    ${runEngineCode};
    globalThis.runEngine = runEngine;
  `, context);

  // Baseline without demurrage penalty
  demurrageState = { active: false, exposedDays: 0, financialExposure: 0 };
  context.runEngine();
  const basePortDays = context.State.daysPort;
  const baseOpex = context.State.costOpex;

  // Demurrage exposure penalty active (+3.5 days penalty)
  demurrageState = { active: true, exposedDays: 3.5, financialExposure: 0 };
  context.runEngine();
  const penalizedPortDays = context.State.daysPort;
  const penalizedOpex = context.State.costOpex;

  assert.equal(penalizedPortDays, basePortDays + 3.5);
  assert.ok(Math.abs((penalizedOpex - baseOpex) - (3.5 * 5000)) < 1e-9);
});
