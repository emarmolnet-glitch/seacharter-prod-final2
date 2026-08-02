import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fieldMappings,
  mappedVesselField,
  normalizeVesselFieldKey,
} from "../netlify/functions/_shared/vessel-field-mappings.mjs";

test("LENGTH variants map to loa_meters after key normalization", () => {
  assert.equal(fieldMappings.length, "loa_meters");
  assert.equal(fieldMappings["length overall"], "loa_meters");
  assert.equal(fieldMappings.loa, "loa_meters");
  assert.equal(normalizeVesselFieldKey("  LENGTH  "), "length");
  assert.equal(mappedVesselField(" LENGTH (METERS): "), "loa_meters");
  assert.equal(mappedVesselField("Length Overall"), "loa_meters");
  assert.equal(mappedVesselField("LOA (m)"), "loa_meters");
});

test("related Marine Man technical labels use the canonical database fields", () => {
  assert.equal(mappedVesselField(" BEAM "), "beam_meters");
  assert.equal(mappedVesselField("Gross Tonnage"), "gross_tonnage");
  assert.equal(mappedVesselField("GT"), "gross_tonnage");
  assert.equal(mappedVesselField("DWT (MT)"), "dwt");
  assert.equal(mappedVesselField("Year of Built"), "year_built");
  assert.equal(mappedVesselField("Built Year"), "year_built");
});

test("Due Diligence persists extracted loa_meters into vessels_master", () => {
  const diligenceSource = readFileSync(new URL("../netlify/functions/vessel-due-diligence.ts", import.meta.url), "utf8");
  const cacheSource = readFileSync(new URL("../db/vessel-technical-cache.ts", import.meta.url), "utf8");

  assert.match(diligenceSource, /loaMeters:\s*data\.loa_meters/);
  assert.match(cacheSource, /loa_meters = COALESCE\(\$12::double precision, vessels_master\.loa_meters\)/);
  assert.match(cacheSource, /\$10::integer, \$11::double precision, \$12::double precision/);
});
