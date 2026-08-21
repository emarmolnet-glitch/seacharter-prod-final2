import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('chat assistant keeps four deterministic checklist phases in local state', () => {
  assert.match(frontendSource, /const NLP_CHECKLIST_PROMPTS = Object\.freeze/);
  assert.match(frontendSource, /let nlpChecklistStep = 1;/);
  assert.match(frontendSource, /let nlpChecklistData = \{\};/);
  assert.match(frontendSource, /if \(nlpChecklistStep === 1\)/);
  assert.match(frontendSource, /nlpChecklistStep = 2;/);
  assert.match(frontendSource, /if \(nlpChecklistStep === 2\)/);
  assert.match(frontendSource, /nlpChecklistStep = 3;/);
  assert.match(frontendSource, /if \(nlpChecklistStep === 3\)/);
  assert.match(frontendSource, /nlpChecklistStep = 4;/);
});

test('chat assistant uses fixed imperative prompts in the required order', () => {
  assert.match(frontendSource, /Indica obligatoriamente la ruta y las toneladas/);
  assert.match(frontendSource, /Indica obligatoriamente la categoría de la carga/);
  assert.match(frontendSource, /Indica obligatoriamente el producto/);
  assert.match(frontendSource, /Indica obligatoriamente ambos ritmos/);
  assert.match(frontendSource, /return \{ complete: false, prompt: NLP_CHECKLIST_PROMPTS\[1\] \}/);
  assert.match(frontendSource, /return \{ complete: false, prompt: NLP_CHECKLIST_PROMPTS\[2\] \}/);
  assert.match(frontendSource, /return \{ complete: false, prompt: NLP_CHECKLIST_PROMPTS\[3\] \}/);
  assert.match(frontendSource, /return \{ complete: false, prompt: NLP_CHECKLIST_PROMPTS\[4\] \}/);
});

test('checklist parsing is local and does not call the generative endpoint', () => {
  const processorStart = frontendSource.indexOf('const processNlpChecklistInput = (userText) =>');
  const processorEnd = frontendSource.indexOf('\n  try {', processorStart);
  assert.ok(processorStart >= 0 && processorEnd > processorStart);
  assert.equal(frontendSource.slice(processorStart, processorEnd).includes('fetch('), false);
  assert.match(frontendSource, /extractChecklistRouteAndTonnage\(userText\)/);
  assert.match(frontendSource, /extractChecklistProduct\(userText\)/);
  assert.match(frontendSource, /extractChecklistRates\(userText\)/);
});

test('the final rates response executes the headless NLP engine immediately', () => {
  assert.match(frontendSource, /const nlpEngine = await waitForHeadlessNlpEngine\(\)/);
  assert.match(frontendSource, /const executionResult = await nlpEngine\.execute\(checklistResult\.payload\)/);
  assert.match(frontendSource, /Ruta, costes y mapa calculados automáticamente/);
  assert.match(frontendSource, /sea-assistant:nlp-checklist-completed/);
  assert.match(frontendSource, /resetNlpChecklist\(\);/);
  assert.doesNotMatch(frontendSource, /Datos pre-grabados\. ¿Estás conforme\?/);
});
