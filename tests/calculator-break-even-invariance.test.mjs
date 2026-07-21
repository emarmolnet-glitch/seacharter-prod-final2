import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const calculatorStart = indexSource.indexOf('function calcularViaje(datosDelBuqueAislados)');
const calculatorEnd = indexSource.indexOf("if (typeof window !== 'undefined') {\n            window.calcularViaje", calculatorStart);
const calculatorSource = indexSource.slice(calculatorStart, calculatorEnd).trim();
const requiredInputsStart = indexSource.indexOf('function hasRequiredCalculationInputs()');
const requiredInputsEnd = indexSource.indexOf('function resetTotalEstimation', requiredInputsStart);
const requiredInputsSource = indexSource.slice(requiredInputsStart, requiredInputsEnd).trim();

const baseInputs = {
  'dist-ballast': 1000,
  'dist-laden': 1000,
  'spd-ballast': 12,
  'spd-laden': 12,
  'cargo-qty': 20000,
  'cargo-type': 'Granel Sólido (Dry Bulk)',
  'cargo-type-manual': '',
  'rate-load': 5000,
  'rate-disch': 5000,
  'turn-time-hours': 24,
  'factor-clima': 0,
  'charter-party-standard': 'GENCON',
  'cons-sea': 20,
  'price-sea': 600,
  'price-ifo': 500,
  'cons-port': 4,
  'cons-anchorage': 4,
  'cons-anchorage-aux': 2,
  'price-port': 700,
  'opex-daily': 5000,
  'cargo-surcharge': 0,
  'pda-pol': 20000,
  'pda-pod': 20000,
  'stevedoring-costs': 10000,
  'pda-misc': 0,
  'margin-owner': 5,
  'margin-charterer': 3,
  'freight-rate': 30,
  'freight-sell': 35,
  'comm-pct': 2.5,
  'vessel-dwt': 30000,
  'delta-historico': 0,
  't-fondeo': 0,
  'eu-carbon-price': 80,
  'ets-route-type': 0.5,
  'asb-delay-hours': 0,
  'apply-ets-surcharge': 'NO',
  'port-pol': 'Rotterdam',
  'port-pod': 'Bilbao',
  'coste-maniobra-especial': 0,
  'dias-preparacion': 0,
  'input-trincaje': 0,
};

function buildElements(overrides = {}) {
  const values = { ...baseInputs, ...overrides };
  const elements = new Map(Object.entries(values).map(([id, value]) => [id, {
    value: String(value),
    dataset: {},
    setAttribute() {},
  }]));
  elements.set('t-remolcadores', {
    value: '0',
    dataset: { autoEstimated: 'true', tarifaBase: '0' },
    setAttribute() {},
  });
  return { elements, values };
}

function runCalculator(overrides = {}) {
  const { elements, values } = buildElements(overrides);
  const context = {
    Math,
    Number,
    parseFloat,
    document: { getElementById: (id) => elements.get(id) || null },
    State: { cargoType: values['cargo-type'] },
    PORT_DB: {},
    window: {
      SeaCharterVoyageCostEngine: {
        inferTugCostByDwt(dwt, manualUnitCost) {
          const totalUses = Number(dwt) > 0 ? 4 : 0;
          const unitCost = Number(manualUnitCost) > 0 ? Number(manualUnitCost) : (totalUses ? 1200 : 0);
          return {
            tugs_por_maniobra: totalUses ? 1 : 0,
            tarifa_efectiva_ud: unitCost,
            total_usos_remolcador: totalUses,
            coste_total_tugs: unitCost * totalUses,
            inferred: true,
          };
        },
      },
    },
    getMetodoEstibaActual: () => 'standard',
    getMetodoDescargaActual: () => 'standard',
    calcularRitmoEfectivo: () => 5000,
    normalizarTipoCarga: () => 'granel',
    costeTrincajeCondicional: () => 0,
    vesselHasScrubber: () => false,
    readNumeroGruasPuerto: () => 1,
    calcularDiasPuertoPorEstiba: (cargo, rate) => Number(rate) > 0 ? Number(cargo) / Number(rate) : 0,
    getCountryFromPort: () => '',
    isSecaZone: () => false,
    getManualFuelBreakdown: () => null,
    buildExecutiveShipClassAnalysis: () => ({ capexDaily: 0 }),
    getEtsRouteFactor: () => Number(values['ets-route-type']),
    calcularPrecioObjetivo: (base, margin) => Math.max(0, Number(base) || 0) * (1 + ((Number(margin) || 0) / 100)),
  };
  vm.runInNewContext(
    `${calculatorSource}; globalThis.result = calcularViaje({ dwt: ${Number(values['vessel-dwt']) || 0}, hasScrubber: false });`,
    context,
  );
  return { result: context.result, elements };
}

