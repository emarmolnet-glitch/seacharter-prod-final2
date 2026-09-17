import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mapCargoDescription,
  normalizeNlpVoyagePayload,
  inferCargoMethod,
  PACKAGING_REGEX,
} from "../shared/cargo-mapper.mjs";

const cerebroSource = await readFile(
  new URL("../netlify/functions/cerebro-ia.js", import.meta.url),
  "utf8"
);

const strippedCerebroSource = cerebroSource
  .split("\n")
  .filter((line) => !line.startsWith("import "))
  .join("\n");

const {
  applyPackagingOverride,
  detectPackaging,
  PACKAGING_REGEX: CEREBRO_PACKAGING_REGEX,
} = await import(
  `data:text/javascript;base64,${Buffer.from(strippedCerebroSource, "utf8").toString("base64")}`
);

const assistantSource = await readFile(
  new URL("../src/sea-assistant-entry.js", import.meta.url),
  "utf8"
);

test("PACKAGING_REGEX correctly identifies packaging variants immediately", () => {
  const regex = /(big\s*bag|saco|sling|palet|envasad)/i;
  assert.equal(regex.source, PACKAGING_REGEX.source);
  assert.equal(regex.source, CEREBRO_PACKAGING_REGEX.source);

  assert.ok(regex.test("10000 toneladas de cemento en big bags"));
  assert.ok(regex.test("cemento en big bag"));
  assert.ok(regex.test("cemento en bigbag"));
  assert.ok(regex.test("5000 mt cemento en sacos"));
  assert.ok(regex.test("cemento en sacos de 50kg"));
  assert.ok(regex.test("cemento en palets"));
  assert.ok(regex.test("cemento paletizado"));
  assert.ok(regex.test("carga envasada"));
  assert.ok(regex.test("cemento en slings"));

  // Pure bulk should not match packaging
  assert.ok(!regex.test("cemento a granel"));
  assert.ok(!regex.test("clinker a granel"));
  assert.ok(!regex.test("trigo a granel"));
});

test("mapCargoDescription overrides bulk assignment when packaging regex matches", () => {
  // Pure cement defaults to bulk
  const bulkCement = mapCargoDescription("25000 tm de cemento");
  assert.equal(bulkCement.categoriaCarga, "Minerales y Construcción");
  assert.equal(bulkCement.productoEspecifico, "Cemento a granel");
  assert.equal(bulkCement.hasBigBags, false);

  // Big bags
  const bigBags = mapCargoDescription("10000 toneladas de cemento en big bags");
  assert.equal(bigBags.categoriaCarga, "Minerales y Construcción");
  assert.equal(bigBags.productoEspecifico, "Big Bags (Minerales/Cemento)");
  assert.equal(bigBags.especificacionCargaId, "10");
  assert.equal(bigBags.hasBigBags, true);

  // Sacos
  const sacos = mapCargoDescription("10000 toneladas de cemento en sacos");
  assert.equal(sacos.categoriaCarga, "Minerales y Construcción");
  assert.equal(sacos.productoEspecifico, "Big Bags (Minerales/Cemento)");
  assert.equal(sacos.especificacionCargaId, "10");

  // Palets
  const palets = mapCargoDescription("cemento en palets");
  assert.equal(palets.categoriaCarga, "Minerales y Construcción");
  assert.equal(palets.productoEspecifico, "Big Bags (Minerales/Cemento)");

  // Slings
  const slings = mapCargoDescription("cemento en slings");
  assert.equal(slings.categoriaCarga, "Minerales y Construcción");
  assert.equal(slings.productoEspecifico, "Big Bags (Minerales/Cemento)");

  // Envasado
  const envasado = mapCargoDescription("cemento envasado");
  assert.equal(envasado.categoriaCarga, "Minerales y Construcción");
  assert.equal(envasado.productoEspecifico, "Big Bags (Minerales/Cemento)");
});

test("normalizeNlpVoyagePayload forces Minerales y Construcción and Big Bags (Minerales/Cemento)", () => {
  const payload = normalizeNlpVoyagePayload({
    cargo_type: "10000 toneladas de cemento en big bags",
  });

  assert.equal(payload.cargo_category, "Minerales y Construcción");
  assert.equal(payload.cargo_product, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.cargoCategory, "Minerales y Construcción");
  assert.equal(payload.cargoProduct, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.productoEspecifico, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.productSpecific, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.cargo_specification, "10");
  assert.equal(payload.packaging, "Big Bags");
  assert.equal(payload.packingType, "Big Bags");
  assert.equal(payload.methodPOL, "big_bags_barco");
  assert.equal(payload.methodPOD, "big_bags_barco");
});

