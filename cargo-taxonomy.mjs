export const CARGO_TAXONOMY = Object.freeze([
  Object.freeze({ id: "10", label: "Cemento, yeso, cal y clínker", chapter: "25" }),
  Object.freeze({ id: "20", label: "Hierro, acero y sus manufacturas", chapter: "72/73" }),
  Object.freeze({ id: "30", label: "Fertilizantes y abonos", chapter: "31" }),
  Object.freeze({ id: "40", label: "Aluminio y sus manufacturas", chapter: "76" }),
  Object.freeze({ id: "50", label: "Madera, carbón vegetal y pasta de madera", chapter: "44/47" }),
  Object.freeze({ id: "60", label: "Cereales, granos y soja", chapter: "10/12" }),
  Object.freeze({ id: "70", label: "Combustibles, carbón mineral y aceites", chapter: "27" }),
  Object.freeze({ id: "80", label: "Productos químicos y plásticos", chapter: "28/29/39" }),
  Object.freeze({ id: "90", label: "Maquinaria, vehículos y equipos pesados", chapter: "84/85/87" }),
  Object.freeze({ id: "100", label: "Otros", chapter: "N/A" }),
]);

export const DEFAULT_CARGO_TYPE_ID = "100";

const CARGO_RULES = Object.freeze({
  "10": Object.freeze([
    Object.freeze({ key: "cement_carrier", label: "Cement Carrier", weight: 14, terms: ["cement carrier", "cementero", "clinker carrier"] }),
    Object.freeze({ key: "self_discharger", label: "Self-Discharger", weight: 10, terms: ["self discharger", "self unloading", "self unloader"] }),
  ]),
  "20": Object.freeze([
    Object.freeze({ key: "open_hatch_gantry", label: "Open Hatch Gantry Crane", weight: 14, terms: ["open hatch gantry crane", "open hatch gantry", "ohgc"] }),
    Object.freeze({ key: "box_shaped_holds", label: "Box-shaped holds", weight: 8, terms: ["box shaped holds", "box shaped hold", "box holds"] }),
  ]),
  "60": Object.freeze([
    Object.freeze({ key: "grain_fitted", label: "Grain Fitted", weight: 12, terms: ["grain fitted", "grain certificate", "grain certified"] }),
    Object.freeze({ key: "clean_holds", label: "Bodegas limpias", weight: 8, terms: ["hold cleanliness clean", "holds clean", "clean holds", "grain clean"] }),
  ]),
  "70": Object.freeze([
    Object.freeze({ key: "high_ventilation", label: "Alta ventilación", weight: 12, terms: ["high ventilation", "forced ventilation", "mechanical ventilation", "high capacity ventilation"] }),
    Object.freeze({ key: "ventilation_rating", label: "Rating de ventilación", weight: 8, terms: ["ventilation rating", "ventilation class", "air changes per hour", "air changes hour"] }),
  ]),
  "90": Object.freeze([
    Object.freeze({ key: "heavy_lift", label: "Heavy Lift gear", weight: 18, terms: ["heavy lift", "heavy lift gear", "heavy cargo crane", "project cargo gear"] }),
  ]),
});

export const CARGO_DWT_MAX_MULTIPLIERS = Object.freeze({
  "10": 3.5,
  "20": 4,
  "30": 4,
  "40": 4,
  "50": 5,
  "60": 3.5,
  "70": 5,
  "80": 4,
  "90": 8,
  "100": 8,
});

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectText(value, output, depth = 0) {
  if (output.length >= 160 || depth > 4 || value === null || value === undefined) return;
  if (["string", "number", "boolean"].includes(typeof value)) {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 30).forEach(item => collectText(item, output, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).slice(0, 80).forEach(([key, item]) => {
      output.push(key);
      collectText(item, output, depth + 1);
    });
  }
}

function findNestedValue(value, aliases, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  const normalizedAliases = aliases.map(normalizeText);
  for (const [key, item] of Object.entries(value)) {
    if (normalizedAliases.includes(normalizeText(key))) return item;
  }
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") {
      const nestedValue = findNestedValue(item, aliases, depth + 1);
      if (nestedValue !== undefined) return nestedValue;
    }
  }
  return undefined;
}

function optionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const normalizedValue = normalizeText(value);
  if (["true", "yes", "si", "geared", "fitted", "available"].includes(normalizedValue)) return true;
  if (["false", "no", "gearless", "not fitted", "unavailable"].includes(normalizedValue)) return false;
  return null;
}

function optionalNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function classifyVesselDesign(shipType, vessel) {
  const declaredType = normalizeText(shipType || findNestedValue(vessel, ["ship_type", "vessel_type", "shipType", "vesselType", "tipo_buque", "type"]));
  return {
    declaredType: declaredType || "unknown",
    bulk: /\b(bulk carrier|bulker|dry bulk|handysize|handymax|supramax|ultramax|panamax|capesize)\b/.test(declaredType),
    cement: /\b(cement carrier|cementero|clinker carrier)\b/.test(declaredType),
    general: /\b(general cargo|coaster|cargo ship)\b/.test(declaredType),
    multipurpose: /\b(multipurpose|multi purpose|mpp|mpv|heavy lift|open hatch)\b/.test(declaredType),
    tanker: /\b(tanker|oil tanker|chemical tanker|product tanker|crude|lng|lpg)\b/.test(declaredType),
    container: /\b(container|containership|feeder)\b/.test(declaredType),
    roro: /\b(ro ro|roro|vehicle carrier)\b/.test(declaredType),
    nonCargo: /\b(passenger|cruise|tug|fishing|pleasure|yacht|offshore supply|naval|warship)\b/.test(declaredType),
  };
}

