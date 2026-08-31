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

export function estimateDwtFromDimensions(loa, beam, draft) {
  const l = Number(loa);
  const b = Number(beam);
  const d = Number(draft);
  if (Number.isFinite(l) && l > 0 && Number.isFinite(b) && b > 0 && Number.isFinite(d) && d > 0) {
    return Math.round(l * b * d * 0.70 * 1.025);
  }
  return 0;
}

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
  const declaredType = normalizeText(shipType || findNestedValue(vessel, ["ship_type", "vessel_type", "shipType", "vesselType", "tipo_buque", "type", "scrapedType", "categoryLabel", "vesselClass", "radarCategory"]));
  const isAisCargoCode = /^7[0-9]$/.test(declaredType) || declaredType === "70";
  const isClassB = optionalBoolean(findNestedValue(vessel, ["isClassB", "is_class_b", "classB", "class_b"])) === true
    || /\b(class b|clase b|ais b)\b/.test(normalizeText(findNestedValue(vessel, ["aisClass", "ais_class", "transponder", "transponderType"]) || ""));
  const isGeneralCargoWord = /\b(cargo|vessel|freighter|ship|merchant|motor vessel|mv)\b/.test(declaredType);

  const dwtVal = optionalNumber(findNestedValue(vessel, ["dwt", "DWT", "dwt_ajustado", "capacity"]));
  const isTanker = /\b(tanker|oil tanker|chemical tanker|product tanker|crude|lng|lpg|petrolero|quimiquero|tanquero)\b/.test(declaredType);
  const isContainer = /\b(container|containership|feeder|boxship|portacontenedores)\b/.test(declaredType);
  const isRoro = /\b(ro ro|roro|vehicle carrier)\b/.test(declaredType);
  const isTug = /\b(tug|tugboat|remolcador|remolque|pusher|pushboat|empujador)\b/.test(declaredType);
  const isPassenger = /\b(passenger|cruise|ferry|ropax|ro-pax|pasaje|pasajeros|crucero)\b/.test(declaredType);
  const hasExplicitNonDryDesign = isTanker || isContainer || isRoro || isTug || isPassenger;
  const isCoasterKeyword = /\b(coaster|cabotage|cabotaje|costero)\b/.test(declaredType);
  const isCoasterDwt = dwtVal !== null && dwtVal >= 1000 && dwtVal <= 10000 && !hasExplicitNonDryDesign;
  const isCoaster = isCoasterKeyword || isCoasterDwt;

  const isMinibulkerKeyword = /\b(mini bulker|minibulker|mini-bulker)\b/.test(declaredType);
  const isMinibulkerDwt = dwtVal !== null && dwtVal > 10000 && dwtVal <= 15000 && !hasExplicitNonDryDesign;
  const isMinibulker = isMinibulkerKeyword || isMinibulkerDwt;

  const isBulk = (/\b(bulk carrier|bulker|dry bulk|handysize|handymax|supramax|ultramax|panamax|capesize|coaster|mini bulker|minibulker|mini-bulker)\b/.test(declaredType)
    || isAisCargoCode || isCoaster || isMinibulker) && !hasExplicitNonDryDesign;
  const isCement = /\b(cement carrier|cementero|clinker carrier)\b/.test(declaredType);
  const isGeneral = (/\b(general cargo|coaster|mini bulker|minibulker|mini-bulker|cargo ship|cargo|freighter|ship|merchant)\b/.test(declaredType)
    || isAisCargoCode || isGeneralCargoWord || isCoaster || isMinibulker || isClassB) && !hasExplicitNonDryDesign;
  const isMultipurpose = (/\b(multipurpose|multi purpose|mpp|mpv|heavy lift|open hatch)\b/.test(declaredType)
    || isAisCargoCode || isGeneralCargoWord || isCoaster || isMinibulker || isClassB) && !hasExplicitNonDryDesign;
  const isNonCargo = (isTug || isPassenger || /\b(fishing|trawler|pleasure|yacht|sailing|search and rescue|search & rescue|sar|rescue|salvage|dredger|dredging|pilot|pilot boat|patrol|military|warship|navy|offshore supply|platform supply|naval)\b/.test(declaredType))
    && !(isCoaster || isMinibulker);

  return {
    declaredType: declaredType || "cargo",
    bulk: isBulk,
    cement: isCement,
    general: isGeneral,
    multipurpose: isMultipurpose,
    coaster: isCoaster,
    minibulker: isMinibulker,
    isClassB,
    tanker: isTanker,
    container: isContainer,
    roro: isRoro,
    tug: isTug,
    passenger: isPassenger,
    nonCargo: isNonCargo,
  };
}

const NON_COMMERCIAL_TEXT_PATTERN = /\b(fishing|pesquero|pesca|trawler|trawl|drifter|seiner|longliner|fish factory|pesquero de arrastre|tug|tugboat|remolcador|remolque|towing|towage|pusher|pushboat|empujador|escort tug|support vessel|passenger|cruise|ferry|ropax|ro-pax|pasaje|pasajeros|crucero|pleasure craft|pleasure|recreational|recreo|yacht|superyacht|megayacht|yate|sailing|sailing vessel|sailboat|velero|sport fishing|dredger|dredging|draga|dragado|manned vts|vts|port hand mark|starboard hand mark|special mark|sea farm|special mark - sea farm|reference point|isolated danger|navigation mark|buoy|boya|baliza|military ops|military|warship|navy|patrol|patrullera|search and rescue|search & rescue|sar|rescue vessel|rescue|salvage|salvamento|guardacostas|coast guard|port service|servicio portuario|workboat|barco de trabajo|crew boat|pilot|pilot boat|prácticos|tender|port tender|diving|buceo|pontoon|ponton|anti-pollution|oil recovery|cable layer|pipe layer|research vessel|investigación|drillship|drilling|offshore supply|platform supply|platform|psv|ahts|other|unknown|desconocido|otros)\b/i;

