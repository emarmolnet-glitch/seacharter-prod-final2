import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

test('Data Bridge appends the incremental action execution directive to the system prompt', () => {
  assert.match(backendSource, /Nueva directiva de ejecución:/);
  assert.match(backendSource, /"action": "update_field"/);
  assert.match(backendSource, /'pol_rate', 'freight_rate'/);
  assert.match(backendSource, /CONCISIÓN EXTREMA: Evita monólogos y charlas largas\. Ve directo al grano\./);
  assert.match(backendSource, /PASO A PASO: No asumas ritmos de carga\/descarga ni otros datos operativos/);
  assert.match(backendSource, /pregúntalos de uno en uno de forma directa ANTES/);
  assert.match(backendSource, /TU ÚNICA RESPUESTA debe ser una breve confirmación \(máximo 1 línea\) seguida INMEDIATAMENTE del bloque JSON/);
  assert.match(backendSource, /Prohibido volver a analizar o dar explicaciones tras un 'ok'/);
  assert.match(backendSource, /"action": "calculate_route", "pol": "NombrePuerto", "pod": "NombrePuerto", "tonnage": 12000/);
  assert.match(backendSource, /REGLAS FINALES DE MÁXIMA PRIORIDAD/);
  assert.match(backendSource, /partialUpdateRules\}\$\{actionExecutionDirective\}/);
});

test('Core PRO strips and executes hidden update_field JSON before rendering', () => {
  assert.match(frontendSource, /const ACTIONABLE_AI_JSON_BLOCK = \/```json/);
  assert.match(frontendSource, /function extractActionableAiResponse\(responseText\)/);
  assert.match(frontendSource, /originalText\.replace\(jsonBlock\[0\], ""\)\.trim\(\)/);
  assert.match(frontendSource, /function executeActionableAiUpdate\(action\)/);
  assert.match(frontendSource, /field\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(frontendSource, /window\.recalcularDiasPuerto\?\.\(\)/);
  assert.match(frontendSource, /window\.runEngine\?\.\(\)/);
  assert.match(frontendSource, /extractActionableAiResponse\(payload\.respuesta\)[\s\S]*executeActionableAiAction\(actionableResponse\.action\)[\s\S]*replaceWithAssistantMessage\(thinkingMessage, assistantText/);
});

test('Core PRO executes hidden calculate_route actions through the existing map workflow', () => {
  assert.match(frontendSource, /\["update_field", "calculate_route"\]\.includes\(parsed\?\.action\)/);
  assert.match(frontendSource, /function executeActionableAiRoute\(action\)/);
  assert.match(frontendSource, /document\.getElementById\("map-port-pol"\)/);
  assert.match(frontendSource, /document\.getElementById\("map-port-pod"\)/);
  assert.match(frontendSource, /document\.getElementById\("cargo-qty"\)/);
  assert.match(frontendSource, /document\.getElementById\("btn-map-locate-route"\)/);
  assert.match(frontendSource, /setActionableAiInputValue\(cargoInput, tonnage\)/);
  assert.match(frontendSource, /routeButton\.click\(\)/);
});

test('Data Bridge POST context is sanitized without removing its commercial sections', () => {
  assert.match(frontendSource, /CalculationData: collectCalculationData\(\)/);
  assert.match(frontendSource, /MarketData: collectMarketData\(\)/);
  assert.match(frontendSource, /sanitizePayloadForAI\(requestPayload\)/);
  assert.match(frontendSource, /body: JSON\.stringify\(sanitizedPayload\)/);
});
