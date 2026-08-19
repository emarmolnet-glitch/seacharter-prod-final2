import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('chat assistant captures the four wizard phases in local state', () => {
  assert.match(frontendSource, /let wizardStep = 1;/);
  assert.match(frontendSource, /const wizardData = \{\};/);
  assert.match(frontendSource, /wizardData\.routeAndTonnage = userText;[\s\S]*wizardStep = 2;/);
  assert.match(frontendSource, /wizardData\.cargoFormat = userText;[\s\S]*wizardStep = 3;/);
  assert.match(frontendSource, /wizardData\.ratesAndMachinery = userText;[\s\S]*wizardStep = 4;/);
  assert.match(frontendSource, /wizardData\.exactCargo = userText;/);
});

test('chat assistant returns locally before heavy requests in steps one through three', () => {
  const firstStep = frontendSource.indexOf('if (wizardStep === 1)');
  const fourthStep = frontendSource.indexOf('wizardData.exactCargo = userText;');
  const requestStart = frontendSource.indexOf('const controller = new AbortController();', firstStep);

  assert.ok(firstStep >= 0);
  assert.ok(fourthStep > firstStep);
  assert.ok(requestStart > fourthStep);
  assert.equal(frontendSource.slice(firstStep, fourthStep).includes('fetch('), false);
  assert.equal(frontendSource.slice(firstStep, fourthStep).includes('collectChatContext('), false);
});

test('step four sends the consolidated wizard data to chat and voyage extraction', () => {
  assert.match(frontendSource, /const wizardPrompt = \[/);
  assert.match(frontendSource, /mensaje: wizardPrompt, contexto/);
  assert.match(frontendSource, /extractVoyageScenario\(wizardPrompt, controller\.signal\)/);
});