function cargoAllowsDesign(cargoTypeId, design) {
  if (design.nonCargo || design.declaredType === "unknown") return false;
  if (cargoTypeId === "10") return design.bulk || design.cement;
  if (cargoTypeId === "20") return design.bulk || design.general || design.multipurpose;
  if (["30", "40", "50", "60"].includes(cargoTypeId)) return design.bulk || design.general || design.multipurpose;
  if (cargoTypeId === "70") return design.bulk || design.tanker;
  if (cargoTypeId === "80") return design.bulk || design.general || design.multipurpose || /chemical tanker/.test(design.declaredType);
  if (cargoTypeId === "90") return design.general || design.multipurpose || design.roro;
  return !design.nonCargo;
}

export function evaluateCargoVesselEligibility({
  cargoTypeId,
  vessel,
  shipType,
  dwt,
  quantity,
  requiredVolumeCbm = 0,
  gearedRequired = false,
  grabRequired = false,
  requiredGrabCapacityCbm = 0,
  requiredCraneSwlMt = 0,
  draftOk = true,
  loaOk = true,
  dateOk = true,
}) {
  const normalizedCargoTypeId = resolveCargoTaxonomyId(cargoTypeId);
  const design = classifyVesselDesign(shipType, vessel);
  const vesselDwt = optionalNumber(dwt);
  const cargoQuantity = optionalNumber(quantity) || 0;
  const requiredCargoVolumeCbm = optionalNumber(requiredVolumeCbm) || 0;
  const maxMultiplier = CARGO_DWT_MAX_MULTIPLIERS[normalizedCargoTypeId] || CARGO_DWT_MAX_MULTIPLIERS[DEFAULT_CARGO_TYPE_ID];
  const maxSuitableDwt = cargoQuantity > 0 ? Math.max(cargoQuantity * maxMultiplier, cargoQuantity + 10_000) : null;
  const textParts = [];
  collectText(vessel, textParts);
  const evidenceText = normalizeText(textParts.join(" "));
  const directGearValue = optionalBoolean(findNestedValue(vessel, ["hasGears", "has_gears", "hasCranes", "gruas", "gruas_geared", "geared"]));
  const hasGears = /\b(gearless|without cranes|no cranes)\b/.test(evidenceText)
    ? false
    : directGearValue ?? (/\b(geared|ship cranes|deck cranes|derricks|crane fitted)\b/.test(evidenceText) ? true : null);
  const hasGrab = /\b(grab fitted|grabs fitted|ship grabs|hydraulic grab|grab crane)\b/.test(evidenceText)
    || optionalBoolean(findNestedValue(vessel, ["hasGrab", "has_grab", "grabs", "grabFitted"])) === true;
  const grabCapacityCbm = optionalNumber(findNestedValue(vessel, ["grabCapacityCbm", "grab_capacity_cbm", "grabCapacity", "grab_capacity"]));
  const craneSwlMt = optionalNumber(findNestedValue(vessel, ["craneSwlMt", "crane_swl_mt", "craneSwl", "crane_capacity_mt", "craneCapacity"]));
  const grainCapacityCbm = optionalNumber(findNestedValue(vessel, [
    "grainCapacity",
    "grain_capacity",
    "grainCapacityCbm",
    "grain_capacity_cbm",
    "grainCubicCapacity",
    "grain_cubic_capacity",
    "capacityCbm",
    "capacity_cbm",
    "cubicCapacity",
    "cubic_capacity",
  ]));
  const criticalReasons = [];

  if (!cargoAllowsDesign(normalizedCargoTypeId, design)) criticalReasons.push(`Diseño de buque incompatible: ${design.declaredType}`);
  if (cargoQuantity > 0 && vesselDwt === null) criticalReasons.push("DWT no disponible para validar capacidad");
  if (cargoQuantity > 0 && vesselDwt !== null && vesselDwt < cargoQuantity) criticalReasons.push(`DWT ${vesselDwt} MT inferior a la carga ${cargoQuantity} MT`);
  if (maxSuitableDwt !== null && vesselDwt !== null && vesselDwt > maxSuitableDwt) criticalReasons.push(`DWT ${vesselDwt} MT sobredimensionado para una operación de ${cargoQuantity} MT`);
  if (requiredCargoVolumeCbm > 0 && grainCapacityCbm !== null && grainCapacityCbm < requiredCargoVolumeCbm) {
    criticalReasons.push(`Grain Capacity ${grainCapacityCbm} m³ inferior al volumen requerido ${requiredCargoVolumeCbm} m³`);
  }
  if (!draftOk) criticalReasons.push("Calado superior al máximo de puerto");
  if (!loaOk) criticalReasons.push("Eslora superior al máximo de puerto");
  if (!dateOk) criticalReasons.push("ETA fuera de la ventana laycan");
  if (gearedRequired && hasGears !== true) criticalReasons.push(hasGears === false ? "Buque sin grúas a bordo" : "Equipamiento de grúas no acreditado");
  if (grabRequired && !hasGrab) criticalReasons.push("Capacidad de cuchara/grab no acreditada");
  if (grabRequired && requiredGrabCapacityCbm > 0 && (grabCapacityCbm === null || grabCapacityCbm < requiredGrabCapacityCbm)) {
    criticalReasons.push(`Grab capacity inferior o no acreditada (${requiredGrabCapacityCbm} cbm requeridos)`);
  }
  if (gearedRequired && requiredCraneSwlMt > 0 && (craneSwlMt === null || craneSwlMt < requiredCraneSwlMt)) {
    criticalReasons.push(`Crane SWL inferior o no acreditado (${requiredCraneSwlMt} MT requeridos)`);
  }

  return {
    eligible: criticalReasons.length === 0,
    hiddenByDefault: criticalReasons.length > 0,
    criticalReasons,
    cargoTypeId: normalizedCargoTypeId,
    design,
    dwt: {
      vessel: vesselDwt,
      required: cargoQuantity,
      maximumSuitable: maxSuitableDwt,
    },
    volume: {
      requiredCbm: requiredCargoVolumeCbm,
      vesselCbm: grainCapacityCbm,
      compatible: requiredCargoVolumeCbm <= 0 || grainCapacityCbm === null || grainCapacityCbm >= requiredCargoVolumeCbm,
    },
    equipment: {
      gearedRequired: Boolean(gearedRequired),
      grabRequired: Boolean(grabRequired),
      hasGears,
      hasGrab,
      grabCapacityCbm,
      craneSwlMt,
    },
  };
}

