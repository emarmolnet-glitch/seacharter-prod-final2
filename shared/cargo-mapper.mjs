export const CARGO_CATEGORIES = Object.freeze([
  "Minerales y Construcción",
  "Biomasa y Combustibles Sólidos",
  "Carga Siderúrgica y Metales",
  "Carga Unitizada / Envasada",
  "Carga de Proyecto (Breakbulk)",
]);

export const CARGO_PRODUCT_TREE = Object.freeze({
  "Minerales y Construcción": Object.freeze(["Cemento a granel", "Clínker", "Yeso", "Big Bags (Minerales/Cemento)"]),
  "Biomasa y Combustibles Sólidos": Object.freeze(["Biomasa (Grignon, Astillas, Pellets)", "Carbón mineral"]),
  "Carga Siderúrgica y Metales": Object.freeze(["Bobinas de Acero (Steel Coils)", "Tubos de Acero (Steel Pipes)", "Hierro / Chatarra"]),
  "Carga Unitizada / Envasada": Object.freeze(["Big Bags (Minerales/Cemento)", "Carga Paletizada"]),
  "Carga de Proyecto (Breakbulk)": Object.freeze(["Piezas Especiales / Maquinaria"]),
});

export const CARGO_PRODUCTS = Object.freeze([...new Set(Object.values(CARGO_PRODUCT_TREE).flat())]);

export const CARGO_SPECIFICATION_IDS = Object.freeze(["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"]);

export const CARGO_SPECIFICATIONS = Object.freeze({
  "10": "10 - Cemento, yeso, cal y clínker (25) (Envasado / Granel)",
  "20": "20 - Hierro, acero y sus manufacturas (72/73)",
  "30": "30 - Fertilizantes y abonos (31)",
  "40": "40 - Aluminio y sus manufacturas (76)",
  "50": "50 - Madera, carbón vegetal y pasta de madera (44/47)",
  "60": "60 - Cereales, granos y soja (10/12)",
  "70": "70 - Combustibles, carbón mineral y aceites (27)",
  "80": "80 - Productos químicos y plásticos (28/29/39)",
  "90": "90 - Maquinaria, vehículos y equipos pesados (84/85/87)",
  "100": "100 - Otros (N/A)",
});

export const CARGO_METHODS = Object.freeze([
  "",
  "cinta_transportadora",
  "bombas_neumaticas",
  "camion_tolva",
  "cuchara_grab",
  "cuchara_portuaria",
  "grua_portuaria_30mt",
  "big_bags_barco",
  "big_bags_portuaria",
  "paletizado_barco",
  "paletizado_portuaria",
  "hierro_acero_barco",
  "hierro_acero_portuaria",
]);

export const CARGO_METHOD_LABELS = Object.freeze({
  cinta_transportadora: "Cinta Transportadora",
  bombas_neumaticas: "Bombas Neumáticas",
  camion_tolva: "Camión Tolva",
  cuchara_grab: "Cuchara (Grab) - Grúa Barco",
  cuchara_portuaria: "Cuchara (Grab) - Grúa Portuaria",
  grua_portuaria_30mt: "Grúa Portuaria 30MT",
  big_bags_barco: "Big Bags - Grúa Barco",
  big_bags_portuaria: "Big Bags - Grúa Portuaria",
  paletizado_barco: "Paletizado - Grúa Barco",
  paletizado_portuaria: "Paletizado - Grúa Portuaria",
  hierro_acero_barco: "Hierro/Acero - Grúa Barco",
  hierro_acero_portuaria: "Hierro/Acero - Grúa Portuaria",
});

export const LAYTIME_TERMS = Object.freeze(["", "SHINC", "SHEX", "SHEX UU", "SHEX EIU", "FHINC", "FHEX", "SSHEX", "SSHINC", "CQD"]);

export const ISLAMIC_LOCATION_KEYWORDS = Object.freeze([
  "argelia",
  "bejaia",
  "marruecos",
  "egipto",
  "turquia",
  "tunez",
  "arabia",
  "emiratos",
]);

