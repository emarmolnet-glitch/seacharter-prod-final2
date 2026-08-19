import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('chat assistant captures six strict wizard phases in local state', () => {
  assert.match(frontendSource, /let wizardStep = 1;/);
  assert.match(frontendSource, /const wizardData = \{\};/);
  assert.match(frontendSource, /wizardData\.routeAndVolume = userText;[\s\S]*wizardStep = 2;/);
  assert.match(frontendSource, /wizardData\.rates = userText;[\s\S]*wizardStep = 3;/);
  assert.match(frontendSource, /wizardData\.rateMode = "manual";/);
  assert.match(frontendSource, /wizardData\.cargoDescription = userText;[\s\S]*wizardStep = 4;/);
  assert.match(frontendSource, /wizardData\.packaging = userText;[\s\S]*wizardStep = 5;/);
  assert.match(frontendSource, /wizardData\.craneDetails = userText;[\s\S]*wizardStep = 6;/);
  assert.match(frontendSource, /let wizardStatus = "recopilando";/);
  assert.match(frontendSource, /let pendingWizardPayload = null;/);
});

test('chat assistant returns locally before the single extraction in steps one through five', () => {
  const firstStep = frontendSource.indexOf('if (wizardStep === 1)');
  const sixthStep = frontendSource.indexOf('const wizardPrompt = [', firstStep);
  const requestStart = frontendSource.indexOf('const controller = new AbortController();', firstStep);

  assert.ok(firstStep >= 0);
  assert.ok(sixthStep > firstStep);
  assert.ok(requestStart > sixthStep);
  assert.equal(frontendSource.slice(firstStep, sixthStep).includes('fetch('), false);
});

test('chat assistant asks for route dependencies in strict order', () => {
  assert.match(frontendSource, /ritmos de carga en POL y descarga en POD/);
  assert.match(frontendSource, /Qué mercancía transportas/);
  assert.match(frontendSource, /Cómo va presentada la carga/);
  assert.match(frontendSource, /Si conoces la maquinaria de POL o POD/);
  assert.match(frontendSource, /aplicaré la opción marítima recomendada/);
});

test('step six renders the retained payload summary before any store injection', () => {
  assert.match(frontendSource, /const wizardPrompt = \[/);
  assert.match(frontendSource, /await extractVoyageScenario\(wizardPrompt, controller\.signal\)/);
  assert.match(frontendSource, /validateSixStepWizardPayload\(wizardData, voyageExtraction\.scenario\)/);
  assert.match(frontendSource, /pendingWizardPayload = validatedScenario;/);
  assert.match(frontendSource, /getCargoMethodLabel\(payload\.methodPOL\)/);
  assert.match(frontendSource, /getCargoMethodLabel\(payload\.methodPOD\)/);
  assert.match(frontendSource, /wizardStatus = WIZARD_CONFIRMATION_STATUS;/);
  assert.match(frontendSource, /formatWizardPayloadSummary\(pendingWizardPayload\)/);
  const preparationStart = frontendSource.indexOf('const wizardPrompt = [');
  const confirmationAssignment = frontendSource.indexOf('wizardStatus = WIZARD_CONFIRMATION_STATUS;', preparationStart);
  assert.equal(frontendSource.slice(preparationStart, confirmationAssignment).includes('window.injectVoyageScenario('), false);
  assert.match(frontendSource, /📍 Ruta:/);
  assert.match(frontendSource, /📦 Mercancía:/);
  assert.match(frontendSource, /⚙️ Método Carga \(POL\):/);
  assert.match(frontendSource, /⚙️ Método Descarga \(POD\):/);
  assert.match(frontendSource, /⏱️ Laytime:/);
  assert.match(frontendSource, /Datos pre-grabados\. ¿Estás conforme\? Escribe \"sí\", \"ok\" o \"calcular\" para validar y lanzar la simulación\./);
});

test('confirmation listener performs the only real DraftVoyage injection', () => {
  const confirmationStart = frontendSource.indexOf('if (wizardStatus === WIZARD_CONFIRMATION_STATUS)');
  const injectionStart = frontendSource.indexOf('window.injectVoyageScenario(pendingWizardPayload, { deferFinalActions: true })', confirmationStart);
  const preparationStart = frontendSource.indexOf('const wizardPrompt = [', confirmationStart);

  assert.ok(confirmationStart >= 0);
  assert.ok(injectionStart > confirmationStart);
  assert.ok(preparationStart > injectionStart);
  assert.equal(frontendSource.slice(preparationStart).includes('window.injectVoyageScenario(validatedScenario)'), false);
  assert.match(frontendSource, /\["si", "ok", "calcular"\]\.includes\(normalizedValue\)/);
  assert.match(frontendSource, /await window\.finalizeAssistantVoyageInjection\(injectionResult\)/);
  assert.match(frontendSource, /finally \{[\s\S]*setPending\(false\);/);
  assert.match(frontendSource, /¡Datos inyectados! Mapa y Calculadora actualizados\./);
});
