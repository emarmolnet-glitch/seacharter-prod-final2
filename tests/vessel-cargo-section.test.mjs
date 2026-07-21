import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