const CARGO_FAMILIES = Object.freeze([
  Object.freeze({
    aliases: ["cemento", "cement", "clinker", "clinquer", "yeso", "gypsum", "cal", "lime", "cenizas", "slag"],
    categoriaCarga: "Minerales y Construcción",
    especificacionCargaId: "10",
  }),
  Object.freeze({
    aliases: ["acero", "steel", "hierro", "bobinas", "coils", "chatarra", "scrap", "varilla", "billets", "tubos", "pipes", "perfiles", "alambron", "palanquilla"],
    categoriaCarga: "Carga Siderúrgica y Metales",
    especificacionCargaId: "20",
  }),
  Object.freeze({
    aliases: ["biomasa", "biomass", "pellet", "pellets", "astilla", "astillas", "wood chips", "grignon", "orujo"],
    categoriaCarga: "Biomasa y Combustibles Sólidos",
    especificacionCargaId: "50",
  }),
  Object.freeze({
    aliases: ["madera", "maderas", "wood", "timber", "lumber", "tableros", "pasta de madera", "forestal", "forestales"],
    categoriaCarga: "Carga Unitizada / Envasada",
    especificacionCargaId: "50",
  }),
  Object.freeze({
    aliases: ["trigo", "wheat", "maiz", "corn", "cebada", "soja", "soybeans", "grano", "granos", "grain", "cereal", "cereales", "agricola"],
    categoriaCarga: "",
    especificacionCargaId: "60",
  }),
  Object.freeze({
    aliases: ["fertilizante", "fertilizantes", "fertilizer", "fertilizers", "urea", "npk", "fosfato", "nitrato", "potasa", "abono", "abonos"],
    categoriaCarga: "",
    especificacionCargaId: "30",
  }),
  Object.freeze({
    aliases: ["aluminio", "aluminum", "aluminium", "bauxita"],
    categoriaCarga: "Carga Siderúrgica y Metales",
    especificacionCargaId: "40",
  }),
  Object.freeze({
    aliases: ["carbon mineral", "coal", "carbon", "carbon bituminoso", "antracita", "coque", "combustible", "fuel", "petroleo", "oil", "diesel", "gasoleo"],
    categoriaCarga: "Biomasa y Combustibles Sólidos",
    especificacionCargaId: "70",
  }),
  Object.freeze({
    aliases: ["producto quimico", "productos quimicos", "chemical", "chemicals", "plastico", "plastic", "polimero", "polymer"],
    categoriaCarga: "",
    especificacionCargaId: "80",
  }),
  Object.freeze({
    aliases: ["coche", "coches", "auto", "autos", "automovil", "automoviles", "vehiculo", "vehiculos", "cars", "vehicles", "camion", "camiones", "maquinaria", "machinery", "piezas", "piezas sueltas", "piezas de proyecto", "piezas especiales", "aerogeneradores", "eolicos", "transformador", "transformadores", "yate", "yates", "project cargo", "breakbulk"],
    categoriaCarga: "Carga de Proyecto (Breakbulk)",
    especificacionCargaId: "90",
  }),
]);

