import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as cargoTaxonomy from "../cargo-taxonomy.mjs";
import * as taxonomyCompatibility from "../netlify/functions/_shared/taxonomy-compatibility.mjs";

const vesselCompatibilitySource = readFileSync(new URL("../netlify/functions/vessel-compatibility.ts", import.meta.url), "utf8");
const compatibilidadModuleSource = readFileSync(new URL("../src/compatibilidad-module.js", import.meta.url), "utf8");

test("vessel-compatibility.ts defines strict dry bulk taxonomy matching rules and excluded types", () => {
  assert.match(vesselCompatibilitySource, /DRY_BULK_CARGO_RE/, "Backend defines regex for dry bulk cargoes");
  assert.match(vesselCompatibilitySource, /MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE/, "Backend defines regex for mandatory excluded types");
  assert.match(vesselCompatibilitySource, /COMPATIBLE_DRY_BULK_TYPES_RE/, "Backend defines regex for compatible dry bulk types");

  // Verify excluded types include Tanker, Container, Tug, Passenger
  assert.match(vesselCompatibilitySource, /tanker/i, "Excludes tanker types");
  assert.match(vesselCompatibilitySource, /container/i, "Excludes container types");
  assert.match(vesselCompatibilitySource, /tug/i, "Excludes tug types");
  assert.match(vesselCompatibilitySource, /passenger/i, "Excludes passenger types");

  // Verify compatible types include Bulk Carrier, Mini Bulker, General Cargo
  assert.match(vesselCompatibilitySource, /bulk carrier|bulker/i, "Allows bulk carrier");
  assert.match(vesselCompatibilitySource, /mini bulker|minibulker/i, "Allows mini bulker");
  assert.match(vesselCompatibilitySource, /general cargo/i, "Allows general cargo");
});

test("vessel-compatibility.ts strictly restricts Top Match to taxonomy-compatible candidates", () => {
  assert.match(
    vesselCompatibilitySource,
    /eligibleTopCandidates\s*=\s*evaluatedList\.filter\(\s*\(cand\)\s*=>\s*cand\.compatibilityScore\s*>\s*0\s*&&\s*cand\.technicalEvaluation\?\.taxonomyCompatible\s*!==\s*false/,
    "Top Match filter requires score > 0 and taxonomyCompatible !== false",
  );
  assert.match(
    vesselCompatibilitySource,
    /topMatch\s*=\s*eligibleTopCandidates\.length\s*>\s*0\s*\?\s*eligibleTopCandidates\[0\]\s*:\s*null/,
    "Top Match is assigned only from eligible candidates or set to null",
  );
});

test("cargo-taxonomy.mjs strictly excludes Tanker, Container, Tug, Passenger for dry bulk categories", () => {
  // Category 10: Cemento, yeso, cal y clínker
  const cementCargoId = "10";

  // Incompatible types: Tanker, Container, Tug, Passenger
  const tankerEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Chemical Tanker", dwt: 10000 },
    shipType: "Chemical Tanker",
    dwt: 10000,
  });
  assert.equal(tankerEval.eligible, false, "Chemical Tanker must be rejected for cement/clinker/yeso");
  assert.equal(tankerEval.design.tanker, true, "Design flagged as tanker");

  const containerEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Container Ship", dwt: 10000 },
    shipType: "Container Ship",
    dwt: 10000,
  });
  assert.equal(containerEval.eligible, false, "Container Ship must be rejected for cement/clinker/yeso");

  const tugEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Tug", dwt: 2000 },
    shipType: "Tug",
    dwt: 2000,
  });
  assert.equal(tugEval.eligible, false, "Tug must be rejected for cement/clinker/yeso");

  const passengerEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Passenger / Cruise", dwt: 8000 },
    shipType: "Passenger / Cruise",
    dwt: 8000,
  });
  assert.equal(passengerEval.eligible, false, "Passenger vessel must be rejected for cement/clinker/yeso");

  // Compatible types: Bulk Carrier, Mini Bulker, General Cargo, Cement Carrier
  const bulkerEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Bulk Carrier", dwt: 12000 },
    shipType: "Bulk Carrier",
    dwt: 12000,
  });
  assert.equal(bulkerEval.eligible, true, "Bulk Carrier must be accepted for cement/clinker/yeso");

  const miniBulkerEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Mini Bulker", dwt: 11000 },
    shipType: "Mini Bulker",
    dwt: 11000,
  });
  assert.equal(miniBulkerEval.eligible, true, "Mini Bulker must be accepted for cement/clinker/yeso");

  const generalCargoEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "General Cargo", dwt: 9500 },
    shipType: "General Cargo",
    dwt: 9500,
  });
  assert.equal(generalCargoEval.eligible, true, "General Cargo must be accepted for cement/clinker/yeso");

  const cementCarrierEval = cargoTaxonomy.evaluateCargoVesselEligibility({
    cargoTypeId: cementCargoId,
    vessel: { ship_type: "Cement Carrier", dwt: 10500 },
    shipType: "Cement Carrier",
    dwt: 10500,
  });
  assert.equal(cementCarrierEval.eligible, true, "Cement Carrier must be accepted for cement/clinker/yeso");
});

