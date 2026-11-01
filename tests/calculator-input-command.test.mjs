import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parseCalculatorInputCommand } from '../shared/calculator-input-command.mjs';

const source = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('direct calculator assignments recognize inputs and Spanish numeric formats', () => {
  for (const [text, field, value] of [
    ['cambiar el flete de venta a 47.50', 'freight-sell', 47.5],
    ['Por favor, modifica el flete de compra a 42,75', 'freight-rate', 42.75],
    ['ajusta el ritmo de carga a 1.500', 'rate-load', 1500],
    ['pon el ritmo de descarga en 2,000', 'rate-disch', 2000],
    ['actualiza las demoras a 15.250,50', 'demurrage-rate', 15250.5],
    ['fija las horas de demora a 0', 'asb-delay-hours-main', 0],
  ]) assert.deepEqual(parseCalculatorInputCommand(text), [{ action: 'update_field', field, value }]);
});

test('market questions, simulations and strategic conditionals do not execute assignments', () => {
  for (const text of [
    '¿Conviene cambiar el flete de venta a 47.50?',
    'Si cambia el mercado, cambia el flete de venta a 47.50',
    'Simula un flete desde Valencia a Orán para 30.000 toneladas',
    '¿Qué flete de mercado hay para 30000 toneladas?',
    'cambia el ritmo de carga a 0',
    'cambia el flete a 47.50',
    'cambia las demoras a -20',
  ]) assert.equal(parseCalculatorInputCommand(text), null, text);
});

test('assignments update DOM inputs without reaching remote services even with Cerebro active', async () => {
  const fields = new Map(['freight-sell', 'rate-load', 'demurrage-rate'].map(id => [id, {
    id, dataset: {}, events: [], removeAttribute() {},
    dispatchEvent(event) { this.events.push(event.type); },
  }]));
  let recalculations = 0;
  const sandbox = {
    parseCalculatorInputCommand,
    findActionableAiField: name => fields.get(name),
    normalizeActionFieldName: name => name,
    window: { runEngine() { recalculations++; }, recalcularDiasPuerto() {}, setRitmoMode() {}, dispatchEvent() {} },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class {},
    iaActiva: 'cerebro',
    fetch() { assert.fail('Local command must never call fetch'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(source.indexOf('function executeActionableAiUpdate(action)'), source.indexOf('function clickActionableAiFinalValidationButton')), sandbox);
  vm.runInContext(source.slice(source.indexOf('async function requestAssistantResponse('), source.indexOf('function normalizeDataBridgeAssistantResponse')), sandbox);
  const response = await sandbox.requestAssistantResponse('cambiar el flete de venta a 47.50', null, null);
  assert.equal(response.local, true);
  assert.equal(fields.get('freight-sell').value, '47.5');
  assert.deepEqual(fields.get('freight-sell').events, ['input', 'change']);
  await sandbox.requestAssistantResponse('modifica el ritmo de carga a 1500 y cambia las demoras a 12000', null, null);
  assert.equal(fields.get('rate-load').dataset.manualOverride, 'true');
  assert.equal(fields.get('rate-load').value, '1500');
  assert.equal(fields.get('demurrage-rate').value, '12000');
  assert.equal(recalculations, 3);
  fields.delete('freight-sell');
  assert.equal((await sandbox.requestAssistantResponse('cambia el flete de venta a 48', null, null)).local, true);
});