export const normalizeText = (str) => String(str ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim();

const normalizeLookupText = (str) => normalizeText(str)
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function readCargoSelectionValue(value) {
  if (value && typeof value === "object") return String(value.value ?? value.label ?? value.name ?? "").trim();
  return String(value ?? "").trim();
}

function findExactCargoValue(values, value) {
  const normalizedValue = normalizeLookupText(readCargoSelectionValue(value));
  return values.find((candidate) => normalizeLookupText(candidate) === normalizedValue) || "";
}

export function validateCargoHierarchy(category, product, cargoContext = "") {
  const exactCategory = findExactCargoValue(CARGO_CATEGORIES, category);
  const exactProduct = findExactCargoValue(CARGO_PRODUCTS, product);
  if (!exactProduct) return { categoriaCarga: exactCategory, productoEspecifico: "" };

  const validParents = CARGO_CATEGORIES.filter((candidate) => CARGO_PRODUCT_TREE[candidate]?.includes(exactProduct));
  if (validParents.includes(exactCategory)) return { categoriaCarga: exactCategory, productoEspecifico: exactProduct };

  if (exactProduct === "Big Bags (Minerales/Cemento)") {
    const normalizedContext = normalizeLookupText(cargoContext);
    const mineralContext = ["cemento", "clinker", "clinquer", "yeso", "mineral"].some((keyword) => normalizedContext.includes(keyword));
    return {
      categoriaCarga: mineralContext ? "Minerales y Construcción" : "Carga Unitizada / Envasada",
      productoEspecifico: exactProduct,
    };
  }

  return { categoriaCarga: validParents[0] || exactCategory, productoEspecifico: exactProduct };
}

function includesAlias(normalizedText, alias) {
  const normalizedAlias = normalizeLookupText(alias);
  return normalizedAlias && ` ${normalizedText} `.includes(` ${normalizedAlias} `);
}

function selectCargoProduct(normalizedCargo, specificationId, hasBigBags) {
  if (specificationId === "10") {
    if (hasBigBags) return "Big Bags (Minerales/Cemento)";
    if (includesAlias(normalizedCargo, "clinker")) return "Clínker";
    if (includesAlias(normalizedCargo, "yeso") || includesAlias(normalizedCargo, "gypsum")) return "Yeso";
    return "Cemento a granel";
  }
  if (specificationId === "20") {
    if (["tubos", "pipes"].some((alias) => includesAlias(normalizedCargo, alias))) return "Tubos de Acero (Steel Pipes)";
    if (["hierro", "chatarra", "scrap"].some((alias) => includesAlias(normalizedCargo, alias))) return "Hierro / Chatarra";
    return "Bobinas de Acero (Steel Coils)";
  }
  if (specificationId === "50") {
    if (["palet", "pallet", "madera", "wood"].some((alias) => includesAlias(normalizedCargo, alias))) return "Carga Paletizada";
    return "Biomasa (Grignon, Astillas, Pellets)";
  }
  if (specificationId === "70" && (includesAlias(normalizedCargo, "carbon mineral") || includesAlias(normalizedCargo, "coal") || includesAlias(normalizedCargo, "carbon"))) return "Carbón mineral";
  if (specificationId === "90") return "Piezas Especiales / Maquinaria";
  if (hasBigBags) {
    if (["cemento", "clinker", "yeso", "mineral"].some((alias) => includesAlias(normalizedCargo, alias))) {
      return "Big Bags (Minerales/Cemento)";
    }
  }
  return "";
}

function readCargoSpecificationId(value) {
  const text = readCargoSelectionValue(value);
  const exactId = CARGO_SPECIFICATION_IDS.find((id) => id === text);
  if (exactId) return exactId;
  const leadingId = text.match(/^\s*(10|20|30|40|50|60|70|80|90|100)\b/);
  return leadingId?.[1] || "";
}

export const PACKAGING_REGEX = /(big\s*bag|saco|sling|palet|envasad)/i;

export function mapCargoDescription(value) {
  const rawCargo = String(value ?? "").trim();
  const normalizedCargo = normalizeLookupText(rawCargo);
  const promptLower = rawCargo.toLowerCase();

  const isPallet = /\b(palet|palets|pallet|pallets|paletizad[ao]|paletizado|paletizada)\b/i.test(promptLower) || /\b(palet|palets|pallet|pallets|paletizad)\b/.test(normalizedCargo);
  const isBigBag = /\b(big\s*bags?|bigbags?|jumbo\s*bags?|sacos?|bagged|slings?|envasad[ao])\b/i.test(promptLower) || /\b(big\s*bags?|bigbags?|jumbo\s*bags?|sacos?|bagged|slings?|envasad)\b/.test(normalizedCargo);
  const hasPackaging = isPallet || isBigBag || PACKAGING_REGEX.test(promptLower) || PACKAGING_REGEX.test(normalizedCargo);
  const isBulk = /\b(granel|bulk)\b/i.test(promptLower) || /\b(granel|bulk)\b/.test(normalizedCargo);

  const isBreakbulkOrProject = /\b(coche|coches|auto|autos|automovil|automoviles|vehiculo|vehiculos|cars?|vehicles?|camion|camiones|trucks?|maquinaria|machinery|equipos?|equipment|piezas?\s*(sueltas?|especiales?|de\s*proyecto)?|spare\s*parts?|eolico|eolicos|aerogenerador|aerogeneradores|wind\s*turbines?|palas?\s*(eolicas?)?|blades?|transformador|transformadores|yate|yates|yacht|yachts?|breakbulk|heavy\s*lift|carga\s*de\s*proyecto)\b/i.test(promptLower) || /\b(coche|coches|auto|autos|automovil|automoviles|vehiculo|vehiculos|cars|vehicles|camion|camiones|trucks|maquinaria|machinery|equipos|equipment|piezas|aerogenerador|aerogeneradores|eolico|eolicos|breakbulk)\b/.test(normalizedCargo);

  const isSteelOrMetals = /\b(acero|steel|bobinas?|coils?|tubos?|pipes?|tuberia|chatarra|scrap|hierro|iron|varillas?|rebar|billets?|palanquilla|perfiles|aluminio|aluminum|aluminium|siderurgic[ao]s?)\b/i.test(promptLower) || /\b(acero|steel|bobinas?|coils?|tubos?|pipes?|chatarra|scrap|hierro|iron|aluminio|aluminum|aluminium)\b/.test(normalizedCargo);

  const isBiomassOrSolidFuel = /\b(biomasa|biomass|astillas?|wood\s*chips?|pellets?|grignon|orujo|carbon(\s*mineral)?|coal|coque|coke)\b/i.test(promptLower) || /\b(biomasa|biomass|astillas?|pellets?|grignon|carbon|coal)\b/.test(normalizedCargo);

  const isCementOrMineral = /\b(cemento|cement|clinker|clinquer|yeso|gypsum|cal|lime|cenizas|slag)\b/i.test(promptLower) || /\b(cemento|cement|clinker|clinquer|yeso|gypsum|cal|lime|cenizas|slag)\b/.test(normalizedCargo);

  const isWoodOrTimber = /\b(madera|maderas|wood|timber|lumber|tableros|pasta\s*de\s*madera)\b/i.test(promptLower) || /\b(madera|wood|timber|lumber|tableros)\b/.test(normalizedCargo);

  const isFertilizer = /\b(fertilizante|fertilizantes|fertilizer|fertilizers|urea|npk|fosfato|nitrato|potasa|abono|abonos)\b/i.test(promptLower) || /\b(fertilizante|fertilizantes|fertilizer|urea|npk|fosfato|nitrato|potasa|abono)\b/.test(normalizedCargo);

  const isGrainOrAgri = /\b(trigo|wheat|maiz|corn|cebada|soja|soybeans|grano|granos|grain|cereal|cereales|agricola)\b/i.test(promptLower) || /\b(trigo|wheat|maiz|corn|cebada|soja|grano|granos|grain|cereal|cereales)\b/.test(normalizedCargo);

  const family = CARGO_FAMILIES.find((candidate) => candidate.aliases.some((alias) => includesAlias(normalizedCargo, alias)));

  let categoriaCarga = "";
  let especificacionCargaId = "100";
  let productoEspecifico = "";
  let packaging = isBulk ? "A granel" : "";
  let packingType = isBulk ? "A granel" : "";

  if (isBreakbulkOrProject) {
    categoriaCarga = "Carga de Proyecto (Breakbulk)";
    especificacionCargaId = "90";
    packaging = "Breakbulk";
    packingType = "Breakbulk";
    productoEspecifico = "Piezas Especiales / Maquinaria";
  } else if (isSteelOrMetals) {
    categoriaCarga = "Carga Siderúrgica y Metales";
    especificacionCargaId = (normalizedCargo.includes("aluminio") || normalizedCargo.includes("aluminum")) ? "40" : "20";
    packaging = isBulk ? "A granel" : "Breakbulk";
    packingType = packaging;
    productoEspecifico = selectCargoProduct(normalizedCargo, especificacionCargaId, false);
  } else if (isBiomassOrSolidFuel) {
    categoriaCarga = "Biomasa y Combustibles Sólidos";
    especificacionCargaId = (normalizedCargo.includes("carbon") || normalizedCargo.includes("coal")) ? "70" : "50";
    packaging = isPallet ? "Palets" : isBigBag ? "Big Bags" : "A granel";
    packingType = packaging;
    productoEspecifico = selectCargoProduct(normalizedCargo, especificacionCargaId, false);
  } else if (isCementOrMineral) {
    categoriaCarga = "Minerales y Construcción";
    especificacionCargaId = "10";
    packaging = isBigBag ? "Big Bags" : isPallet ? "Palets" : "A granel";
    packingType = packaging === "Palets" ? "Paletizado" : packaging;
    productoEspecifico = hasPackaging ? "Big Bags (Minerales/Cemento)" : selectCargoProduct(normalizedCargo, "10", false);
  } else if (isPallet || isWoodOrTimber || isBigBag) {
    categoriaCarga = "Carga Unitizada / Envasada";
    especificacionCargaId = isWoodOrTimber ? "50" : isFertilizer ? "30" : isGrainOrAgri ? "60" : family?.especificacionCargaId || (rawCargo.toLowerCase() === "big bags" ? "10" : "100");
    packaging = isPallet ? "Palets" : "Big Bags";
    packingType = isPallet ? "Paletizado" : "Big Bags";
    productoEspecifico = isPallet ? "Carga Paletizada" : (rawCargo.toLowerCase() === "big bags" ? "Big Bags (Minerales/Cemento)" : "");
  } else if (family) {
    categoriaCarga = family.categoriaCarga || "";
    especificacionCargaId = family.especificacionCargaId || "100";
    packaging = isBulk ? "A granel" : isPallet ? "Palets" : isBigBag ? "Big Bags" : "";
    packingType = packaging === "Palets" ? "Paletizado" : packaging;
    productoEspecifico = selectCargoProduct(normalizedCargo, especificacionCargaId, isBigBag);
  } else {
    // Desconocido
    especificacionCargaId = "100";
    categoriaCarga = isPallet || isBigBag ? "Carga Unitizada / Envasada" : "";
    packaging = isPallet ? "Palets" : isBigBag ? "Big Bags" : isBulk ? "A granel" : "";
    packingType = packaging === "Palets" ? "Paletizado" : packaging;
    productoEspecifico = "";
  }

  const effectiveHasBigBags = isBigBag || packaging === "Big Bags";

  const result = {
    categoriaCarga,
    productoEspecifico,
    especificacionCarga: CARGO_SPECIFICATIONS[especificacionCargaId] || CARGO_SPECIFICATIONS["100"],
    especificacionCargaId,
    hasBigBags: effectiveHasBigBags,
    rawCargo,
  };

  Object.defineProperties(result, {
    packaging: { value: packaging, enumerable: false, writable: true, configurable: true },
    packingType: { value: packingType, enumerable: false, writable: true, configurable: true },
    isBulk: { value: isBulk, enumerable: false, writable: true, configurable: true },
    hasPackaging: { value: hasPackaging, enumerable: false, writable: true, configurable: true },
    isCementOrMineral: { value: isCementOrMineral, enumerable: false, writable: true, configurable: true },
  });

  return result;
}

export function normalizeCargoMethod(value) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return "";
  const direct = CARGO_METHODS.find((method) => normalizeLookupText(method) === normalized);
  if (direct !== undefined) return direct;
  if (normalized.includes("big bags") && (normalized.includes("portuaria") || normalized.includes("port crane") || normalized.includes("shore crane"))) return "big_bags_portuaria";
  if (normalized.includes("big bags")) return "big_bags_barco";
  if ((normalized.includes("palet") || normalized.includes("pallet")) && (normalized.includes("portuaria") || normalized.includes("port crane") || normalized.includes("shore crane"))) return "paletizado_portuaria";
  if (normalized.includes("palet") || normalized.includes("pallet")) return "paletizado_barco";
  if (normalized.includes("cinta transportadora")) return "cinta_transportadora";
  if (normalized.includes("bomba") || normalized.includes("neumatica")) return "bombas_neumaticas";
  if (normalized.includes("camion") || normalized.includes("tolva")) return "camion_tolva";
  if (normalized.includes("grua portuaria 30") || normalized.includes("30mt")) return "grua_portuaria_30mt";
  if (normalized.includes("hierro acero") && normalized.includes("portuaria")) return "hierro_acero_portuaria";
  if (normalized.includes("hierro acero")) return "hierro_acero_barco";
  if ((normalized.includes("cuchara") || normalized.includes("grab")) && (normalized.includes("portuaria") || normalized.includes("port crane") || normalized.includes("shore crane"))) return "cuchara_portuaria";
  if (normalized.includes("cuchara") || normalized.includes("grab")) return "cuchara_grab";
  return "";
}

