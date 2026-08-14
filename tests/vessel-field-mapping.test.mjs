import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fieldMappings,
  mappedVesselField,
  normalizeVesselFieldKey,
  parseVesselAttribute,
  vesselFieldDictionary,
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

test("Due Diligence English labels map to vessels_master columns", () => {
  assert.equal(mappedVesselField("Flag"), "flag");
  assert.equal(mappedVesselField("LENGTH"), "loa_meters");
  assert.deepEqual(parseVesselAttribute("Flag", "Panama"), { column: "flag", value: "Panama" });
  assert.deepEqual(parseVesselAttribute("LENGTH", "142.75 m"), { column: "loa_meters", value: 142.75 });
});

test("related Marine Man technical labels use the canonical database fields", () => {
  assert.equal(vesselFieldDictionary.bandera, "flag");
  assert.equal(mappedVesselField("Indicativo"), "call_sign");
  assert.equal(mappedVesselField("Tipo de buque"), "vessel_type");
  assert.equal(mappedVesselField(" BEAM "), "beam_meters");
  assert.equal(mappedVesselField("Manga"), "beam_meters");
  assert.equal(mappedVesselField("Gross Tonnage"), "gross_tonnage");
  assert.equal(mappedVesselField("Net Tonnage"), "net_tonnage");
  assert.equal(mappedVesselField("GT"), "gross_tonnage");
  assert.equal(mappedVesselField("DWT (MT)"), "dwt");
  assert.equal(mappedVesselField("Year of Built"), "year_built");
  assert.equal(mappedVesselField("Año de construcción"), "year_built");
  assert.equal(mappedVesselField("Built Year"), "year_built");
});

test("typed vessel attribute parsing normalizes text, years, and technical numbers", () => {
  assert.deepEqual(parseVesselAttribute("Bandera", "  Panamá  "), { column: "flag", value: "Panamá" });
  assert.deepEqual(parseVesselAttribute("Call Sign", " 3FZZ9 "), { column: "call_sign", value: "3FZZ9" });
  assert.deepEqual(parseVesselAttribute("Year of Built", "Built in 2014"), { column: "year_built", value: 2014 });
  assert.deepEqual(parseVesselAttribute("DWT", "12,345 MT"), { column: "dwt", value: 12345 });
  assert.deepEqual(parseVesselAttribute("Manga", "18,6 m"), { column: "beam_meters", value: 18.6 });
  assert.deepEqual(parseVesselAttribute("LOA", "142.75 metres"), { column: "loa_meters", value: 142.75 });
  assert.deepEqual(parseVesselAttribute("Unknown", "value"), null);
  assert.deepEqual(parseVesselAttribute("GT", "N/A"), { column: "gross_tonnage", value: null });
});

test("Due Diligence persists extracted loa_meters into vessels_master", () => {
  const diligenceSource = readFileSync(new URL("../netlify/functions/vessel-due-diligence.ts", import.meta.url), "utf8");
  const coordinatorSource = readFileSync(new URL("../netlify/functions/_shared/aisCoordinator.js", import.meta.url), "utf8");
  const cacheSource = readFileSync(new URL("../db/vessel-technical-cache.ts", import.meta.url), "utf8");

  assert.match(coordinatorSource, /loaMeters:\s*finiteNumber\(vessel\.length, vessel\.length_overall, vessel\.loa\)/);
  assert.match(diligenceSource, /loaMeters:\s*Number\(particulars\.loaMeters\) \|\| null/);
  assert.match(cacheSource, /loa_meters = COALESCE\(\$14::double precision, vessels_master\.loa_meters\)/);
  assert.match(cacheSource, /beam_meters = COALESCE\(\$15::double precision, vessels_master\.beam_meters\)/);
});