test("inferCargoMethod derives big_bags_barco instead of grab for packaged goods", () => {
  assert.equal(inferCargoMethod("cemento en big bags", "Minerales y Construcción", "Big Bags (Minerales/Cemento)", "10"), "big_bags_barco");
  assert.equal(inferCargoMethod("cemento en sacos", "Minerales y Construcción", "Big Bags (Minerales/Cemento)", "10"), "big_bags_barco");
  assert.equal(inferCargoMethod("cemento a granel", "Minerales y Construcción", "Cemento a granel", "10"), "bombas_neumaticas");
  assert.equal(inferCargoMethod("clinker", "Minerales y Construcción", "Clínker", "10"), "cuchara_grab");
});

test("applyPackagingOverride in cerebro-ia interceptor intercepts and overwrites bulk state", () => {
  // Simulating an incoming response from Data Bridge where it classified as Bulk Carrier and generic Cemento
  const incomingDataBridgeResponse = {
    success: true,
    intent: "SIMULACION",
    action: "update_fields",
    payload: {
      category: "Carga General (Big Bags)",
      product: "Cemento",
      cargoSpecification: "N/A",
      vesselType: "Bulk Carrier",
      loadingMethod: "Cuchara (Grab) - Grúa Barco",
      dischargeMethod: "Cuchara (Grab) - Grúa Barco",
      tonnage: 10000,
      pol: "Sagunto",
      pod: "Casablanca",
      selectedVessel: {
        dwt: 12000,
        vesselType: "Bulk Carrier",
      },
    },
    reply: "✅ Mercancía OK: Cemento en big bags y 10000 MT",
  };

  const intercepted = applyPackagingOverride(
    incomingDataBridgeResponse,
    "10000 toneladas de cemento en big bags de Sagunto a Casablanca"
  );

  // Must overwrite category to Minerales y Construcción
  assert.equal(intercepted.payload.category, "Minerales y Construcción");
  assert.equal(intercepted.payload.cargoCategory, "Minerales y Construcción");
  assert.equal(intercepted.payload.cargo_category, "Minerales y Construcción");

  // Must overwrite product to Big Bags (Minerales/Cemento)
  assert.equal(intercepted.payload.product, "Big Bags (Minerales/Cemento)");
  assert.equal(intercepted.payload.cargoProduct, "Big Bags (Minerales/Cemento)");
  assert.equal(intercepted.payload.cargo_product, "Big Bags (Minerales/Cemento)");
  assert.equal(intercepted.payload.productoEspecifico, "Big Bags (Minerales/Cemento)");
  assert.equal(intercepted.payload.productSpecific, "Big Bags (Minerales/Cemento)");

  // Contractual specification
  assert.equal(intercepted.payload.cargoSpecification, "10");
  assert.equal(intercepted.payload.especificacionCargaId, "10");

  // Packaging and methods
  assert.equal(intercepted.payload.packingType, "Big Bags");
  assert.equal(intercepted.payload.packaging, "Big Bags");
  assert.equal(intercepted.payload.loadingMethod, "Big Bags - Grúa Barco");
  assert.equal(intercepted.payload.dischargeMethod, "Big Bags - Grúa Barco");
  assert.equal(intercepted.payload.methodPOL, "big_bags_barco");
  assert.equal(intercepted.payload.methodPOD, "big_bags_barco");

  // Blocks Bulk Carrier assignment
  assert.notEqual(intercepted.payload.vesselType, "Bulk Carrier");
  assert.notEqual(intercepted.payload.selectedVessel.vesselType, "Bulk Carrier");
  assert.equal(intercepted.payload.isBulk, false);
  assert.equal(intercepted.payload.isBigBags, true);
});

test("detectPackaging helper correctly flags user prompts", () => {
  assert.ok(detectPackaging("10000 toneladas de cemento en big bags"));
  assert.ok(detectPackaging("cemento en sacos"));
  assert.ok(detectPackaging("cemento paletizado"));
  assert.ok(!detectPackaging("cemento a granel"));
});

test("sea-assistant-entry.js intercepts packaging and forces Minerales y Construcción / Big Bags", () => {
  assert.match(assistantSource, /const\s+packagingRegex\s*=\s*\/\(big\\s\*bag\|saco\|sling\|palet\|envasad\)\/i/);
  assert.match(assistantSource, /p\.category\s*=\s*"Minerales y Construcción"/);
  assert.match(assistantSource, /p\.product\s*=\s*"Big Bags \(Minerales\/Cemento\)"/);
  assert.match(assistantSource, /p\.cargoSpecification\s*=\s*"10"/);
  assert.match(assistantSource, /const\s+isGranel\s*=\s*!hasEnvase/);
});
