import assert from "node:assert/strict";
import test from "node:test";

import {
  mapCargoDescription,
  normalizeNlpVoyagePayload,
} from "../shared/cargo-mapper.mjs";

test("maps cement aliases to exact calculator taxonomy values", () => {
  assert.deepEqual(mapCargoDescription("25.000 TM de cemento"), {
    categoriaCarga: "Minerales y Construcción",
    productoEspecifico: "Cemento a granel",
    especificacionCarga: "10 - Cemento, yeso, cal y clínker (25)",
    especificacionCargaId: "10",
    hasBigBags: false,
    rawCargo: "25.000 TM de cemento",
  });
});

test("maps steel, grain, fertilizer and breakbulk families", () => {
  assert.equal(mapCargoDescription("steel coils").especificacionCargaId, "20");
  assert.equal(mapCargoDescription("trigo wheat").especificacionCargaId, "60");
  assert.equal(mapCargoDescription("urea NPK").especificacionCargaId, "30");
  assert.equal(mapCargoDescription("aerogeneradores").categoriaCarga, "Carga de Proyecto (Breakbulk)");
});

test("forces Big Bags equipment and copies POL method into POD", () => {
  const payload = normalizeNlpVoyagePayload({ cargo_type: "cemento en big bags" });
  assert.equal(payload.cargo_category, "Minerales y Construcción");
  assert.equal(payload.cargo_product, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.cargo_specification, "10");
  assert.equal(payload.methodPOL, "big_bags_barco");
  assert.equal(payload.methodPOD, "big_bags_barco");

  const genericBigBags = normalizeNlpVoyagePayload({ cargo_type: "big bags" });
  assert.equal(genericBigBags.cargo_category, "Carga Unitizada / Envasada");
  assert.equal(genericBigBags.cargo_specification, "10");
});

test("copies an explicit POL method when POD is empty", () => {
  const payload = normalizeNlpVoyagePayload({ methodPOL: "hierro_acero_barco", methodPOD: "" });
  assert.equal(payload.methodPOL, "hierro_acero_barco");
  assert.equal(payload.methodPOD, "hierro_acero_barco");
});

test("injects exact SHEX and FHEX laytime terms", () => {
  const shared = normalizeNlpVoyagePayload({}, "Operaciones SHEX");
  assert.equal(shared.laytimePOL, "SHEX");
  assert.equal(shared.laytimePOD, "SHEX");

  const split = normalizeNlpVoyagePayload({ laytimePOL: "SHEX", laytimePOD: "FHEX" });
  assert.equal(split.loading_terms, "SHEX");
  assert.equal(split.discharge_terms, "FHEX");

  const replacesDefault = normalizeNlpVoyagePayload({ loading_terms: "CQD", discharge_terms: "CQD" }, "SHEX agreed both ends");
  assert.equal(replacesDefault.laytimePOL, "SHEX");
  assert.equal(replacesDefault.laytimePOD, "SHEX");
});

test("semantic families override an incorrect LLM fallback classification", () => {
  const payload = normalizeNlpVoyagePayload({
    cargo_type: "cemento",
    cargo_category: "Carga Unitizada / Envasada",
    cargo_specification: "100",
  });
  assert.equal(payload.cargo_category, "Minerales y Construcción");
  assert.equal(payload.cargo_specification, "10");
});

test("uses the Otros taxonomy fallback for unknown cargo", () => {
  const mapped = mapCargoDescription("producto experimental");
  assert.equal(mapped.especificacionCargaId, "100");
  assert.equal(mapped.especificacionCarga, "100 - Otros (N/A)");
});