function assertValidBreakEven(testNumber, result) {
  assert.notEqual(result, undefined);
  assert.notEqual(result.breakEven, undefined);
  assert.equal(Number.isFinite(result.breakEven), true);
  console.log(`Calculadora reparada. Resultado de prueba ${testNumber}: ${result.breakEven}. Integridad de fórmula validada`);
}

test('break-even returns zero for zero cargo', () => {
  const { result } = runCalculator({ 'cargo-qty': 0 });
  assertValidBreakEven(1, result);
  assert.equal(result.breakEven, 0);
});

test('break-even remains finite for negative edge inputs', () => {
  const { result } = runCalculator({
    'cargo-qty': -100,
    'pda-pol': -5000,
    'opex-daily': -1000,
    'comm-pct': -10,
  });
  assertValidBreakEven(2, result);
});

test('break-even accepts the selected cargo type when the manual description is empty', () => {
  const { result, elements } = runCalculator();
  const context = {
    Boolean,
    Number,
    String,
    document: { getElementById: (id) => elements.get(id) || null },
  };
  vm.runInNewContext(`${requiredInputsSource}; globalThis.ready = hasRequiredCalculationInputs();`, context);
  assert.equal(context.ready, true);
  assertValidBreakEven(3, result);
  assert.ok(result.breakEven > 0);
});

test('laytime uses cargo divided by both real rates plus turn time hours', () => {
  const { result } = runCalculator({
    'cargo-qty': 12000,
    'rate-load': 3000,
    'rate-disch': 4000,
    'turn-time-hours': 12,
  });

  assert.equal(result.laytimeDays, 7.5);
  assert.equal(result.turnTimeDays, 0.5);
  assert.ok(result.totalOpex > 0);
});

test('slower real port rates increase voyage days and break-even', () => {
  const fast = runCalculator({ 'rate-load': 6000, 'rate-disch': 6000 }).result;
  const slow = runCalculator({ 'rate-load': 2000, 'rate-disch': 2000 }).result;

  assert.ok(slow.totalDays > fast.totalDays);
  assert.ok(slow.totalOpex > fast.totalOpex);
  assert.ok(slow.breakEven > fast.breakEven);
});

test('changing turn time from 12 to 48 hours increases billable days and break-even', () => {
  const twelveHours = runCalculator({ 'turn-time-hours': 12 }).result;
  const fortyEightHours = runCalculator({ 'turn-time-hours': 48 }).result;

  assert.equal(fortyEightHours.turnTimeDays - twelveHours.turnTimeDays, 1.5);
  assert.ok(fortyEightHours.totalDays > twelveHours.totalDays);
  assert.ok(fortyEightHours.totalOpex > twelveHours.totalOpex);
  assert.ok(fortyEightHours.breakEven > twelveHours.breakEven);
});

test('break-even safely handles a one-hundred-percent commission', () => {
  const { result } = runCalculator({ 'comm-pct': 100 });
  assertValidBreakEven(4, result);
  assert.equal(result.breakEven, 0);
});

test('break-even remains finite for very high costs and cargo', () => {
  const { result } = runCalculator({
    'cargo-qty': 1000000,
    'pda-pol': 1000000000,
    'pda-pod': 1000000000,
    'opex-daily': 1000000,
    'price-sea': 100000,
  });
  assertValidBreakEven(5, result);
  assert.ok(result.breakEven > 0);
});