export function getCargoTaxonomyItem(cargoTypeId) {
  const normalizedId = resolveCargoTaxonomyId(cargoTypeId);
  return CARGO_TAXONOMY.find(item => item.id === normalizedId)
    || CARGO_TAXONOMY.find(item => item.id === DEFAULT_CARGO_TYPE_ID);
}

export function resolveCargoTaxonomyId(value) {
  const rawValue = String(value ?? "").trim();
  if (CARGO_TAXONOMY.some(item => item.id === rawValue)) return rawValue;
  const normalizedValue = normalizeText(rawValue);
  const exactItem = CARGO_TAXONOMY.find(item => normalizeText(item.label) === normalizedValue);
  if (exactItem) return exactItem.id;
  if (/\b(cemento|cement|clinker|clinquer|yeso|cal)\b/.test(normalizedValue)) return "10";
  if (/\b(hierro|acero|steel|iron)\b/.test(normalizedValue)) return "20";
  if (/\b(fertilizante|fertilizer|abono)\b/.test(normalizedValue)) return "30";
  if (/\b(aluminio|aluminium|aluminum)\b/.test(normalizedValue)) return "40";
  if (/\b(madera|wood|carbon vegetal|charcoal|pasta de madera|wood pulp)\b/.test(normalizedValue)) return "50";
  if (/\b(cereal|grano|grain|soja|soy|trigo|wheat)\b/.test(normalizedValue)) return "60";
  if (/\b(combustible|fuel|carbon mineral|coal|aceite|oil)\b/.test(normalizedValue)) return "70";
  if (/\b(quimico|chemical|plastico|plastic)\b/.test(normalizedValue)) return "80";
  if (/\b(maquinaria|machinery|vehiculo|vehicle|equipo pesado|heavy equipment|proyecto|project cargo)\b/.test(normalizedValue)) return "90";
  return DEFAULT_CARGO_TYPE_ID;
}

export function calculateCargoIntelligenceBoost(cargoTypeId, vessel) {
  const cargoType = getCargoTaxonomyItem(cargoTypeId);
  const rules = CARGO_RULES[cargoType.id] || [];
  const textParts = [];
  collectText(vessel, textParts);
  const haystack = normalizeText(textParts.join(" "));
  const matchedSignals = rules
    .filter(rule => rule.terms.some(term => haystack.includes(normalizeText(term))))
    .map(rule => ({ key: rule.key, label: rule.label, weight: rule.weight }));

  return {
    cargoTypeId: cargoType.id,
    cargoTypeLabel: cargoType.label,
    boost: Math.min(20, matchedSignals.reduce((total, signal) => total + signal.weight, 0)),
    matchedSignals,
  };
}

if (typeof window !== "undefined") {
  window.CARGO_TAXONOMY = CARGO_TAXONOMY;
  window.DEFAULT_CARGO_TYPE_ID = DEFAULT_CARGO_TYPE_ID;
  window.getCargoTaxonomyItem = getCargoTaxonomyItem;
  window.resolveCargoTaxonomyId = resolveCargoTaxonomyId;
  window.getCargoTaxonomyLabel = value => getCargoTaxonomyItem(value).label;
}
