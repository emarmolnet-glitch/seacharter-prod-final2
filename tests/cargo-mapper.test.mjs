import assert from "node:assert/strict";
import test from "node:test";

import {
  getCargoMethodLabel,
  mapCargoDescription,
  normalizeText,
  normalizeNlpVoyagePayload,
  validateCargoHierarchy,
  validateSixStepWizardPayload,
} from "../shared/cargo-mapper.mjs";

test("validates exact cargo category and product hierarchy values", () => {
  assert.deepEqual(validateCargoHierarchy("Minerales y Construcción", "Big Bags (Minerales/Cemento)", "cemento en big bags"), {
    categoriaCarga: "Minerales y Construcción",
    productoEspecifico: "Big Bags (Minerales/Cemento)",
  });
  assert.deepEqual(validateCargoHierarchy("Carga Siderúrgica y Metales", "Big Bags (Minerales/Cemento)", "big bags"), {
    categoriaCarga: "Carga Unitizada / Envasada",
    productoEspecifico: "Big Bags (Minerales/Cemento)",
  });
  assert.deepEqual(validateCargoHierarchy("Carga Unitizada / Envasada", "Cemento a granel", "cemento"), {
    categoriaCarga: "Minerales y Construcción",
    productoEspecifico: "Cemento a granel",
  });
});

test("accepts select-shaped cargo objects and returns literal strings", () => {
  const payload = normalizeNlpVoyagePayload({
    cargo_category: { value: "Carga de Proyecto (Breakbulk)", label: "Proyecto" },
    cargo_product: { value: "Piezas Especiales / Maquinaria", label: "Piezas" },
  });
  assert.equal(payload.cargo_category, "Carga de Proyecto (Breakbulk)");
  assert.equal(payload.cargo_product, "Piezas Especiales / Maquinaria");
});

test("normalizes user machinery text before evaluation", () => {
  assert.equal(normalizeText("  GRÚA BARCO  "), "grua barco");
  assert.equal(normalizeText("Grúa Portuaria"), "grua portuaria");
});

test("maps internal machinery values to the exact select labels", () => {
  assert.equal(getCargoMethodLabel("cuchara_grab"), "Cuchara (Grab) - Grúa Barco");
  assert.equal(getCargoMethodLabel("cinta_transportadora"), "Cinta Transportadora");
  assert.equal(getCargoMethodLabel("big_bags_portuaria"), "Big Bags - Grúa Portuaria");
  assert.equal(getCargoMethodLabel("hierro_acero_barco"), "Hierro/Acero - Grúa Barco");
  assert.equal(getCargoMethodLabel("Big Bags Grúa Barco"), "Big Bags - Grúa Barco");
});

test("converts retained UI literals back to select values during injection normalization", () => {
  const payload = normalizeNlpVoyagePayload({
    methodPOL: "Big Bags - Grúa Barco",
    methodPOD: "Cinta Transportadora",
  });
  assert.equal(payload.methodPOL, "big_bags_barco");
  assert.equal(payload.methodPOD, "cinta_transportadora");
});

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
  assert.equal(mapCargoDescription("tubos de acero").productoEspecifico, "Tubos de Acero (Steel Pipes)");
  assert.equal(mapCargoDescription("pellets de biomasa").categoriaCarga, "Biomasa y Combustibles Sólidos");
  assert.equal(mapCargoDescription("piezas especiales").productoEspecifico, "Piezas Especiales / Maquinaria");
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

test("validates the six-step dependency tree before store injection", () => {
  const payload = validateSixStepWizardPayload({
    cargoDescription: "cemento",
    packaging: "Big Bags",
    craneDetails: "POL puerto, sin detalle adicional para POD",
  }, {
    pol: "Bejaia",
    pod: "Valencia",
    cargo_qty: 25000,
    loading_rate: 1500,
    discharge_rate: 2000,
  });

  assert.equal(payload.cargo_category, "Minerales y Construcción");
  assert.equal(payload.cargo_product, "Big Bags (Minerales/Cemento)");
  assert.equal(payload.methodPOL, "Big Bags - Grúa Portuaria");
  assert.equal(payload.methodPOD, "Big Bags - Grúa Portuaria");
  assert.equal(payload.laytimePOL, "FHEX");
  assert.equal(payload.laytimePOD, "SHEX");
  assert.equal(payload.ritmoMode_pol, "manual");
  assert.equal(payload.ritmoMode_pod, "manual");
});