test("taxonomy-compatibility evaluates strict dry bulk cargo vs vessel types", () => {
  // Clinker requires bulk_carrier
  const clinkerBulker = taxonomyCompatibility.evaluateTaxonomyCompatibility("Clínker", { ship_type: "Bulk Carrier" });
  assert.equal(clinkerBulker.compatible, true, "Bulk Carrier is compatible with Clinker");

  const clinkerTanker = taxonomyCompatibility.evaluateTaxonomyCompatibility("Clínker", { ship_type: "Chemical Tanker" });
  assert.equal(clinkerTanker.compatible, false, "Chemical Tanker is incompatible with Clinker");

  const clinkerContainer = taxonomyCompatibility.evaluateTaxonomyCompatibility("Clínker", { ship_type: "Container Ship" });
  assert.equal(clinkerContainer.compatible, false, "Container Ship is incompatible with Clinker");

  // Yeso / Gypsum in bulk
  const yesoBulker = taxonomyCompatibility.evaluateTaxonomyCompatibility("Yeso a granel", { ship_type: "Bulk Carrier" });
  assert.equal(yesoBulker.compatible, true, "Bulk Carrier is compatible with Yeso a granel");

  const yesoTanker = taxonomyCompatibility.evaluateTaxonomyCompatibility("Yeso a granel", { ship_type: "Oil Tanker" });
  assert.equal(yesoTanker.compatible, false, "Oil Tanker is incompatible with Yeso a granel");

  // Cemento en polvo requires cement_carrier or self_discharger
  const cementCarrier = taxonomyCompatibility.evaluateTaxonomyCompatibility("Cemento en polvo", { ship_type: "Cement Carrier" });
  assert.equal(cementCarrier.compatible, true, "Cement Carrier is compatible with Cemento en polvo");

  const cementTanker = taxonomyCompatibility.evaluateTaxonomyCompatibility("Cemento en polvo", { ship_type: "Product Tanker" });
  assert.equal(cementTanker.compatible, false, "Product Tanker is incompatible with Cemento en polvo");
});

test("compatibilidad-module.js enforces strict dry bulk exclusion and compatible candidate matching", () => {
  assert.match(compatibilidadModuleSource, /DRY_BULK_CARGO_RE/, "Frontend defines dry bulk cargo regex");
  assert.match(compatibilidadModuleSource, /MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE/, "Frontend defines mandatory excluded types regex");
  assert.match(compatibilidadModuleSource, /COMPATIBLE_DRY_BULK_TYPES_RE/, "Frontend defines compatible dry bulk types regex");
  assert.match(compatibilidadModuleSource, /isDryBulk\s*&&\s*\(MANDATORY_DRY_BULK_EXCLUDED_TYPES_RE\.test\(vesselType\)\s*\|\|\s*!COMPATIBLE_DRY_BULK_TYPES_RE\.test\(vesselType\)\)/, "Frontend zeroes out score for incompatible vessels");
  assert.match(compatibilidadModuleSource, /validTop\s*=\s*dynamicRadarMatches\.find\(m\s*=>\s*m\.compatibilityScore\s*>\s*0\)/, "Frontend ensures top match has positive score and compatible type");
});
