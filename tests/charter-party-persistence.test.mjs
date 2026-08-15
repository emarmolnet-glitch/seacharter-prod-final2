import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const functionSource = await readFile(
  new URL("../netlify/functions/charter-party.ts", import.meta.url),
  "utf8",
);

test("Charter Party endpoint writes the existing voyages tracking record model", () => {
  assert.match(functionSource, /path: "\/api\/v1\/charter-party"/);
  assert.match(functionSource, /db\.insert\(voyagesTracking\)/);
  assert.match(functionSource, /db\.update\(voyagesTracking\)/);
  assert.match(functionSource, /status: existing\[0\] \? 200 : 201/);
});

test("Charter Party endpoint validates contractual identity, route and laycan", () => {
  assert.match(functionSource, /imoNumber/);
  assert.match(functionSource, /polName/);
  assert.match(functionSource, /podName/);
  assert.match(functionSource, /laydaysStartAt/);
  assert.match(functionSource, /cancellingAt/);
  assert.match(functionSource, /POL y POD deben tener coordenadas válidas antes de guardar/);
});

test("Charter Party endpoint receives a flat technical and ballast payload", () => {
  assert.match(functionSource, /Object\.values\(body\)\.some\(\(value\) => isRecord\(value\) \|\| Array\.isArray\(value\)\)/);
  assert.match(functionSource, /exclusivamente campos planos/);
  assert.match(functionSource, /body\.ballastDistanceNm/);
  assert.match(functionSource, /body\.vesselDwt/);
  assert.match(functionSource, /body\.vesselGt/);
  assert.match(functionSource, /body\.vesselFlag/);
  assert.match(functionSource, /body\.vesselYearBuilt/);
  assert.doesNotMatch(functionSource, /body\.vesselTechnical|body\.draftSnapshot/);
  assert.doesNotMatch(functionSource, /draftValidationJson/);
});
