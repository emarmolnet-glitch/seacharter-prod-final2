export const CARGO_CATEGORIES = Object.freeze([
  "Minerales y Construcción",
  "Biomasa y Combustibles Sólidos",
  "Carga Siderúrgica y Metales",
  "Carga Unitizada / Envasada",
  "Carga de Proyecto (Breakbulk)",
]);

export const CARGO_PRODUCTS = Object.freeze([
  "Cemento a granel",
  "Clínker",
  "Yeso",
  "Biomasa (Grignon, Astillas, Pellets)",
  "Carbón mineral",
  "Bobinas de Acero (Steel Coils)",
  "Tubos de Acero (Steel Pipes)",
  "Hierro / Chatarra",
  "Big Bags (Minerales/Cemento)",
  "Carga Paletizada",
  "Piezas Especiales / Maquinaria",
]);

export const CARGO_SPECIFICATION_IDS = Object.freeze(["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"]);

export const CARGO_SPECIFICATIONS = Object.freeze({
  "10": "10 - Cemento, yeso, cal y clínker (25)",
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

export const LAYTIME_TERMS = Object.freeze(["", "SHINC", "SHEX", "SHEX UU", "SHEX EIU", "FHINC", "FHEX", "SSHEX", "SSHINC", "CQD"]);

const CARGO_FAMILIES = Object.freeze([
  Object.freeze({
    aliases: ["cemento", "cement", "clinker", "clinquer", "yeso", "gypsum", "cal", "lime", "cenizas", "slag"],
    categoriaCarga: "Minerales y Construcción",
    especificacionCargaId: "10",
  }),
  Object.freeze({
    aliases: ["acero", "steel", "hierro", "bobinas", "coils", "chatarra", "scrap", "varilla", "billets", "pipes"],
    categoriaCarga: "Carga Siderúrgica y Metales",
    especificacionCargaId: "20",
  }),
  Object.freeze({
    aliases: ["trigo", "wheat", "maiz", "corn", "cebada", "soja", "soybeans", "grano", "grain"],
    categoriaCarga: "",
    especificacionCargaId: "60",
  }),
  Object.freeze({
    aliases: ["fertilizante", "fertilizer", "urea", "npk", "fosfato", "nitrato", "potasa"],
    categoriaCarga: "",
    especificacionCargaId: "30",
  }),
  Object.freeze({
    aliases: ["maquinaria", "machinery", "vehiculos", "piezas de proyecto", "aerogeneradores"],
    categoriaCarga: "Carga de Proyecto (Breakbulk)",
    especificacionCargaId: "90",
  }),
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAlias(normalizedText, alias) {
  const normalizedAlias = normalizeText(alias);
  return normalizedAlias && ` ${normalizedText} `.includes(` ${normalizedAlias} `);
}

function selectCargoProduct(normalizedCargo, specificationId, hasBigBags) {
  if (hasBigBags) return "Big Bags (Minerales/Cemento)";
  if (specificationId === "10") {
    if (includesAlias(normalizedCargo, "clinker")) return "Clínker";
    if (includesAlias(normalizedCargo, "yeso") || includesAlias(normalizedCargo, "gypsum")) return "Yeso";
    return "Cemento a granel";
  }
  if (specificationId === "20") {
    if (includesAlias(normalizedCargo, "pipes")) return "Tubos de Acero (Steel Pipes)";
    if (["hierro", "chatarra", "scrap"].some((alias) => includesAlias(normalizedCargo, alias))) return "Hierro / Chatarra";
    return "Bobinas de Acero (Steel Coils)";
  }
  if (specificationId === "90") return "Piezas Especiales / Maquinaria";
  return "";
}

export function mapCargoDescription(value) {
  const rawCargo = String(value ?? "").trim();
  const normalizedCargo = normalizeText(rawCargo);
  const family = CARGO_FAMILIES.find((candidate) => candidate.aliases.some((alias) => includesAlias(normalizedCargo, alias)));
  const hasBigBags = /\bbig\s*bags?\b/.test(normalizedCargo);
  const specificationId = family?.especificacionCargaId || (hasBigBags ? "10" : "100");
  const categoriaCarga = family?.categoriaCarga || (hasBigBags ? "Carga Unitizada / Envasada" : "");
  return {
    categoriaCarga,
    productoEspecifico: selectCargoProduct(normalizedCargo, specificationId, hasBigBags),
    especificacionCarga: CARGO_SPECIFICATIONS[specificationId],
    especificacionCargaId: specificationId,
    hasBigBags,
    rawCargo,
  };
}

export function normalizeCargoMethod(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const direct = CARGO_METHODS.find((method) => normalizeText(method) === normalized);
  if (direct !== undefined) return direct;
  if (normalized.includes("big bags") && (normalized.includes("barco") || normalized.includes("ship"))) return "big_bags_barco";
  if (normalized.includes("big bags") && (normalized.includes("portuaria") || normalized.includes("port crane"))) return "big_bags_portuaria";
  if (normalized.includes("cinta transportadora")) return "cinta_transportadora";
  if (normalized.includes("bombas neumaticas")) return "bombas_neumaticas";
  if (normalized.includes("camion tolva")) return "camion_tolva";
  if (normalized.includes("hierro acero") && normalized.includes("portuaria")) return "hierro_acero_portuaria";
  if (normalized.includes("hierro acero")) return "hierro_acero_barco";
  return "";
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
  const cargoSource = [
    source.cargo_type,
    source.cargoType,
    source.commodity,
    source.cargo_product,
    source.cargoProduct,
    source.productoEspecifico,
    sourceText,
  ].filter(Boolean).join(" ");
  const mappedCargo = mapCargoDescription(cargoSource);
  const explicitCategory = String(source.cargo_category ?? source.cargoCategory ?? source.categoriaCarga ?? "").trim();
  const explicitProduct = String(source.cargo_product ?? source.cargoProduct ?? source.productoEspecifico ?? "").trim();
  const explicitSpecification = String(source.cargo_specification ?? source.cargoSpecification ?? source.especificacionCargaId ?? "").trim();
  const methodPOL = mappedCargo.hasBigBags
    ? "big_bags_barco"
    : normalizeCargoMethod(source.methodPOL ?? source.loading_method ?? source.loadingMethod ?? source.loadMethod);
  const methodPOD = normalizeCargoMethod(source.methodPOD ?? source.discharge_method ?? source.dischargeMethod ?? source.unloadingMethod) || methodPOL;
  const generalLaytime = normalizeLaytimeTerm(source.laytime ?? source.laytime_terms ?? sourceText);
  const explicitLaytimePOL = normalizeLaytimeTerm(source.laytimePOL);
  const explicitLaytimePOD = normalizeLaytimeTerm(source.laytimePOD);
  const compatibleLaytimePOL = normalizeLaytimeTerm(source.loading_terms ?? source.loadingTerms);
  const compatibleLaytimePOD = normalizeLaytimeTerm(source.discharge_terms ?? source.dischargeTerms);
  const laytimePOL = explicitLaytimePOL || (compatibleLaytimePOL !== "CQD" ? compatibleLaytimePOL : "") || generalLaytime || compatibleLaytimePOL;
  const laytimePOD = explicitLaytimePOD || (compatibleLaytimePOD !== "CQD" ? compatibleLaytimePOD : "") || generalLaytime || compatibleLaytimePOD || laytimePOL;
  const hasMappedFamily = mappedCargo.especificacionCargaId !== "100";
  const specificationId = hasMappedFamily
    ? mappedCargo.especificacionCargaId
    : CARGO_SPECIFICATION_IDS.includes(explicitSpecification)
      ? explicitSpecification
      : mappedCargo.especificacionCargaId;
  const cargoCategory = (hasMappedFamily && mappedCargo.categoriaCarga) || explicitCategory || mappedCargo.categoriaCarga;
  const cargoProduct = mappedCargo.hasBigBags || (hasMappedFamily && mappedCargo.productoEspecifico)
    ? mappedCargo.productoEspecifico
    : explicitProduct || mappedCargo.productoEspecifico;

  return {
    ...source,
    cargo_category: cargoCategory,
    cargo_product: cargoProduct,
    cargo_specification: specificationId,
    categoriaCarga: cargoCategory,
    productoEspecifico: cargoProduct,
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
