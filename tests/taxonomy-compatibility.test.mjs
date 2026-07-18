import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as taxonomy from "../netlify/functions/_shared/taxonomy-compatibility.mjs";

const [utilitySource, engineSource] = await Promise.all([
  readFile(new URL("../netlify/functions/_shared/taxonomy-compatibility.mjs", import.meta.url), "utf8"),
  readFile(new URL("../netlify/functions/ai-ais-filter.ts", import.meta.url), "utf8"),
]);

test("strict cargo taxonomy matrix contains the required maritime rules", () => {
  assert.deepEqual(taxonomy.TaxonomyCompatibilityMatrix, {
    cement_powder: ["cement_carrier"],
    clinker: ["bulk_carrier"],
    fertilizers: ["bulk_carrier", "general_cargo"],
    steel_bars_beams: ["general_cargo", "multipurpose_mpp", "bulk_carrier"],
  });
});

test("strict compatibility accepts only vessel taxonomies allowed for each governed cargo", () => {
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Cemento en polvo", { vessel_type: "Cement Carrier" }).compatible, true);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Cemento en polvo", { vessel_type: "Bulk Carrier" }).compatible, false);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Clínker", { ship_type: "Bulk Carrier" }).compatible, true);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Clínker", { ship_type: "Cement Carrier" }).compatible, false);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Fertilizantes", { shipType: "General Cargo" }).compatible, true);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Fertilizantes", { shipType: "Multi-Purpose / MPP" }).compatible, false);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Acero / Barras / Vigas", { ShipType: "Multi-Purpose / MPP" }).compatible, true);
  assert.equal(taxonomy.evaluateTaxonomyCompatibility("Acero / Barras / Vigas", { ShipType: "Chemical Tanker" }).compatible, false);
});

test("declared AIS taxonomy takes precedence over display and radar categories", () => {
  const result = taxonomy.evaluateTaxonomyCompatibility("Cement in bulk", {
    ship_type: "Bulk Carrier",
    radarCategory: "Cement Carrier",
    cargoClass: "Cement Carrier",
  });

  assert.equal(result.declaredVesselType, "Bulk Carrier");
  assert.equal(result.compatible, false);
});

test("ungoverned cargoes retain the existing matching behavior", () => {
  const result = taxonomy.evaluateTaxonomyCompatibility("Grain", { ship_type: "Bulk Carrier" });
  assert.equal(result.governed, false);
  assert.equal(result.compatible, true);
});

test("taxonomy scoring forces incompatible technical scores to zero", () => {
  const compatible = taxonomy.calculateTaxonomyTechnicalScore("Cemento en polvo", { vessel_type: "Cement Carrier" }, 88);
  const incompatible = taxonomy.calculateTaxonomyTechnicalScore("Cemento en polvo", { vessel_type: "Bulk Carrier" }, 88);

  assert.equal(compatible.technicalScore, 88);
  assert.equal(compatible.compatibility.compatible, true);
  assert.equal(incompatible.technicalScore, 0);
  assert.equal(incompatible.compatibility.compatible, false);
});

test("matching integration remains isolated from map, calculator, filters, and export modules", () => {
  assert.match(engineSource, /calculateTaxonomyTechnicalScore\(cargoSpecification, vessel\.source, calculatedTechnical\)/);
  assert.match(engineSource, /const technical = taxonomyScoring\.technicalScore/);
  assert.doesNotMatch(utilitySource, /mapbox|freight|Data Bridge|filteredVessels|GlobalStore/);
});
