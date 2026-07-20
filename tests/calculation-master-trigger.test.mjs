import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const persistenceSource = await readFile(new URL('../netlify/functions/calculation-state.ts', import.meta.url), 'utf8');

test('owner and charterer calculator buttons emit the global calculation event', () => {
  assert.match(indexSource, /id="btn-calc-owner-freight"[^>]*onclick="handleFreightMasterTrigger\('owner', event\)"/);
  assert.match(indexSource, /id="btn-calc-charter-freight"[^>]*onclick="handleFreightMasterTrigger\('charterer', event\)"/);

  const triggerStart = indexSource.indexOf('function handleFreightMasterTrigger');
  const triggerEnd = indexSource.indexOf('window.handleFreightMasterTrigger = handleFreightMasterTrigger;', triggerStart);
  const triggerSource = indexSource.slice(triggerStart, triggerEnd);
  assert.match(triggerSource, /useAlgorithmicFreight\(role\)/);
  assert.match(triggerSource, /console\.log\('DEBUG: Botón clicado, disparando evento\.\.\.'\)/);
  assert.match(triggerSource, /buildCalculationEventPayload\(role\)/);
  assert.match(triggerSource, /calculation\.matchingRequest = buildMatchingRequest\(calculation\)/);
  assert.match(triggerSource, /window\.persistMatchingRequest\(calculation\.matchingRequest\)/);
  assert.match(triggerSource, /new CustomEvent\('CALCULATION_EVENT', \{ detail: calculation \}\)/);
  assert.ok(triggerSource.indexOf('window.persistMatchingRequest') < triggerSource.indexOf("new CustomEvent('CALCULATION_EVENT'"));
});

test('pipeline subscriber exposes the calculation payload in browser diagnostics', () => {
  const listenerStart = indexSource.indexOf("window.addEventListener('CALCULATION_EVENT'");
  const listenerEnd = indexSource.indexOf("window.addEventListener('RADAR_LIVE_BATCH_READY'", listenerStart);
  const listenerSource = indexSource.slice(listenerStart, listenerEnd);
  assert.match(listenerSource, /console\.log\('DEBUG: Evento recibido en Pipeline\. Payload:', event\.detail\)/);
});

test('calculation event payload persists bounded operational data without secrets', () => {
  assert.match(indexSource, /calculationId/);
  assert.match(indexSource, /trigger: role === 'owner' \? 'owner-freight' : 'charterer-freight'/);
  assert.match(indexSource, /cargo: \{/);
  assert.match(indexSource, /freight: \{/);
  assert.match(indexSource, /economics: \{/);
  assert.doesNotMatch(indexSource.slice(indexSource.indexOf('function buildCalculationEventPayload'), indexSource.indexOf('function handleFreightMasterTrigger')), /token|secret|authorization/i);
});

test('calculation persistence uses the existing Netlify Database AppConfig table', () => {
  assert.match(persistenceSource, /CALCULATION_STATE_CONFIG_KEY = "latest_calculation_state"/);
  assert.match(persistenceSource, /ensureApplicationSchema\(\)/);
  assert.match(persistenceSource, /\.insert\(appConfig\)/);
  assert.match(persistenceSource, /onConflictDoUpdate/);
  assert.match(persistenceSource, /MAX_CALCULATION_PAYLOAD_BYTES = 256_000/);
  assert.match(persistenceSource, /path: "\/api\/calculation-state"/);
  assert.doesNotMatch(persistenceSource, /secret|token|authorization/i);
});

test('frontend persistence retries in background and stops the pipeline on terminal failure', () => {
  assert.match(indexSource, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(indexSource, /setTimeout\(resolve, attempt \* 250\)/);
  assert.match(indexSource, /state\.phase = 'persistence-error'/);
  assert.match(indexSource, /new CustomEvent\('CALCULATION_PERSISTENCE_FAILED'/);
  assert.match(indexSource, /CALCULATION_PERSISTENCE_FAILED[\s\S]*return false/);
});
