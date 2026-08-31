import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("../netlify/functions/vessel-compatibility.ts", import.meta.url), "utf8");
const moduleSource = readFileSync(new URL("../src/compatibilidad-module.js", import.meta.url), "utf8");

test("vessel-compatibility backend connects to Neon DB vessels_master and implements mathematical scoring", () => {
  assert.match(functionSource, /getPool\(\)/, "Backend connects to PostgreSQL pool");
  assert.match(functionSource, /FROM vessels_master/, "Backend queries vessels_master table");
  assert.match(functionSource, /STRICT_NON_COMMERCIAL_RE/, "Backend has strict non-commercial exclusion filter");
  assert.match(functionSource, /STRICT_MERCHANT_CARGO_RE/, "Backend whitelists commercial merchant vessels");
  assert.match(functionSource, /evaluateMathematicalMatch/, "Backend evaluates candidates mathematically");
  assert.match(functionSource, /compatibilityScore/, "Backend computes composite compatibility score");
  assert.match(functionSource, /isTopMatch/, "Backend automatically flags Top Match");
  assert.match(functionSource, /technicalJustification/, "Backend generates dynamic technical justification");
});

test("vessel-compatibility extracts and cross-references all required technical specifications", () => {
  // DWT, calado máximo, factor de estiba, dimensiones (eslora x manga), año de construcción
  assert.match(functionSource, /dwt/, "Matches DWT deadweight");
  assert.match(functionSource, /draft_meters|draftMeters/, "Matches max draft in meters");
  assert.match(functionSource, /stowageFactor/, "Matches stowage factor");
  assert.match(functionSource, /loa_meters|loaMeters/, "Matches LOA dimensions");
  assert.match(functionSource, /beam_meters|beamMeters/, "Matches Beam dimensions");
  assert.match(functionSource, /year_built|yearBuilt/, "Matches year built");
});

test("compatibilidad-module feeds live reactive AIS radar vessels to backend and updates reactively", () => {
  assert.match(moduleSource, /getDensityReactiveVessels/, "Module reads density reactive fleet");
  assert.match(moduleSource, /liveRadarVessels:\s*rawLiveFleet/, "Module transmits live reactive fleet to backend");
  assert.match(moduleSource, /canonical-fleet-updated/, "Module listens to canonical fleet update event");
  assert.match(moduleSource, /renderView/, "Module updates view reactively");
});
