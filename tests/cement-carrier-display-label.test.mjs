import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const engine = require('../voyage-cost-engine.js');
const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('cement display label detects product, bridge aliases and pneumatic packaging', () => {
  for (const cargo of [
    { productoEspecifico: 'Cemento a granel' },
    { cargoProduct: 'CEMENTO A GRANEL' },
    { cargo_product: 'Big Bags (Minerales/Cemento)' },
    { cargoType: 'Cemento a granel' },
    { packaging: 'Semirremolque neumático' },
  ]) {
    const snapshot = JSON.stringify(cargo);
    assert.equal(engine.getVesselTypeDisplayLabel('Mini Bulker', cargo), 'Cement Carrier');
    assert.equal(JSON.stringify(cargo), snapshot);
  }
  assert.equal(engine.getVesselTypeDisplayLabel('Mini Bulker', { cargoProduct: 'Trigo' }), 'Mini Bulker');
});

test('technical badge switches dynamically while operational classification stays unchanged', () => {
  const badge = { innerText: 'Mini Bulker', dataset: {} };
  const product = { value: 'Cemento a granel' };
  const helper = { textContent: '' };
  const elements = { 'vessel-badge': badge, 'cargo-product': product, 'cargo-vessel-class-display': helper };
  const document = { getElementById: id => elements[id] || null };
  const state = { class: 'Mini Bulker' };
  const context = { document, window: { State: state, SeaCharterVoyageCostEngine: {
    getVesselTypeDisplayLabel: type => engine.getVesselTypeDisplayLabel(type, {}, document),
  } } };
  const functions = ['getCentralizedVesselClass', 'updateCargoVesselClassDisplay']
    .map(name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n        \\}`))[0]).join('\n');
  vm.runInNewContext(functions, context);
  context.updateCargoVesselClassDisplay();
  assert.equal(badge.innerText, 'Cement Carrier');
  assert.equal(context.getCentralizedVesselClass(), 'Mini Bulker');
  assert.equal(state.class, 'Mini Bulker');
  product.value = 'Trigo';
  context.updateCargoVesselClassDisplay();
  assert.equal(badge.innerText, 'Mini Bulker');
  assert.equal(helper.textContent, 'Clasificado como: Mini Bulker');
});

test('executive dashboard renders the cement label without changing calculated results', () => {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} } });
    return elements.get(id);
  } };
  const results = { pol: 'Barcelona', pod: 'Valencia', cargoQty: 10000,
    cargoProduct: 'Cemento a granel', vesselType: 'Mini Bulker', seaDays: 2, portDays: 3, totalDays: 5 };
  const snapshot = JSON.stringify(results);
  engine.updateExecutiveDashboard(results, {}, document);
  assert.equal(elements.get('exec-vessel-type').textContent, 'Cement Carrier');
  assert.equal(JSON.stringify(results), snapshot);
  engine.updateExecutiveDashboard({ ...results, cargoProduct: 'Trigo' }, {}, document);
  assert.equal(elements.get('exec-vessel-type').textContent, 'Mini Bulker');
});