export function inferCargoMethod(cargoDescription, category = "", product = "", specificationId = "") {
  const normalizedCargo = normalizeLookupText([cargoDescription, category, product].filter(Boolean).join(" "));
  const normalizedSpecification = readCargoSpecificationId(specificationId);
  if (PACKAGING_REGEX.test(normalizedCargo) || /\bbig\s*bags?\b/.test(normalizedCargo)) {
    if (normalizedCargo.includes("palet") || normalizedCargo.includes("pallet")) return "paletizado_barco";
    return "big_bags_barco";
  }
  if (normalizedCargo.includes("palet") || normalizedCargo.includes("pallet")) return "paletizado_barco";
  if (normalizedCargo.includes("cemento a granel") || normalizedCargo.includes("bulk cement")) return "bombas_neumaticas";
  if (["20", "40", "90"].includes(normalizedSpecification)
    || normalizeLookupText(category) === normalizeLookupText("Carga Siderúrgica y Metales")
    || normalizeLookupText(category) === normalizeLookupText("Carga de Proyecto (Breakbulk)")) {
    return "hierro_acero_barco";
  }
  if (["10", "30", "50", "60", "70", "80"].includes(normalizedSpecification)) return "cuchara_grab";
  return "";
}

export function getCargoMethodLabel(value) {
  const method = normalizeCargoMethod(value);
  return CARGO_METHOD_LABELS[method] || String(value ?? "").trim();
}

