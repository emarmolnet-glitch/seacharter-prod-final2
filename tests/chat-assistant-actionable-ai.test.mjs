import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const backendSource = await readFile(new URL('../netlify/functions/chat-assistant.js', import.meta.url), 'utf8');
const frontendSource = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');
const vesselNameResolutionSource = await readFile(new URL('../netlify/functions/vessel-name-resolution.mts', import.meta.url), 'utf8');

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
  assert.match(frontendSource, /extractActionableAiResponse\(response\.respuesta\)[\s\S]*executeActionableAiAction\(action\)[\s\S]*replaceWithAssistantMessage\(/);
  assert.match(frontendSource, /actionResult\?\.message \|\| actionableResponse\.visibleText \|\| "Acción completada\."/);
});

test('update_fields preserves the server payload and awaits the map workflow', () => {
  assert.match(frontendSource, /const rawAction = payload\?\.action \?\? payload\?\.data\?\.action \?\? null/);
  assert.match(frontendSource, /typeof rawAction === "string"[\s\S]*\{ action: rawAction, payload: actionPayload \|\| \{\} \}/);
  assert.match(frontendSource, /async function executeActionableAiUpdateFields\(actionObj\)/);
  assert.match(frontendSource, /let p = actionObj\.payload \|\| actionObj/);
  assert.match(frontendSource, /window\.injectVoyageScenario\(validatedScenario, \{ deferFinalActions: true \}\)/);
  assert.match(frontendSource, /await window\.finalizeAssistantVoyageInjection\(injectionResult, \{ forceRouteCalculation: true \}\)/);
  assert.match(frontendSource, /window\.runEngine\?\.\(\)/);
});

test('update_fields finalizes validated Datalastic ports without delayed DOM clicks', () => {
  assert.match(frontendSource, /selectedRoutePorts = await selectActionableAiWpiRoute\(polQuery, podQuery\)/);
  assert.match(frontendSource, /await window\.finalizeAssistantVoyageInjection\(injectionResult, \{ forceRouteCalculation: true \}\)/);
  assert.doesNotMatch(frontendSource, /const datalasticOptions =/);
  assert.doesNotMatch(frontendSource, /datalasticOptions\[[01]\]\.click\(\)/);
});

test('update_fields is processed once per completed assistant response', () => {
  assert.match(frontendSource, /const processedUpdateFieldsActions = new WeakSet\(\)/);
  assert.match(frontendSource, /let updateFieldsActionInProgress = false/);
  assert.match(frontendSource, /updateFieldsActionInProgress \|\| processedUpdateFieldsActions\.has\(actionObj\)/);
  assert.match(frontendSource, /processedUpdateFieldsActions\.add\(actionObj\)/);
  assert.match(frontendSource, /if \(actionName === "update_fields"\)/);
  assert.doesNotMatch(frontendSource, /actionName === "update_fields" \|\| actionObj\.pol/);
  assert.match(frontendSource, /try \{[\s\S]*await executeActionableAiUpdateFields\(actionObj\)[\s\S]*finally \{[\s\S]*updateFieldsActionInProgress = false/);
});

test('update_fields selects POL and POD through Datalastic before calculating the route', () => {
  assert.match(frontendSource, /const updateInputs = \(ids, value, dispatchEvents = true\) =>/);
  assert.match(frontendSource, /if \(!dispatchEvents\) return/);
  assert.match(frontendSource, /selectedRoutePorts = await selectActionableAiWpiRoute\(polQuery, podQuery\)/);
  assert.match(frontendSource, /pol: selectedRoutePorts\.pol\.officialLabel/);
  assert.match(frontendSource, /pod: selectedRoutePorts\.pod\.officialLabel/);
  assert.match(frontendSource, /source: "assistant-update-fields"/);
  assert.match(frontendSource, /if \(selectedRoutePorts\) \{[\s\S]*window\.injectVoyageScenario\(validatedScenario, \{ deferFinalActions: true \}\)[\s\S]*await window\.finalizeAssistantVoyageInjection/);
});

test('Core PRO executes hidden calculate_route actions through the existing map workflow', () => {
  assert.match(frontendSource, /\["update_field", "calculate_route", "fill_complete_form", "update_fields", "search_vessel", "LOCATE_VESSEL"\]\.includes\(action\?\.action\)/);
  assert.match(frontendSource, /\["update_field", "calculate_route", "fill_complete_form", "update_fields", "search_vessel", "LOCATE_VESSEL"\]\.includes\(parsed\?\.action\)/);
  assert.match(frontendSource, /function executeActionableAiRoute\(action\)/);
  assert.match(frontendSource, /async function selectActionableAiWpiRoute\(pol, pod\)/);
  assert.match(frontendSource, /await window\.selectFirstWpiAutocompleteMatch\(inputId, query\)/);
  assert.match(frontendSource, /const selectedPorts = await selectActionableAiWpiRoute\(pol, pod\)/);
  assert.match(frontendSource, /window\.injectVoyageScenario\(validatedScenario, \{ deferFinalActions: true \}\)/);
  assert.match(frontendSource, /await window\.finalizeAssistantVoyageInjection\(injectionResult, \{ forceRouteCalculation: true \}\)/);
  assert.match(frontendSource, /const actionResult = action \? await executeActionableAiAction\(action\) : null/);
});

test('chat vessel requests resolve a unique IMO and hand it to tracking', () => {
  assert.match(backendSource, /Cuando el usuario pida localizar, rastrear o buscar un barco en el mapa por su nombre/);
  assert.match(backendSource, /"action": "LOCATE_VESSEL"/);
  assert.match(backendSource, /"vessel_name": "\[Nombre exacto del buque extraído del mensaje, sin MV\]"/);
  assert.match(frontendSource, /async function executeActionableAiLocateVessel\(actionObj\)/);
  assert.match(frontendSource, /fetch\(VESSEL_NAME_RESOLUTION_ENDPOINT/);
  assert.match(frontendSource, /payload\?\.status !== "resolved"/);
  assert.match(frontendSource, /window\.locateTrackingVesselByImo/);
  assert.match(frontendSource, /Introduce el número IMO manualmente para localizarlo/);
  assert.match(vesselNameResolutionSource, /status: matches\.length > 1 \? "ambiguous" : "not_found"/);
  assert.match(vesselNameResolutionSource, /uniqueMatches\.set\(imo/);
  assert.match(vesselNameResolutionSource, /path: "\/api\/vessel-name-resolution"/);
});

test('Core PRO hides a plain LOCATE_VESSEL JSON object from the chat', () => {
  const result = parseActionableResponse('{ "action": "LOCATE_VESSEL", "vessel_name": "Ever Given" }');

  assert.deepEqual(result, {
    visibleText: '',
    action: {
      action: 'LOCATE_VESSEL',
      vessel_name: 'Ever Given',
    },
  });
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
