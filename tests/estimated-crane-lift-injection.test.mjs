import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = indexSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `función no encontrada: ${name}`);

  let depth = 0;
  let seenBrace = false;
  for (let index = indexSource.indexOf('{', start); index < indexSource.length; index++) {
    const char = indexSource[index];
    if (char === '{') {
      depth++;
      seenBrace = true;
    } else if (char === '}') {
      depth--;
      if (seenBrace && depth === 0) return indexSource.slice(start, index + 1);
    }
  }
  throw new Error(`llaves desbalanceadas: ${name}`);
}

function createContext({ pol = '0', pod = '0', estimated = '17.48' } = {}) {
  const elements = new Map([
    ['crane-swl-mt', { value: estimated }],
    ['gruas-swl-pol', { value: pol, dataset: {} }],
    ['gruas-swl-pod', { value: pod, dataset: {} }]
  ]);
  const localState = {};
  const context = {
    Number,
    String,
    parseFloat,
    document: { getElementById: (id) => elements.get(id) || null },
    getSelectedMethodLabel: () => 'Paletizado - Grúa Barco',
    isCraneMethod: () => true,
    isBigBagsPortCraneMethod: () => false,
    getBigBagsPortCraneLiftCapacityMt: () => 21,
    getSwlForMethod: () => 4,
    updateSection2LocalState: (id, value) => { localState[id] = value; }
  };
  vm.runInNewContext([
    extractFunction('getEstimatedCraneLiftMt'),
    extractFunction('ensureCraneLiftValue')
  ].join('\n'), context);
  return { context, elements, localState };
}

test('inyecta el izado estimado en POL y POD cuando el campo está vacío o en cero', () => {
  const { context, elements, localState } = createContext({ pol: '', pod: '0' });

  assert.equal(context.ensureCraneLiftValue('pol'), 17.48);
  assert.equal(context.ensureCraneLiftValue('pod'), 17.48);
  assert.equal(elements.get('gruas-swl-pol').value, '17.48');
  assert.equal(elements.get('gruas-swl-pod').value, '17.48');
  assert.equal(localState['gruas-swl-pol'], '17.48');
  assert.equal(localState['gruas-swl-pod'], '17.48');
});

test('conserva una carga por izada manual positiva', () => {
  const { context, elements } = createContext({ pol: '12.5' });

  assert.equal(context.ensureCraneLiftValue('pol'), 12.5);
  assert.equal(elements.get('gruas-swl-pol').value, '12.5');
  assert.equal(elements.get('gruas-swl-pol').dataset.autoEstimatedLift, undefined);
});

test('mantiene la izada física fija de big bags con grúa portuaria', () => {
  const { context, elements } = createContext({ pol: '17.48' });
  context.isBigBagsPortCraneMethod = () => true;

  assert.equal(context.ensureCraneLiftValue('pol', 'Big Bags - Grúa Portuaria'), 21);
  assert.equal(elements.get('gruas-swl-pol').value, '21');
});