export function normalizeLaytimeTerm(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  return LAYTIME_TERMS.slice(1)
    .sort((left, right) => right.length - left.length)
    .find((term) => normalized === term || new RegExp(`\\b${term.replace(/ /g, "\\s+")}\\b`).test(normalized)) || "";
}

export function normalizeNlpVoyagePayload(payload = {}, sourceText = "") {
  const source = payload && typeof payload === "object" ? payload : {};
  const cargoDescription = readCargoSelectionValue(
    source.cargo_type
      ?? source.cargoType
      ?? source.mercancia
      ?? source["mercancía"]
      ?? source.commodity
      ?? source.cargo_product
      ?? source.cargoProduct
      ?? source.productoEspecifico
  );
  const cargoSource = [
    cargoDescription,
    sourceText,
  ].filter(Boolean).join(" ");
  const mappedCargo = mapCargoDescription(cargoSource);
  const rawPackaging = String(source.packaging ?? source.packingType ?? source.packageType ?? source.tipoEmpaque ?? "").toLowerCase();
  const rawProduct = String(source.cargo_product ?? source.cargoProduct ?? source.productoEspecifico ?? source.productSpecific ?? source.product ?? "").toLowerCase();
  const rawCategory = String(source.cargo_category ?? source.cargoCategory ?? source.categoriaCarga ?? "").toLowerCase();
  const hasDetectedPackaging = mappedCargo.hasPackaging
    || mappedCargo.hasBigBags
    || PACKAGING_REGEX.test(cargoSource.toLowerCase())
    || PACKAGING_REGEX.test(sourceText.toLowerCase())
    || PACKAGING_REGEX.test(rawPackaging)
    || PACKAGING_REGEX.test(rawProduct)
    || PACKAGING_REGEX.test(rawCategory);

  const explicitCategory = hasDetectedPackaging ? "" : readCargoSelectionValue(source.cargo_category ?? source.cargoCategory ?? source.categoriaCarga);
  const explicitProduct = hasDetectedPackaging ? "" : readCargoSelectionValue(source.cargo_product ?? source.cargoProduct ?? source.productoEspecifico);
  const explicitSpecification = readCargoSpecificationId(
    source.cargo_specification
      ?? source.cargoSpecification
      ?? source.especificacionCargaId
      ?? source.cargo_type
      ?? source.cargoType
  );
  const explicitMethodPOL = normalizeCargoMethod(source.methodPOL ?? source.loading_method ?? source.loadingMethod ?? source.loadMethod);
  const generalLaytime = normalizeLaytimeTerm(source.laytime ?? source.laytime_terms ?? sourceText);
  const explicitLaytimePOL = normalizeLaytimeTerm(source.laytimePOL);
  const explicitLaytimePOD = normalizeLaytimeTerm(source.laytimePOD);
  const compatibleLaytimePOL = normalizeLaytimeTerm(source.loading_terms ?? source.loadingTerms);
  const compatibleLaytimePOD = normalizeLaytimeTerm(source.discharge_terms ?? source.dischargeTerms);
  const laytimePOL = explicitLaytimePOL || (compatibleLaytimePOL !== "CQD" ? compatibleLaytimePOL : "") || generalLaytime || compatibleLaytimePOL;
  const laytimePOD = explicitLaytimePOD || (compatibleLaytimePOD !== "CQD" ? compatibleLaytimePOD : "") || generalLaytime || compatibleLaytimePOD || laytimePOL;
  const rawProjectCargo = source.projectCargo || source.project_cargo || source.payload?.projectCargo || source.payload?.project_cargo || {};
  const unitWeightMT = Number(rawProjectCargo.unitWeightMT ?? rawProjectCargo.unitWeight ?? rawProjectCargo.pesoUnitario ?? source.unitWeightMT ?? source.unitWeight ?? source.pesoUnitario ?? source.payload?.unitWeightMT ?? source.payload?.pesoUnitario) || 0;
  const length = Number(rawProjectCargo.dimensions?.lengthM ?? rawProjectCargo.dimensions?.length ?? rawProjectCargo.lengthM ?? rawProjectCargo.length ?? rawProjectCargo.largo ?? source.dimensions?.lengthM ?? source.dimensions?.length ?? source.lengthM ?? source.length ?? source.largo ?? source.payload?.dimensions?.lengthM ?? source.payload?.largo) || 0;
  const width = Number(rawProjectCargo.dimensions?.widthM ?? rawProjectCargo.dimensions?.width ?? rawProjectCargo.widthM ?? rawProjectCargo.width ?? rawProjectCargo.ancho ?? source.dimensions?.widthM ?? source.dimensions?.width ?? source.widthM ?? source.width ?? source.ancho ?? source.payload?.dimensions?.widthM ?? source.payload?.ancho) || 0;
  const height = Number(rawProjectCargo.dimensions?.heightM ?? rawProjectCargo.dimensions?.height ?? rawProjectCargo.heightM ?? rawProjectCargo.height ?? rawProjectCargo.alto ?? source.dimensions?.heightM ?? source.dimensions?.height ?? source.heightM ?? source.height ?? source.alto ?? source.payload?.dimensions?.heightM ?? source.payload?.alto) || 0;
  const handlingMode = String(rawProjectCargo.handlingMode ?? source.handlingMode ?? rawProjectCargo.configuracionOperativa ?? source.configuracionOperativa ?? source.projectHandlingMode ?? 'direct-lift').trim();
  const hasProjectCargo = Boolean(source.projectCargo || source.project_cargo || source.payload?.projectCargo || unitWeightMT > 0 || length > 0 || width > 0 || height > 0);

  const hasMappedFamily = mappedCargo.especificacionCargaId !== "100";
  const specificationId = hasMappedFamily
    ? mappedCargo.especificacionCargaId
    : (CARGO_SPECIFICATION_IDS.includes(explicitSpecification)
      ? explicitSpecification
      : (hasProjectCargo ? "90" : mappedCargo.especificacionCargaId));

  const cargoCategory = mappedCargo.categoriaCarga
    || explicitCategory
    || (hasProjectCargo && specificationId === "90" ? "Carga de Proyecto (Breakbulk)" : "");

  let cargoProduct = mappedCargo.productoEspecifico
    || explicitProduct
    || (hasProjectCargo && specificationId === "90" ? (cargoDescription || "Piezas Especiales / Maquinaria") : "")
    || (hasDetectedPackaging && mappedCargo.isCementOrMineral ? "Big Bags (Minerales/Cemento)" : "");

  if (!cargoProduct && cargoDescription) {
    cargoProduct = cargoDescription;
  }

  const validatedCargo = validateCargoHierarchy(cargoCategory, cargoProduct, cargoSource);
  const resolvedCategory = validatedCargo.categoriaCarga || cargoCategory;
  const resolvedProduct = validatedCargo.productoEspecifico || cargoProduct || cargoDescription;

  const resolvedPackaging = mappedCargo.packaging
    || (rawPackaging ? (/(palet|pallet)/i.test(rawPackaging) ? "Palets" : /(big\s*bag|saco)/i.test(rawPackaging) ? "Big Bags" : rawPackaging) : (hasDetectedPackaging ? (/(palet|pallet)/i.test(cargoSource) ? "Palets" : "Big Bags") : ""));

  const defaultPackagingMethod = resolvedPackaging === "Palets"
    ? "paletizado_barco"
    : (resolvedPackaging === "Big Bags" ? "big_bags_barco" : "");

  const methodPOL = explicitMethodPOL || inferCargoMethod(
    cargoDescription,
    resolvedCategory,
    resolvedProduct,
    specificationId,
  ) || defaultPackagingMethod;
  const methodPOD = normalizeCargoMethod(source.methodPOD ?? source.discharge_method ?? source.dischargeMethod ?? source.unloadingMethod) || methodPOL;

  const normalizedProjectCargo = hasProjectCargo ? {
    unitWeightMT,
    pesoUnitario: unitWeightMT,
    length,
    largo: length,
    width,
    ancho: width,
    height,
    alto: height,
    handlingMode,
    dimensions: {
      lengthM: length,
      widthM: width,
      heightM: height,
    },
  } : undefined;

  return {
    ...source,
    ...(cargoDescription ? { cargo_type: hasDetectedPackaging && (!cargoDescription || /granel|bulk/i.test(cargoDescription)) && mappedCargo.isCementOrMineral ? "Big Bags (Minerales/Cemento)" : cargoDescription } : {}),
    ...(normalizedProjectCargo ? {
      projectCargo: normalizedProjectCargo,
      pesoUnitario: unitWeightMT,
      unitWeightMT,
      largo: length,
      length,
      ancho: width,
      width,
      alto: height,
      height,
      handlingMode,
      projectHandlingMode: handlingMode,
    } : {}),
    cargo_category: resolvedCategory,
    cargo_product: resolvedProduct,
    cargo_specification: specificationId,
    categoriaCarga: resolvedCategory,
    productoEspecifico: resolvedProduct,
    productSpecific: resolvedProduct,
    cargoCategory: resolvedCategory,
    cargoProduct: resolvedProduct,
    packaging: resolvedPackaging || (source.packaging || ""),
    packingType: resolvedPackaging === "Palets" ? "Paletizado" : (resolvedPackaging || source.packingType || ""),
    hasPackaging: hasDetectedPackaging,
    especificacionCarga: CARGO_SPECIFICATIONS[specificationId] || CARGO_SPECIFICATIONS["100"],
    especificacionCargaId: specificationId,
    methodPOL,
    methodPOD,
    laytimePOL,
    laytimePOD,
    loading_terms: laytimePOL,
    discharge_terms: laytimePOD,
  };
}

