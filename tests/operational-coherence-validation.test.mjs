import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const nplEngineSource = readFileSync(new URL('../npl-data-analysis-engine.js', import.meta.url), 'utf8');

function setupContext() {
  let alertHidden = true;
  let headerText = '';
  let diagText = '';
  let causeText = '';
  let behaviorText = '';

  const mockAlertEl = {
    classList: {
      toggle: (cls, force) => {
        if (cls === 'hidden') alertHidden = !force;
      },
      add: (cls) => { if (cls === 'hidden') alertHidden = true; },
      remove: (cls) => { if (cls === 'hidden') alertHidden = false; }
    }
  };

  const context = {
    window: {
      State: {}
    },
    global: {},
    document: {
      getElementById: (id) => {
        if (id === 'operational-coherence-alert') return mockAlertEl;
        if (id === 'coherence-alert-header') return { set textContent(v) { headerText = v; }, get textContent() { return headerText; } };
        if (id === 'coherence-alert-diagnostic') return { set textContent(v) { diagText = v; }, get textContent() { return diagText; } };
        if (id === 'coherence-alert-cause') return { set textContent(v) { causeText = v; }, get textContent() { return causeText; } };
        if (id === 'coherence-alert-behavior') return { set textContent(v) { behaviorText = v; }, get textContent() { return behaviorText; } };
        return null;
      }
    }
  };

  context.global = context.window;
  context.window.window = context.window;

  vm.runInNewContext(nplEngineSource, context);
  return { context, getAlertHidden: () => alertHidden, mockAlertEl };
}

test('Validador Operativo: index.html contains #operational-coherence-alert soft warning component', () => {
  assert.match(indexSource, /id="operational-coherence-alert"/);
  assert.match(indexSource, /id="coherence-alert-header"/);
  assert.match(indexSource, /id="coherence-alert-diagnostic"/);
  assert.match(indexSource, /id="coherence-alert-cause"/);
  assert.match(indexSource, /id="coherence-alert-behavior"/);
});

test('Validador Operativo (Modo Manual): Detects total volume vs TMD daily rate swap/confusion', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  const result = validator('Manual', {
    cargoQty: 30000,
    cargoCategory: 'Minerales y Construcción',
    cargoProduct: 'Clínker',
    methodPol: 'Cuchara (Grab) - Grúa Barco',
    rateLoad: 30000,
    rateDisch: 30000
  });

  assert.equal(result.active, true, 'Should detect anomaly when rate equals total cargo volume');
  assert.equal(result.mode, 'Modo Manual');
  assert.match(result.diagnosis, /Incompatibilidad detectada entre el tipo de mercancía \(Clínker\)/);
  assert.match(result.probableCause, /Confusión entre la cantidad total \(30,000 MT\) y la tasa diaria/);
  assert.match(result.formattedAlert, /\[ALERTA DE COHERENCIA OPERATIVA \(Modo Manual\)\]/);
  assert.match(result.formattedAlert, /Comportamiento: Mostrar advertencia visual permitiendo al usuario continuar/);
});

test('Validador Operativo (Modo Manual): Detects mechanical incompatibility (Bombas Neumáticas + Clínker)', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  const result = validator('Manual', {
    cargoQty: 25000,
    cargoCategory: 'Minerales y Construcción',
    cargoProduct: 'Clínker',
    methodPol: 'Bombas Neumáticas',
    rateLoad: 4000,
    rateDisch: 4000
  });

  assert.equal(result.active, true, 'Bombas Neumáticas cannot pump Clíker');
  assert.match(result.probableCause, /físicamente incompatible con productos no pulverulentos/);
});

test('Validador Operativo (Modo Manual): Detects mechanical incompatibility (Cinta Transportadora + Carga Siderúrgica)', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  const result = validator('Manual', {
    cargoQty: 15000,
    cargoCategory: 'Carga Siderúrgica y Metales',
    cargoProduct: 'Bobinas de Acero',
    methodPol: 'Cinta Transportadora',
    rateLoad: 3000,
    rateDisch: 3000
  });

  assert.equal(result.active, true, 'Conveyor belt cannot carry steel coils');
  assert.match(result.probableCause, /Cinta Transportadora no permite la manipulación de piezas siderúrgicas/);
});

test('Validador Operativo (Modo Manual): Detects ship crane ceiling breach for Big Bags', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  const result = validator('Manual', {
    cargoQty: 20000,
    cargoCategory: 'Carga Unitizada / Envasada',
    cargoProduct: 'Big Bags - Cemento',
    methodPol: 'Big Bags - Grúa Barco',
    rateLoad: 8000,
    rateDisch: 8000
  });

  assert.equal(result.active, true, '8000 MT/D exceeds ship crane ceiling for big bags');
  assert.match(result.probableCause, /Superación del límite técnico de las grúas del buque para carga envasada/);
});

test('Validador Operativo (Modo Automático): Intelligently auto-corrects TMD swap and flags soft warning', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  // AI extracted quantity = 2500 MT, rate = 25000 TM/D for a 25,000 MT cargo
  const result = validator('Automático', {
    cargoQty: 2500,
    cargoCategory: 'Minerales y Construcción',
    cargoProduct: 'Cemento a granel',
    methodPol: 'Cinta Transportadora',
    rateLoad: 25000,
    rateDisch: 25000,
    preventDomUpdate: true
  });

  assert.equal(result.active, true);
  assert.equal(result.qty, 25000, 'Quantities should be intelligently swapped to 25,000 MT');
  assert.equal(result.rateLoad, 2500, 'Rate should be intelligently swapped to 2,500 TM/D');
  assert.equal(result.mode, 'Modo Automático');
  assert.match(result.diagnosis, /Incompatibilidad detectada/);
  assert.match(result.probableCause, /Incongruencia detectada en extracción automática: Confusión entre cantidad total/);
  assert.match(result.formattedAlert, /\[ALERTA DE COHERENCIA OPERATIVA \(Modo Automático\)\]/);
});

test('Validador Operativo: Valid operation returns active = false and no anomaly', () => {
  const { context } = setupContext();
  const validator = context.window.validateOperationalCoherence;

  const result = validator('Manual', {
    cargoQty: 25000,
    cargoCategory: 'Minerales y Construcción',
    cargoProduct: 'Cemento a granel',
    methodPol: 'Cinta Transportadora',
    methodPod: 'Bombas Neumáticas',
    rateLoad: 12000,
    rateDisch: 8000
  });

  assert.equal(result.active, false, 'Valid combination should have active = false');
});
