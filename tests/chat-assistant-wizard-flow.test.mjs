import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('chat assistant has no deterministic checklist state', () => {
  assert.doesNotMatch(frontendSource, /NLP_CHECKLIST_PROMPTS/);
  assert.doesNotMatch(frontendSource, /nlpChecklistStep/);
  assert.doesNotMatch(frontendSource, /nlpChecklistData/);
  assert.doesNotMatch(frontendSource, /processNlpChecklistInput/);
  assert.doesNotMatch(frontendSource, /resetNlpChecklist/);
});

test('chat assistant does not impose fixed freight prompts', () => {
  assert.doesNotMatch(frontendSource, /Indica obligatoriamente la ruta y las toneladas/);
  assert.doesNotMatch(frontendSource, /Indica obligatoriamente la categoría de la carga/);
  assert.doesNotMatch(frontendSource, /Indica obligatoriamente el producto/);
  assert.doesNotMatch(frontendSource, /Indica obligatoriamente ambos ritmos/);
});

test('every submitted message calls the generative endpoint directly', () => {
  assert.match(frontendSource, /const response = await requestAssistantResponse\(userText, history, controller\.signal\)/);
  assert.doesNotMatch(frontendSource, /extractChecklistRouteAndTonnage/);
  assert.doesNotMatch(frontendSource, /extractChecklistProduct/);
  assert.doesNotMatch(frontendSource, /extractChecklistRates/);
});

test('the backend response drives visible text and screen actions', () => {
  assert.match(frontendSource, /const actionableResponse = extractActionableAiResponse\(response\.respuesta\)/);
  assert.match(frontendSource, /const action = response\.action && typeof response\.action === "object"/);
  assert.match(frontendSource, /: actionableResponse\.action/);
  assert.match(frontendSource, /if \(action\) await executeActionableAiAction\(action\)/);
  assert.match(frontendSource, /actionableResponse\.visibleText \|\| "Acción completada\."/);
  assert.doesNotMatch(frontendSource, /waitForHeadlessNlpEngine/);
});
