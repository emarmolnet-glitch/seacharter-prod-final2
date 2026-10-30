import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const moduleSource = source.slice(source.indexOf('        function calcularCadenciaCamionTolva(side'), source.indexOf('        function getOperacionModo()'));

function setup(pol = 'camion_tolva', pod = 'camion_tolva') {
  const elements = new Map();
  const element = (id, value = '') => {
    const el = { id, value, dataset: {}, textContent: '', classList: { toggle(name, state) { el[name] = state; } }, setAttribute(name, value) { el[name] = value; } };
    elements.set(id, el);
    return el;
  };
  element('cargo-qty', '10000');
  for (const side of ['pol', 'pod']) {
    element(`modulo-camion-tolva-${side}`);
    const prefix = side === 'pod' ? 'camion-tolva-pod-' : 'camion-tolva-';
    for (const field of ['capacidad-mt', 'slots', 'tiempo-ciclo-min', 'camiones-totales', 'ritmo-sugerido']) element(prefix + field);
  }
  element('rate-load');
  element('rate-disch');
  const published = {};
  const manual = {};
  let runs = 0;
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) },
    getMetodoEstibaActual: () => pol,
    getMetodoDescargaActual: () => pod,
    updateSection2LocalState() {},
    setRitmoManualIndicator() {},
    isRitmoModoManual: side => manual[side] === true,
    publicarRitmoRealEnEstado: (side, rate) => { published[side] = rate; },
    runEngine: () => { runs++; },
  });
  vm.runInContext(moduleSource, context);
  return { context, elements, published, manual, runs: () => runs };
}

test('POL and POD initialize independently and publish their respective rates without redundant reruns', () => {
  const { context, elements, published, runs } = setup();
  context.actualizarModuloCamionTolva();
  assert.equal(elements.get('camion-tolva-tiempo-ciclo-min').value, '35');
  assert.equal(elements.get('camion-tolva-slots').value, '1');
  assert.equal(elements.get('camion-tolva-pod-tiempo-ciclo-min').value, '15');
  assert.equal(elements.get('camion-tolva-pod-slots').value, '2');
  assert.equal(elements.get('rate-load').value, '1110');
  assert.equal(elements.get('rate-disch').value, '5184');
  assert.equal(elements.get('camion-tolva-pod-ritmo-sugerido').textContent, '5,184');
  assert.deepEqual(published, { pol: 1110, pod: 5184 });
  assert.equal(runs(), 1);
  context.actualizarModuloCamionTolva();
  assert.equal(runs(), 1);
  elements.get('camion-tolva-tiempo-ciclo-min').value = '60';
  context.actualizarModuloCamionTolva();
  assert.equal(elements.get('rate-load').value, '648');
  assert.equal(elements.get('rate-disch').value, '5184');
  elements.get('camion-tolva-pod-slots').value = '3';
  context.actualizarModuloCamionTolva();
  assert.equal(elements.get('rate-disch').value, '7776');
  assert.equal(elements.get('rate-load').value, '648');
});

for (const side of ['pol', 'pod']) test(`only the selected ${side.toUpperCase()} truck assistant activates`, () => {
  const { context, elements } = setup(side === 'pol' ? 'camion_tolva' : 'cinta_transportadora', side === 'pod' ? 'camion_tolva' : 'bombas_neumaticas');
  context.actualizarModuloCamionTolva({ rerun: false });
  assert.equal(elements.get('modulo-camion-tolva-pol').hidden, side !== 'pol');
  assert.equal(elements.get('modulo-camion-tolva-pod').hidden, side !== 'pod');
  assert.equal(elements.get(side === 'pod' ? 'rate-load' : 'rate-disch').value, '');
});

test('POD manual mode preserves the entered rate while continuing to show the truck calculation', () => {
  const { context, elements, manual } = setup();
  manual.pod = true;
  elements.get('rate-disch').value = '4000';
  context.actualizarModuloCamionTolva();
  assert.equal(elements.get('rate-disch').value, '4000');
  assert.equal(elements.get('camion-tolva-pod-ritmo-sugerido').textContent, '5,184');
  manual.pod = false;
  context.actualizarModuloCamionTolva();
  assert.equal(elements.get('rate-disch').value, '5184');
});

test('effective automatic rate uses the truck calculation for each side', () => {
  const { context } = setup();
  context.actualizarModuloCamionTolva({ rerun: false });
  context.isCustomPortMethod = () => false;
  vm.runInContext(source.slice(source.indexOf("        function calcularRitmoEfectivo(side"), source.indexOf('        function calculateDemurrageExposure(')), context);
  assert.equal(context.calcularRitmoEfectivo('pol'), 1110);
  assert.equal(context.calcularRitmoEfectivo('pod'), 5184);
});