function readSideInstruction(value, side) {
  const normalized = normalizeLookupText(value);
  const marker = side === "pod" ? "pod" : "pol";
  const otherMarker = side === "pod" ? "pol" : "pod";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return side === "pol" && !normalized.includes(otherMarker) ? normalized : "";
  const afterMarker = normalized.slice(markerIndex + marker.length).trim();
  const otherIndex = afterMarker.indexOf(otherMarker);
  return (otherIndex >= 0 ? afterMarker.slice(0, otherIndex) : afterMarker).trim();
}

function resolveExplicitWizardCargoMethod(packaging, craneInstruction, cargoCategory) {
  const normalizedPackaging = normalizeLookupText(packaging);
  const normalizedCrane = normalizeLookupText(craneInstruction);
  if (!normalizedCrane) return "";
  const isPortCrane = normalizedCrane.includes("puerto") || normalizedCrane.includes("portuaria");
  const isShipCrane = normalizedCrane.includes("grua barco") || normalizedCrane.includes("barco") || normalizedCrane.includes("buque");
  if (normalizedCrane.includes("cinta")) return "cinta_transportadora";
  if (normalizedCrane.includes("camion") || normalizedCrane.includes("tolva")) return "camion_tolva";
  if (normalizedCrane.includes("bomba") || normalizedCrane.includes("neumatica")) return "bombas_neumaticas";
  if (/\bbig\s*bags?\b/.test(normalizedPackaging)) return isPortCrane ? "big_bags_portuaria" : "big_bags_barco";
  if (normalizedPackaging.includes("palet")) return isPortCrane ? "paletizado_portuaria" : "paletizado_barco";
  if (cargoCategory === "Carga Siderúrgica y Metales" || cargoCategory === "Carga de Proyecto (Breakbulk)") {
    return isPortCrane ? "hierro_acero_portuaria" : "hierro_acero_barco";
  }
  if (normalizedCrane.includes("cuchara") || normalizedCrane.includes("grab")) return isPortCrane ? "cuchara_portuaria" : "cuchara_grab";
  if (isPortCrane) return "cuchara_portuaria";
  if (isShipCrane) return "cuchara_grab";
  return "";
}

