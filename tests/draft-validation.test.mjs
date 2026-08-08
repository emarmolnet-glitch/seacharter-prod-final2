import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadDraftValidationModule() {
  const source = await readFile(
    new URL("../netlify/functions/_shared/draft-validation.ts", import.meta.url),
    "utf8",
  );
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

test("draft validation clears drafts equal to the NGA safe depth", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Test Port",
    portDepthCode: "K",
    vesselDraft: 7.9,
  });

  assert.equal(result.safeDepthMeters, 7.9);
  assert.equal(result.status, "CLEARED");
});

test("draft validation flags drafts above the NGA safe depth", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Test Port",
    portDepthCode: " K ",
    vesselDraft: 8.2,
  });

  assert.equal(result.portDepthCode, "K");
  assert.equal(result.safeDepthMeters, 7.9);
  assert.equal(result.status, "OVERSIZED");
});

test("draft validation prioritizes the calculated operational draft over maximum design draft", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Valencia",
    portDepthCode: "K",
    actualDraft: 6.39,
    maxDraft: 9.4,
  });

  assert.equal(result.vesselDraft, 6.39);
  assert.equal(result.actualDraft, 6.39);
  assert.equal(result.maxDraft, 9.4);
  assert.equal(result.draftBasis, "ACTUAL");
  assert.equal(result.status, "CLEARED");
  assert.match(result.message, /calado operativo calculado \(6\.39 m\)/i);
  assert.match(result.message, /límite seguro NGA de Valencia \(7\.9 m\)/i);
});

test("draft validation falls back to maximum draft only when operational draft is zero", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Valencia",
    portDepthCode: "K",
    actualDraft: 0,
    maxDraft: 9.4,
  });

  assert.equal(result.vesselDraft, 9.4);
  assert.equal(result.actualDraft, null);
  assert.equal(result.draftBasis, "MAXIMUM");
  assert.equal(result.status, "OVERSIZED");
});

test("draft validation accepts calculated draft when an empty actual draft is represented as zero", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Valencia",
    portDepthCode: "K",
    actualDraft: 0,
    calculatedDraft: 6.39,
    maxDraft: 9.4,
  });

  assert.equal(result.vesselDraft, 6.39);
  assert.equal(result.draftBasis, "ACTUAL");
  assert.equal(result.status, "CLEARED");
});

test("unknown depth codes use the conservative zero-meter limit", async () => {
  const { validatePortDraft } = await loadDraftValidationModule();
  const result = validatePortDraft({
    portName: "Unclassified Port",
    portDepthCode: null,
    vesselDraft: 1,
  });

  assert.equal(result.portDepthCode, "UNKNOWN");
  assert.equal(result.safeDepthMeters, 0);
  assert.equal(result.status, "OVERSIZED");
});