const COMMERCIAL_CARGO_TEXT_PATTERN = /\b(bulk carrier|bulker|dry bulk|dry cargo|granelero|graneles|capesize|post-panamax|kamsarmax|panamax|ultramax|supramax|handymax|handysize|mini bulker|minibulker|mini-bulker|ore carrier|grain carrier|collier|wood chips carrier|self-unloading bulker|self unloader|general cargo|general cargo vessel|carguero|buque de carga|cargo ship|cargo|coaster|coastal cargo|cabotage|cabotaje|costero|freighter|merchant|motor vessel|mv|multipurpose|multi purpose|multi-purpose|mpp|mpv|mmpp|open hatch|box hold|multipropósito|container ship|container|containership|feeder|boxship|portacontenedores|tanker|oil tanker|chemical tanker|product tanker|crude oil tanker|petrolero|quimiquero|heavy load carrier|heavy lift|heavy load|heavy carrier|project cargo|carga pesada|break bulk|breakbulk|break-bulk|ro-ro cargo|roro cargo|ro-ro|roro|vehicle carrier|car carrier|cement carrier|cementero|cement|cemento|clinker carrier|clinker)\b/i;

export function isCommercialCargoVessel(vessel) {
  if (!vessel || typeof vessel !== "object") return false;
  const textParts = [];
  collectText(vessel, textParts);
  const text = normalizeText(textParts.join(" "));

  if (NON_COMMERCIAL_TEXT_PATTERN.test(text)) {
    const isHardNoise = /\b(fishing|trawler|tug|tugboat|pleasure craft|sailing|yacht|dredger|manned vts|vts|port hand mark|starboard hand mark|special mark|sea farm|reference point|isolated danger|buoy|boya|baliza|military ops|search and rescue|sar|pilot|workboat|other|unknown)\b/i.test(text);
    if (isHardNoise) {
      return false;
    }
  }

  const rawType = findNestedValue(vessel, ["ShipType", "shipType", "Type", "type", "vesselType", "vessel_type"]);
  const numericType = Number(rawType);
  if (Number.isFinite(numericType)) {
    if ((numericType >= 20 && numericType < 70) || numericType === 0 || numericType >= 90) {
      return false;
    }
    if ((numericType >= 70 && numericType <= 79) || (numericType >= 80 && numericType <= 89)) {
      return true;
    }
  }

  if (COMMERCIAL_CARGO_TEXT_PATTERN.test(text)) return true;

  const dwt = optionalNumber(findNestedValue(vessel, ["dwt", "DWT", "deadweight", "dwt_ajustado"]));
  const isCargoClass = /\b(cargo|bulker|freighter|merchant|coaster)\b/i.test(text);
  return (dwt !== null && dwt >= 500 && isCargoClass);
}

export const isCommercialVessel = isCommercialCargoVessel;

export function filterCommercialVessels(vessels) {
  return (Array.isArray(vessels) ? vessels : []).filter(isCommercialCargoVessel);
}

function cargoAllowsDesign(cargoTypeId, design) {
  if (design.nonCargo || design.tug || design.passenger) return false;
  if (["10", "20", "30", "40", "50", "60"].includes(cargoTypeId) && (design.tanker || design.container)) return false;
  if (design.declaredType === "unknown" || !design.declaredType) return true;
  if (cargoTypeId === "10") return design.bulk || design.cement || design.general || design.multipurpose;
  if (cargoTypeId === "20") return design.bulk || design.general || design.multipurpose;
  if (["30", "40", "50", "60"].includes(cargoTypeId)) return design.bulk || design.general || design.multipurpose;
  if (cargoTypeId === "70") return design.bulk || design.tanker || design.general;
  if (cargoTypeId === "80") return design.bulk || design.general || design.multipurpose || design.tanker;
  if (cargoTypeId === "90") return design.general || design.multipurpose || design.roro || design.bulk;
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
  maxDwtTolerance = 1.40,
}) {
  const normalizedCargoTypeId = resolveCargoTaxonomyId(cargoTypeId);
  const design = classifyVesselDesign(shipType, vessel);
  const vesselDwt = optionalNumber(dwt);
  const cargoQuantity = optionalNumber(quantity) || 0;
  const requiredCargoVolumeCbm = optionalNumber(requiredVolumeCbm) || 0;
  const effectiveMaxDwtTolerance = Number(maxDwtTolerance) > 0 ? Number(maxDwtTolerance) : 1.40;
  const maxSuitableDwt = cargoQuantity > 0 ? cargoQuantity * effectiveMaxDwtTolerance : null;
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
  if (maxSuitableDwt !== null && vesselDwt !== null && vesselDwt > maxSuitableDwt) criticalReasons.push(`DWT ${vesselDwt} MT sobredimensionado para una operación de ${cargoQuantity} MT (MÁX ${Math.round((effectiveMaxDwtTolerance - 1) * 100)}% DE TOLERANCIA)`);
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

  const hasTechnicalWarning = criticalReasons.length > 0 || vesselDwt === null;

  return {
    eligible: criticalReasons.length === 0,
    hasTechnicalWarning,
    hasWarning: hasTechnicalWarning,
    warning: hasTechnicalWarning ? criticalReasons.join("; ") : null,
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
