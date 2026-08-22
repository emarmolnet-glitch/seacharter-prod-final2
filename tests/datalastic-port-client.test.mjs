import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPortClientModule() {
  const source = await readFile(
    new URL("../netlify/functions/_shared/datalastic-port-client.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

test("Datalastic port normalization preserves map coordinates and identifiers", async () => {
  const { normalizeDatalasticPort } = await loadPortClientModule();
  const port = normalizeDatalasticPort({
    uuid: "port-uuid",
    port_name: "VALENCIA",
    country_iso: "ES",
    unlocode: "ESVLC",
    lat: 39.44,
    lon: -0.31,
    max_operational_draft: 13.5,
  });

  assert.equal(port.officialLabel, "VALENCIA (ES)");
  assert.equal(port.latitude, 39.44);
  assert.equal(port.longitude, -0.31);
  assert.equal(port.maxOperationalDraftMeters, 13.5);
  assert.equal(port.source, "DATALASTIC");
});

test("zero and null provider drafts remain unknown instead of becoming fatal limits", async () => {
  const { normalizeDatalasticPort } = await loadPortClientModule();
  const port = normalizeDatalasticPort({
    port_name: "PORT WITHOUT DRAFT",
    country_iso: "GB",
    lat: 51.5,
    lon: -0.04,
    max_draft: 0,
    channel_depth: null,
  });

  assert.equal(port.maxOperationalDraftMeters, null);
  assert.equal(port.draftSourceField, null);
});

test("depth values reported in feet are converted to meters", async () => {
  const { extractMaxOperationalDraft } = await loadPortClientModule();
  const draft = extractMaxOperationalDraft({ maximum_draft: { value: 40, unit: "ft" } });
  assert.equal(draft.meters, 12.192);
});
