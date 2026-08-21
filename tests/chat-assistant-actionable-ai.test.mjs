import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

function parseActionableResponse(responseText) {
  const parserStart = frontendSource.indexOf('const ACTIONABLE_AI_JSON_BLOCK');
  const parserEnd = frontendSource.indexOf('function findActionableAiField');
  const sandbox = { responseText, result: null };
  vm.runInNewContext(
    `${frontendSource.slice(parserStart, parserEnd)}\nresult = extractActionableAiResponse(responseText);`,
    sandbox,
  );
  return JSON.parse(JSON.stringify(sandbox.result));
}

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
  assert.match(frontendSource, /function findActionableAiJsonObject\(responseText\)/);
  assert.match(frontendSource, /const rawJson = text\.slice\(start, end \+ 1\)/);
  assert.match(frontendSource, /JSON\.parse\(rawJson\)/);
  assert.match(frontendSource, /function extractActionableAiResponse\(responseText\)/);
  assert.match(frontendSource, /originalText\.replace\(jsonBlock\[0\], ""\)\.trim\(\)/);
  assert.match(frontendSource, /originalText\.slice\(0, inlineJson\.start\)/);
  assert.match(frontendSource, /originalText\.slice\(inlineJson\.end\)/);
  assert.match(frontendSource, /function executeActionableAiUpdate\(action\)/);
  assert.match(frontendSource, /field\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(frontendSource, /window\.recalcularDiasPuerto\?\.\(\)/);
  assert.match(frontendSource, /window\.runEngine\?\.\(\)/);
  assert.match(frontendSource, /extractActionableAiResponse\(payload\.respuesta\)[\s\S]*executeActionableAiAction\(actionableResponse\.action\)[\s\S]*replaceWithAssistantMessage\(thinkingMessage, assistantText/);
  assert.match(frontendSource, /actionableResponse\.action \? "¡Hecho!"/);
});

test('Core PRO executes hidden calculate_route actions through the existing map workflow', () => {
  assert.match(frontendSource, /\["update_field", "calculate_route", "fill_complete_form"\]\.includes\(action\?\.action\)/);
  assert.match(frontendSource, /\["update_field", "calculate_route", "fill_complete_form"\]\.includes\(parsed\?\.action\)/);
  assert.match(frontendSource, /function executeActionableAiRoute\(action\)/);
  assert.match(frontendSource, /document\.getElementById\("map-port-pol"\)/);
  assert.match(frontendSource, /document\.getElementById\("map-port-pod"\)/);
  assert.match(frontendSource, /document\.getElementById\("cargo-qty"\)/);
  assert.match(frontendSource, /document\.getElementById\("btn-map-locate-route"\)/);
  assert.match(frontendSource, /async function selectActionableAiWpiRoute\(pol, pod\)/);
  assert.match(frontendSource, /await window\.selectFirstWpiAutocompleteMatch\(inputId, value\)/);
  assert.match(frontendSource, /const selectedPorts = await selectActionableAiWpiRoute\(pol, pod\)/);
  assert.doesNotMatch(frontendSource, /forEach\(\(input\) => setActionableAiInputValue\(input, pol\)\)/);
  assert.doesNotMatch(frontendSource, /forEach\(\(input\) => setActionableAiInputValue\(input, pod\)\)/);
  assert.match(frontendSource, /setActionableAiInputValue\(cargoInput, tonnage\)/);
  assert.match(frontendSource, /routeButton\.click\(\)/);
  assert.match(frontendSource, /await executeActionableAiAction\(actionableResponse\.action\)/);
});

test('complete-form chat actions validate both ports through WPI autocomplete before injection', () => {
  assert.match(frontendSource, /async function executeActionableAiCompleteForm\(action\)/);
  assert.match(frontendSource, /const selectedPorts = await selectActionableAiWpiRoute\(pol, pod\)/);
  assert.match(frontendSource, /pol_port: selectedPorts\.pol/);
  assert.match(frontendSource, /pod_port: selectedPorts\.pod/);
  assert.match(frontendSource, /await window\.applyAssistantCompleteForm\(validatedAction\)/);
});

test('Core PRO extracts a plain calculate_route JSON object without showing it in chat', () => {
  const result = parseActionableResponse('¡Hecho!\n{ "action": "calculate_route", "pol": "Bejaia", "pod": "Aveiro", "tonnage": 12000 }');

  assert.deepEqual(result, {
    visibleText: '¡Hecho!',
    action: {
      action: 'calculate_route',
      pol: 'Bejaia',
      pod: 'Aveiro',
      tonnage: 12000,
    },
  });
});

test('Core PRO hides and forwards the complete-form action from a JSON block', () => {
  const result = parseActionableResponse(`¡Perfecto, actualizando todos los parámetros en pantalla!
\`\`\`json
{
  "action": "fill_complete_form",
  "pol": "Bejaia",
  "pod": "Aveiro",
  "tonnage": 12000,
  "laydayStart": "24/08/2026",
  "cancelling": "28/08/2026",
  "category": "Granel sólido",
  "product": "Cemento",
  "loadingMethod": "Cinta transportadora",
  "loadingRate": 1500,
  "dischargeRate": 2000
}
\`\`\``);

  assert.equal(result.visibleText, '¡Perfecto, actualizando todos los parámetros en pantalla!');
  assert.equal(result.action.action, 'fill_complete_form');
  assert.equal(result.action.laydayStart, '24/08/2026');
  assert.equal(result.action.loadingRate, 1500);
  assert.match(frontendSource, /function executeActionableAiCompleteForm\(action\)/);
  assert.match(frontendSource, /await window\.applyAssistantCompleteForm\(validatedAction\)/);
  assert.match(frontendSource, /action\?\.action === "fill_complete_form"/);
});

test('Data Bridge POST context is sanitized without removing its commercial sections', () => {
  assert.match(frontendSource, /CalculationData: collectCalculationData\(\)/);
  assert.match(frontendSource, /MarketData: collectMarketData\(\)/);
  assert.match(frontendSource, /sanitizePayloadForAI\(requestPayload\)/);
  assert.match(frontendSource, /body: JSON\.stringify\(sanitizedPayload\)/);
});