function inferWizardCargoMethod(side, packaging, cargoCategory, cargoProduct, cargoText) {
  const normalizedPackaging = normalizeLookupText(packaging);
  const normalizedCargo = normalizeLookupText([cargoProduct, cargoText].filter(Boolean).join(" "));
  if (/\bbig\s*bags?\b/.test(normalizedPackaging) || normalizedCargo.includes("big bags")) return "big_bags_barco";
  if (normalizedPackaging.includes("palet") || normalizedCargo.includes("palet")) return "paletizado_barco";
  if (cargoCategory === "Carga Siderúrgica y Metales") return "hierro_acero_barco";
  if (cargoCategory === "Carga de Proyecto (Breakbulk)") return "hierro_acero_barco";

  const isDenseSolidBulk = cargoCategory === "Minerales y Construcción"
    || ["cemento", "clinker", "clinquer", "yeso", "mineral"].some((keyword) => normalizedCargo.includes(keyword));
  const isAgriculturalOrBiomass = cargoCategory === "Biomasa y Combustibles Sólidos"
    || ["cereal", "trigo", "maiz", "cebada", "soja", "grano", "astilla", "biomasa", "pellet"].some((keyword) => normalizedCargo.includes(keyword));
  if (isDenseSolidBulk || isAgriculturalOrBiomass) return side === "pod" ? "cinta_transportadora" : "cuchara_grab";
  return "";
}

