import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const draftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');
const extractorSource = await readFile(new URL('../netlify/functions/nlp-voyage-extract.ts', import.meta.url), 'utf8');
const dictionarySource = await readFile(new URL('../netlify/functions/_shared/nlp-voyage-dictionary.mjs', import.meta.url), 'utf8');
const wpiClientSource = await readFile(new URL('../src/wpi-catalog-client.js', import.meta.url), 'utf8');
const assistantFunctionSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const scenarioPolicySource = await readFile(new URL('../shared/voyage-scenario-policy.mjs', import.meta.url), 'utf8');
const cargoMapperSource = await readFile(new URL('../shared/cargo-mapper.mjs', import.meta.url), 'utf8');

test('assistant extracts voyage intent and renders an explicit injection action', () => {
  assert.match(assistantSource, /const NLP_ENDPOINT = "\/api\/nlp-voyage-extract"/);
  assert.match(assistantSource, /Promise\.all\(\[chatRequest, extractionRequest\]\)/);
  assert.match(assistantSource, /Sí, inyectar y calcular/);
  assert.match(assistantSource, /window\.injectVoyageScenario\(scenario\)/);
  assert.match(assistantSource, /validateScenarioPortsWithWpi/);
  assert.match(assistantSource, /Inyectar datos y revisar puertos/);
  assert.match(assistantSource, /sca-voyage-action__warning/);
  assert.match(assistantSource, /hasMinimumVoyageRoute\(scenario\)/);
  assert.match(assistantSource, /He detectado tu ruta/);
  assert.match(assistantSource, /ruta preliminar y calculamos el resto después/);
  assert.match(assistantFunctionSource, /POL y POD son suficientes para continuar/);
  assert.match(assistantFunctionSource, /no interrogues al usuario ni pidas fechas, cantidad, mercancía o ritmos/);
});

test('voyage injection updates DraftVoyage, calculator fields and starts the engine', () => {
  assert.match(storeSource, /applyNlpScenario/);
  assert.match(storeSource, /scenario\.pol_port \|\| scenario\.pol/);
  assert.match(storeSource, /lastSource: 'assistant-nlp'/);
  assert.match(draftEntrySource, /window\.injectVoyageScenario = injectVoyageScenario/);
  assert.match(draftEntrySource, /selectValidatedWpiPort\(inputId, scenario\.pol_port\)/);
  assert.match(draftEntrySource, /setPortSelectionWarning/);
  assert.match(draftEntrySource, /requiresPortSelection/);
  assert.match(draftEntrySource, /window\.syncSelectedRoutePort\?\.\('POL', pol\)/);
  assert.match(draftEntrySource, /window\.syncSelectedRoutePort\?\.\('POD', pod\)/);
  assert.match(draftEntrySource, /setValue\('cargo-qty', cargoQuantity\)/);
  assert.match(draftEntrySource, /window\.SeaCharterStore\?\.set/);
  assert.match(draftEntrySource, /window\.runEngine\(\)/);
  assert.match(storeSource, /officialLabel: cleanText\(source\.officialLabel\)/);
  assert.match(storeSource, /scenario\.cargo_qty !== undefined \|\| scenario\.cargoQty !== undefined/);
  assert.match(storeSource, /cleanNumber\(scenario\.cargo_qty \?\? scenario\.cargoQty\) \|\| current\.draft\.cargo\.quantityMt/);
  assert.match(storeSource, /normalizeNlpPort/);
  assert.match(draftEntrySource, /normalizeNlpVoyagePayload\(incomingScenario\)/);
  assert.match(draftEntrySource, /applyVoyageScenarioDefaults\(incomingScenario\)/);
  assert.match(draftEntrySource, /setSelectValue\('cargo-type-manual', cargoSpecification\)/);
  assert.match(draftEntrySource, /setSelectValue\('laytime-load-condition', payload\.laytimePOL\)/);
  assert.match(draftEntrySource, /setSelectValue\('laytime-disch-condition', payload\.laytimePOD\)/);
  assert.match(draftEntrySource, /scenario\.is_partial/);
  assert.match(draftEntrySource, /\.\.\.previousCalculatorState/);
  assert.match(draftEntrySource, /ritmoRealPol: loadingRate/);
  assert.match(draftEntrySource, /ritmoRealPod: dischargeRate/);
  assert.match(extractorSource, /Las palabras literales "POL" y "POD" son etiquetas de campo/);
  assert.match(draftEntrySource, /runOnDemandMapRouteWorkflow/);
  assert.match(draftEntrySource, /if \(hasIncomingRoute && !requiresPortSelection\)/);
  assert.doesNotMatch(draftEntrySource, /hasIncomingRoute && !requiresPortSelection && scenario\.is_partial/);
  assert.match(scenarioPolicySource, /loading_terms: "CQD"/);
  assert.match(scenarioPolicySource, /DEFAULT_LAYDAYS_OFFSET_DAYS = 4/);
  assert.match(scenarioPolicySource, /DEFAULT_LAYCAN_WINDOW_DAYS = 5/);
});

test('NLP schema includes cargo type and supports Spanish natural dates', () => {
  assert.match(extractorSource, /cargo_type: string/);
  assert.match(dictionarySource, /const MONTHS/);
  assert.match(extractorSource, /siguiente ocurrencia futura/);
  for (const field of ['dwt', 'methodPOL', 'methodPOD', 'ratePOL', 'ratePOD']) {
    assert.match(extractorSource, new RegExp(`${field}:`));
  }
  for (const field of ['cargo_category', 'cargo_product', 'cargo_specification', 'laytimePOL', 'laytimePOD']) {
    assert.match(extractorSource, new RegExp(`${field}:`));
  }
  assert.match(extractorSource, /enum: \["", \.\.\.CARGO_CATEGORIES\]/);
  assert.match(extractorSource, /enum: CARGO_SPECIFICATION_IDS/);
  assert.match(extractorSource, /enum: CARGO_METHODS/);
  assert.match(extractorSource, /enum: LAYTIME_TERMS/);
  assert.match(cargoMapperSource, /methodPOD[\s\S]*\|\| methodPOL/);
  assert.match(cargoMapperSource, /"100": "100 - Otros \(N\/A\)"/);
  assert.match(draftEntrySource, /resolveBigBagsMethod/);
  assert.match(draftEntrySource, /applyManualOperationalRate/);
  assert.match(dictionarySource, /toneladas/);
  assert.doesNotMatch(extractorSource, /validateWpiVoyagePorts|wpi-port-resolver|WPI\.csv/);
  assert.match(wpiClientSource, /findExactPort/);
  assert.match(extractorSource, /netlify-ai-gateway/);
});
