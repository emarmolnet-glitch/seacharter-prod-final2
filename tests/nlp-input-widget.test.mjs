import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const widgetSource = fs.readFileSync("src/components/NLPInputWidget.jsx", "utf8");
const functionSource = fs.readFileSync("netlify/functions/nlp-voyage-extract.ts", "utf8");

test("NLPInputWidget awaits the real voyage extractor before validation", () => {
  assert.match(widgetSource, /await requestScenarioExtraction\(requestText\)/);
  assert.match(widgetSource, /fetch\("\/api\/nlp-voyage-extract"/);

  const extractionIndex = widgetSource.indexOf("await requestScenarioExtraction(requestText)");
  const validationIndex = widgetSource.indexOf("const missing = CRITICAL_FIELDS.filter");
  assert.ok(extractionIndex >= 0 && validationIndex > extractionIndex);
});

test("voyage extraction normalizes the exact DraftVoyage validation keys", () => {
  for (const field of ["pol", "pod", "laydays", "cancelling", "cargo_qty", "loading_rate", "discharge_rate"]) {
    assert.match(widgetSource, new RegExp(`${field}:`));
    assert.match(functionSource, new RegExp(`required: \\[.*[\"']${field}[\"']`, "s"));
  }
});

test("voyage extractor uses Netlify AI Gateway with strict JSON schema", () => {
  assert.match(functionSource, /new OpenAI\(\)/);
  assert.match(functionSource, /model: "gpt-5\.4-mini"/);
  assert.match(functionSource, /type: "json_schema"/);
  assert.match(functionSource, /path: "\/api\/nlp-voyage-extract"/);
});

test("NLPInputWidget consolidates WPI ports before dispatch and triggers the native route workflow", () => {
  assert.match(widgetSource, /await window\.ensureWpiLoadedOnDemand\?\.\(\)/);
  assert.doesNotMatch(widgetSource, /searchLocalWpiPorts/);
  assert.match(widgetSource, /portRecord\.source !== "WPI"/);
  assert.match(widgetSource, /scenario\.port_validation\?\.valid/);
  assert.match(widgetSource, /window\.selectUniversalPortSuggestion\?\.\(input, selectedPort\)/);
  assert.match(widgetSource, /await window\.runOnDemandMapRouteWorkflow\?\.\(document\.getElementById\("btn-map-locate-route"\)\)/);

  const wpiIndex = widgetSource.indexOf("await resolveAndSelectWpiPort(scenario.pol_port");
  const storeIndex = widgetSource.indexOf("window.SeaCharterStore?.set?.(");
  const routeIndex = widgetSource.indexOf("await window.runOnDemandMapRouteWorkflow");
  assert.ok(wpiIndex >= 0 && storeIndex > wpiIndex && routeIndex > storeIndex);
});

test("NLPInputWidget optimizes POL and POD methods independently before global dispatch", () => {
  assert.match(widgetSource, /function optimizeCargoHandlingMethods\(/);
  assert.match(widgetSource, /pol: selectMethod\(loadingRate\)/);
  assert.match(widgetSource, /pod: selectMethod\(dischargeRate\)/);
  assert.match(widgetSource, /numericRate <= profile\.shipEfficientCapacity/);
  assert.match(widgetSource, /scenario\.loadMethod = optimizedMethods\.pol\.value/);
  assert.match(widgetSource, /scenario\.dischargeMethod = optimizedMethods\.pod\.value/);
  assert.match(widgetSource, /loadMethod: scenario\.loadMethod/);
  assert.match(widgetSource, /dischargeMethod: scenario\.dischargeMethod/);

  const optimizationIndex = widgetSource.indexOf("const optimizedMethods = optimizeCargoHandlingMethods");
  const methodDispatchIndex = widgetSource.indexOf('await typeIntoControl("metodo_carga"');
  const globalDispatchIndex = widgetSource.indexOf("window.SeaCharterStore?.set?.(operationalPayload");
  assert.ok(optimizationIndex >= 0 && methodDispatchIndex > optimizationIndex && globalDispatchIndex > methodDispatchIndex);
});

test("cargo handling profiles prefer ship cranes within efficient capacity and port cranes above it", () => {
  assert.match(widgetSource, /shipMethod: "big_bags_barco"/);
  assert.match(widgetSource, /portMethod: "big_bags_portuaria"/);
  assert.match(widgetSource, /shipMethod: "paletizado_barco"/);
  assert.match(widgetSource, /portMethod: "paletizado_portuaria"/);
  assert.match(widgetSource, /shipMethod: "hierro_acero_barco"/);
  assert.match(widgetSource, /portMethod: "hierro_acero_portuaria"/);
  assert.match(widgetSource, /shipMethod: "cuchara_grab"/);
  assert.match(widgetSource, /portMethod: "cuchara_portuaria"/);
});
