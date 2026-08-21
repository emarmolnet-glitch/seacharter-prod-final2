import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCalculatorAutofillAction } from '../netlify/functions/_shared/calculator-autofill-reasoning.mjs';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const draftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');

const calculatorContext = {
  draftVoyage: {
    POL: 'Valencia',
    POD: 'Orán',
    cantidadMT: 32000,
    tipoCarga: 'Big Bags',
  },
};

test('system prompt always includes DraftVoyage, history and mandatory deduction rules', async () => {
  const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
  assert.match(backendSource, /incluye siempre DraftVoyage e historial/);
  assert.match(backendSource, /historialChat/);
  assert.match(backendSource, /Cantidad de Carga \(MT\).*margen del 8-10%/s);
  assert.match(backendSource, /<15k DWT = Mini-Bulker/);
  assert.match(backendSource, /carga unitizada \(Big Bags\/Pallets\)/);
  assert.match(backendSource, /NO pidas más datos/);
});

test('rates produce one complete calculator autofill payload from remembered cargo context', () => {
  const action = buildCalculatorAutofillAction('1500 carga y 2000 descarga', calculatorContext);

  assert.equal(action.type, 'calculator_autofill');
  assert.equal(action.loading_rate, 1500);
  assert.equal(action.discharge_rate, 2000);
  assert.equal(action.required_dwt, 35200);
  assert.equal(action.dwt, 35200);
  assert.equal(action.ratePOL, 1500);
  assert.equal(action.ratePOD, 2000);
  assert.equal(action.methodPOL, 'big_bags_barco');
  assert.equal(action.methodPOD, 'big_bags_barco');
  assert.equal(action.vessel_class, 'Handysize');
  assert.equal(action.loading_method.value, 'big_bags_barco');
  assert.equal(action.discharge_method.value, 'big_bags_barco');
  assert.equal(action.cargo_qty, 32000);
});

test('exceptionally high unitized rates escalate only the affected operation to port cranes', () => {
  const action = buildCalculatorAutofillAction('carga 1500, descarga 2500', calculatorContext);

  assert.equal(action.loading_method.value, 'big_bags_barco');
  assert.equal(action.discharge_method.value, 'big_bags_portuaria');
});

test('frontend renders one unified card and dispatches one global calculator action', () => {
  assert.match(frontendSource, /function collectConversationHistory\(historyElement\)/);
  assert.match(frontendSource, /CalculationData: collectCalculationData\(\)/);
  assert.match(frontendSource, /MarketData: collectMarketData\(\)/);
  assert.match(frontendSource, /UserContext: userText/);
  assert.match(frontendSource, /sanitizePayloadForAI\(requestPayload\)/);
  assert.match(frontendSource, /JSON\.stringify\(sanitizedPayload\)/);
  assert.match(frontendSource, /function createCalculatorAutofillActionCard\(action\)/);
  assert.match(frontendSource, /Autocompletar: Ritmos, Grúas y Buque/);
  assert.match(frontendSource, /new CustomEvent\("sea-assistant:calculator-autofill"/);
  assert.match(frontendSource, /payload\.action\?\.type === "calculator_autofill"/);
});

test('calculator handler applies cargo, DWT, class, methods and both rates in one batch', () => {
  assert.match(draftEntrySource, /function applyAssistantCalculatorAutofill\(payload = \{\}\)/);
  assert.match(draftEntrySource, /SeaCharterStore\.batch\(applyUpdates\)/);
  assert.match(draftEntrySource, /setSelectValue\('metodo_carga'/);
  assert.match(draftEntrySource, /setSelectValue\('metodo_descarga_pod'/);
  assert.match(draftEntrySource, /applyManualOperationalRate\('pol', loadingRate\)/);
  assert.match(draftEntrySource, /applyManualOperationalRate\('pod', dischargeRate\)/);
  assert.match(draftEntrySource, /input\.dataset\.manualOverride = 'true'/);
  assert.match(draftEntrySource, /ritmoRealPol: loadingRate/);
  assert.match(draftEntrySource, /ritmoRealPod: dischargeRate/);
  assert.match(draftEntrySource, /assistantOperationalDeductionSubscription/);
  assert.match(draftEntrySource, /setValue\('vessel-dwt', requiredDwt\)/);
  assert.match(draftEntrySource, /payload\.methodPOL/);
  assert.match(draftEntrySource, /payload\.methodPOD/);
  assert.match(draftEntrySource, /\['ratePOL', 'loading_rate', 'loadingRate'\]/);
  assert.match(draftEntrySource, /\['ratePOD', 'discharge_rate', 'dischargeRate'\]/);
  assert.match(draftEntrySource, /class: vesselClass/);
  assert.match(draftEntrySource, /source: 'assistant-calculator-autofill'/);
});
