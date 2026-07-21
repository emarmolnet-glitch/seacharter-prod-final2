import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { calculateVoyageCostState } = require('../voyage-cost-engine.js');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function getSelectMarkup(id) {
  return indexSource.match(new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0] || '';
}

test('section 2 exposes strict turn time and cascading cargo selectors', () => {
  assert.match(indexSource, /id="turn-time-hours"[\s\S]*?<option value="12">12 horas<\/option>[\s\S]*?<option value="24" selected>24 horas<\/option>[\s\S]*?<option value="48">48 horas<\/option>/);
  assert.match(indexSource, /id="cargo-type"[\s\S]*?Categoría de Carga|Categoría de Carga[\s\S]*?id="cargo-type"/);
  assert.match(indexSource, /id="cargo-product"/);
  assert.match(indexSource, /function populateCargoProducts/);
  assert.match(indexSource, /function applySelectedCargoProduct/);
});

test('calculator and GENCON share complete conditions and laytime catalogs', () => {
  assert.match(indexSource, /const GENCON_CONDITION_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /const GENCON_LAYTIME_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /id="freight-conditions"/);
  assert.match(indexSource, /id="laytime-load-condition"/);
  assert.match(indexSource, /id="laytime-disch-condition"/);
  ['FIO', 'FIOS', 'FIOT', 'FIOST', 'FILO', 'LIFO', 'LINER'].forEach((term) => {
    assert.match(indexSource, new RegExp(`value: '${term}'|value="${term}"`));
  });
  ['SHINC', 'SHEX', 'SHEX UU', 'SHEX EIU', 'FHINC', 'FHEX', 'SSHEX', 'SSHINC', 'CQD'].forEach((term) => {
    assert.match(indexSource, new RegExp(`'${term}'|value="${term}"`));
  });
});

test('POD crane count multiplies the effective discharge rate', () => {
  const start = indexSource.indexOf('const methodBaseRates =');
  const end = indexSource.indexOf('function calculateDemurrageExposure', start);
  const source = indexSource.slice(start, end);
  const values = {
    'metodo_carga': 'cuchara_grab',
    'metodo_descarga_pod': 'cuchara_grab',
    'rate-load': '1200',
    'rate-disch': '1200',
    'ritmo_nominal_pol': '1',
    'ritmo_nominal_pod': '2',
    'cargo-qty': '12000',
  };
  const elements = new Map(Object.entries(values).map(([id, value]) => [id, {
    value,
    dataset: { manualOverride: 'false' },
  }]));
  const context = {
    Math,
    parseFloat,
    document: { getElementById: (id) => elements.get(id) || null },
    normalizarTipoCarga: () => 'general',
    window: {},
  };

  vm.runInNewContext(`${source}; globalThis.podRate = calcularRitmoEfectivo('pod');`, context);

  assert.equal(context.podRate, 3000);
});

test('method base-rate dictionary drives automatic POL and POD rates', () => {
  assert.match(indexSource, /const methodBaseRates = Object\.freeze\(\{[\s\S]*?'Cinta Transportadora': 5000[\s\S]*?'Grúa Portuaria 30MT': 2500[\s\S]*?'Cuchara \(Grab\) - Grúa Barco': 1500[\s\S]*?'Big Bags \(con Grúa\)': 1000[\s\S]*?'Paletizado \/ Piezas \(con Grúa\)': 800[\s\S]*?'Hierro\/Acero\/Piezas': 1200[\s\S]*?'Camión Tolva': 'custom'/);
  assert.match(indexSource, /id="metodo_carga"[^>]*onchange="handlePortMethodChange\('pol'\)"/);
  assert.match(indexSource, /id="metodo_descarga_pod"[^>]*onchange="handlePortMethodChange\('pod'\)"/);
  assert.match(indexSource, /function marcarGruasManual[\s\S]*?setRitmoManualIndicator\(side, false\);[\s\S]*?recalcularDiasPuerto\(\)/);
  assert.match(indexSource, /return metodoPuertoUsaGruas\(metodo\) \? ritmoUnitario \* numeroGruas : ritmoUnitario/);
});

test('cargo dictionary contains SF and lifting requirements', () => {
  assert.match(indexSource, /"Minerales y Construcción": \[/);
  assert.match(indexSource, /"Biomasa y Combustibles Sólidos": \[/);
  assert.match(indexSource, /"Biomasa \(Grignon, Astillas, Pellets\)", sf: 1\.85, requiresPieceWeight: false/);
  assert.match(indexSource, /"Carga Unitizada \/ Envasada": \[/);
  assert.match(indexSource, /"Carga de Proyecto \(Breakbulk\)": \[/);
  assert.match(indexSource, /"Cemento a granel", sf: 0\.70, requiresPieceWeight: false/);
  assert.match(indexSource, /"Bobinas de Acero \(Steel Coils\)", sf: 0\.35, requiresPieceWeight: true/);
  assert.match(indexSource, /"Piezas Especiales \/ Maquinaria", sf: 2\.00, requiresPieceWeight: true/);
  assert.match(indexSource, /input\.required = requiresPieceWeight/);
  assert.match(indexSource, /if \(!requiresPieceWeight\) input\.value = '0'/);
});

test('cargo product and turn time options stay isolated', () => {
  const cargoProductMarkup = getSelectMarkup('cargo-product');
  const turnTimeMarkup = getSelectMarkup('turn-time-hours');

  assert.doesNotMatch(cargoProductMarkup, /horas|value="(?:12|24|48)"/);
  assert.doesNotMatch(turnTimeMarkup, /Cemento|Biomasa|Carbón|Acero|Paletizada|Maquinaria/);
  assert.match(indexSource, /const TURN_TIME_OPTIONS = Object\.freeze/);
  assert.match(indexSource, /replaceSelectOptions\(productEl, products\.map/);
  assert.match(indexSource, /replaceSelectOptions\(turnTimeEl, TURN_TIME_OPTIONS\)/);
});

test('backend port days use load, discharge and turn time only', () => {
  const result = calculateVoyageCostState({
    toneladas_carga: 12_000,
    dias_navegacion: 5,
    dias_puerto: (12_000 / 3_000) + (12_000 / 2_000),
    turn_time_hours: 48,
    dias_preparacion: 7,
    t_espera_fondeo: 3,
    delta_historico: 2,
    opex_fijo_diario: 1_000,
  });

  assert.equal(result.state.dias_puerto_total, 12);
  assert.equal(result.coste_opex_total, 17_000);
});