function resolveGeographicLaytime(location) {
  const normalizedLocation = normalizeLookupText(location);
  return ISLAMIC_LOCATION_KEYWORDS.some((keyword) => normalizedLocation.includes(normalizeLookupText(keyword))) ? "FHEX" : "SHEX";
}

export function validateSixStepWizardPayload(wizardData = {}, extractedScenario = {}) {
  const cargoText = [wizardData.cargoDescription, wizardData.packaging].filter(Boolean).join(" ");
  const mappedCargo = mapCargoDescription(cargoText);
  const craneText = String(wizardData.craneDetails || "");
  const polCrane = readSideInstruction(craneText, "pol") || craneText;
  const podCrane = readSideInstruction(craneText, "pod");
  const explicitMethodPOL = resolveExplicitWizardCargoMethod(wizardData.packaging, polCrane, mappedCargo.categoriaCarga);
  const explicitMethodPOD = resolveExplicitWizardCargoMethod(wizardData.packaging, podCrane, mappedCargo.categoriaCarga);
  const methodPOL = explicitMethodPOL || inferWizardCargoMethod("pol", wizardData.packaging, mappedCargo.categoriaCarga, mappedCargo.productoEspecifico, cargoText);
  const methodPOD = podCrane
    ? explicitMethodPOD || inferWizardCargoMethod("pod", wizardData.packaging, mappedCargo.categoriaCarga, mappedCargo.productoEspecifico, cargoText)
    : explicitMethodPOL || inferWizardCargoMethod("pod", wizardData.packaging, mappedCargo.categoriaCarga, mappedCargo.productoEspecifico, cargoText) || methodPOL;
  const loadingRate = Number(extractedScenario.loading_rate ?? extractedScenario.loadingRate ?? extractedScenario.ratePOL) || 0;
  const dischargeRate = Number(extractedScenario.discharge_rate ?? extractedScenario.dischargeRate ?? extractedScenario.ratePOD) || 0;
  const normalizedPayload = normalizeNlpVoyagePayload({
    ...extractedScenario,
    cargo_type: cargoText,
    cargo_category: mappedCargo.categoriaCarga,
    cargo_product: mappedCargo.productoEspecifico,
    cargo_specification: mappedCargo.especificacionCargaId,
    methodPOL,
    methodPOD,
    loading_rate: loadingRate,
    discharge_rate: dischargeRate,
    ratePOL: loadingRate,
    ratePOD: dischargeRate,
    laytimePOL: resolveGeographicLaytime(extractedScenario.pol),
    laytimePOD: resolveGeographicLaytime(extractedScenario.pod),
  }, cargoText);

  return {
    ...normalizedPayload,
    methodPOL: getCargoMethodLabel(normalizedPayload.methodPOL),
    methodPOD: getCargoMethodLabel(normalizedPayload.methodPOD),
    ritmoMode: "manual",
    ritmoMode_pol: "manual",
    ritmoMode_pod: "manual",
    podCalcMode: "manual",
  };
}