test("infers operational machinery from cargo dependencies when step five omits it", () => {
  const cases = [
    { cargoDescription: "bobinas de acero", packaging: "por piezas", expectedPOL: "Hierro/Acero - Grúa Barco", expectedPOD: "Hierro/Acero - Grúa Barco" },
    { cargoDescription: "cemento", packaging: "big bags", expectedPOL: "Big Bags - Grúa Barco", expectedPOD: "Big Bags - Grúa Barco" },
    { cargoDescription: "maquinaria", packaging: "paletizada", expectedPOL: "Paletizado - Grúa Barco", expectedPOD: "Paletizado - Grúa Barco" },
    { cargoDescription: "cemento a granel", packaging: "a granel", expectedPOL: "Cuchara (Grab) - Grúa Barco", expectedPOD: "Cinta Transportadora" },
    { cargoDescription: "astillas de biomasa", packaging: "a granel", expectedPOL: "Cuchara (Grab) - Grúa Barco", expectedPOD: "Cinta Transportadora" },
    { cargoDescription: "trigo y cereales", packaging: "a granel", expectedPOL: "Cuchara (Grab) - Grúa Barco", expectedPOD: "Cinta Transportadora" },
    { cargoDescription: "piezas especiales de maquinaria", packaging: "por piezas", expectedPOL: "Hierro/Acero - Grúa Barco", expectedPOD: "Hierro/Acero - Grúa Barco" },
  ];

  cases.forEach(({ cargoDescription, packaging, expectedPOL, expectedPOD }) => {
    const payload = validateSixStepWizardPayload({ cargoDescription, packaging, craneDetails: "no especificada" }, { pol: "Bilbao", pod: "Rotterdam" });
    assert.equal(payload.methodPOL, expectedPOL, cargoDescription);
    assert.equal(payload.methodPOD, expectedPOD, cargoDescription);
  });
});

test("keeps explicit user machinery above the inferred fallback matrix", () => {
  const portCranes = validateSixStepWizardPayload({
    cargoDescription: "cemento",
    packaging: "big bags",
    craneDetails: "grúas del puerto",
  }, { pol: "Bilbao", pod: "Rotterdam" });
  assert.equal(portCranes.methodPOL, "Big Bags - Grúa Portuaria");
  assert.equal(portCranes.methodPOD, "Big Bags - Grúa Portuaria");

  const splitMethods = validateSixStepWizardPayload({
    cargoDescription: "cemento a granel",
    packaging: "a granel",
    craneDetails: "POL grúa del barco, POD camión tolva",
  }, { pol: "Bilbao", pod: "Rotterdam" });
  assert.equal(splitMethods.methodPOL, "Cuchara (Grab) - Grúa Barco");
  assert.equal(splitMethods.methodPOD, "Camión Tolva");

  const conveyor = validateSixStepWizardPayload({
    cargoDescription: "astillas",
    packaging: "a granel",
    craneDetails: "cinta en ambos puertos",
  }, { pol: "Bilbao", pod: "Rotterdam" });
  assert.equal(conveyor.methodPOL, "Cinta Transportadora");
  assert.equal(conveyor.methodPOD, "Cinta Transportadora");
});

test("retains exact UI machinery literals regardless of user casing or accents", () => {
  const cases = [
    { input: "BIG BAGS GRUA BARCO", packaging: "big bags", expected: "Big Bags - Grúa Barco" },
    { input: "big bags grúa portuaria", packaging: "big bags", expected: "Big Bags - Grúa Portuaria" },
    { input: "GRUA DE BUQUE", cargoDescription: "bobinas de acero", expected: "Hierro/Acero - Grúa Barco" },
    { input: "grua portuaria", cargoDescription: "tubos de acero", expected: "Hierro/Acero - Grúa Portuaria" },
    { input: "CUCHARA GRAB", cargoDescription: "cemento", expected: "Cuchara (Grab) - Grúa Barco" },
    { input: "CINTA", cargoDescription: "cemento", expected: "Cinta Transportadora" },
  ];

  cases.forEach(({ input, packaging = "a granel", cargoDescription = "cemento", expected }) => {
    const payload = validateSixStepWizardPayload({ cargoDescription, packaging, craneDetails: input }, { pol: "Bilbao", pod: "Rotterdam" });
    assert.equal(payload.methodPOL, expected, input);
    assert.equal(payload.methodPOD, expected, input);
  });
});
