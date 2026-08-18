import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assistantSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const draftEntrySource = await readFile(new URL('../src/voyage-draft-entry.js', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../src/stores/voyage-store.js', import.meta.url), 'utf8');
const extractorSource = await readFile(new URL('../netlify/functions/nlp-voyage-extract.ts', import.meta.url), 'utf8');
const dictionarySource = await readFile(new URL('../netlify/functions/_shared/nlp-voyage-dictionary.mjs', import.meta.url), 'utf8');

test('assistant extracts voyage intent and renders an explicit injection action', () => {
  assert.match(assistantSource, /const NLP_ENDPOINT = "\/api\/nlp-voyage-extract"/);
  assert.match(assistantSource, /Promise\.all\(\[chatRequest, extractionRequest\]\)/);
  assert.match(assistantSource, /Sí, inyectar y calcular/);
  assert.match(assistantSource, /window\.injectVoyageScenario\(scenario\)/);
});

test('voyage injection updates DraftVoyage, calculator fields and starts the engine', () => {
  assert.match(storeSource, /applyNlpScenario/);
  assert.match(storeSource, /lastSource: 'assistant-nlp'/);
  assert.match(draftEntrySource, /window\.injectVoyageScenario = injectVoyageScenario/);
  assert.match(draftEntrySource, /setValue\('port-pol', pol\)/);
  assert.match(draftEntrySource, /window\.syncSelectedRoutePort\?\.\('POL', pol\)/);
  assert.match(draftEntrySource, /window\.syncSelectedRoutePort\?\.\('POD', pod\)/);
  assert.match(draftEntrySource, /setValue\('cargo-qty', cargoQuantity\)/);
  assert.match(draftEntrySource, /window\.SeaCharterStore\?\.set/);
  assert.match(draftEntrySource, /window\.runEngine\(\)/);
});

test('NLP schema includes cargo type and supports Spanish natural dates', () => {
  assert.match(extractorSource, /cargo_type: string/);
  assert.match(dictionarySource, /const MONTHS/);
  assert.match(extractorSource, /siguiente ocurrencia futura/);
  assert.match(dictionarySource, /toneladas/);
});
