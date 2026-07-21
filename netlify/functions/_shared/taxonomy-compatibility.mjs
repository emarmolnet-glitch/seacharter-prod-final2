export const TaxonomyCompatibilityMatrix = Object.freeze({
  cement_powder: Object.freeze(["cement_carrier", "self_discharger"]),
  clinker: Object.freeze(["bulk_carrier"]),
  fertilizers: Object.freeze(["bulk_carrier", "general_cargo"]),
  steel_bars_beams: Object.freeze(["general_cargo", "multipurpose_mpp", "bulk_carrier"]),
});

const CargoTaxonomyLabels = Object.freeze({
  cement_powder: "Cemento en polvo",
  clinker: "Clínker",
  fertilizers: "Fertilizantes",
  steel_bars_beams: "Barras y vigas de acero",
});

const VesselTaxonomyLabels = Object.freeze({
  cement_carrier: "Cement Carrier",
  self_discharger: "Self-Discharger",
  bulk_carrier: "Bulk Carrier",
  general_cargo: "General Cargo",
  multipurpose_mpp: "Multipurpose/MPP",
});

function textValue(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeTaxonomyText(value) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function classifyCargoCompatibilityTaxonomy(value) {
  const cargo = normalizeTaxonomyText(value);
  if (!cargo) return null;

  const hasClinker = /\b(clinker|clinquer)\b/.test(cargo);
  const hasCement = /\b(cemento|cement)\b/.test(cargo);
  if (hasClinker && !hasCement) return "clinker";
  if (/\b(fertilizantes?|fertilisers?|fertilizers?)\b/.test(cargo)) return "fertilizers";
  if (/\b(acero|steel)\b/.test(cargo) && /\b(barras?|bars?|vigas?|beams?)\b/.test(cargo)) return "steel_bars_beams";
  if (hasCement && !hasClinker && /\b(polvo|powder|bulk|granel)\b/.test(cargo)) return "cement_powder";

  return null;
}

export function getAisVesselDeclaredTaxonomyType(vessel) {
  const source = vessel && typeof vessel === "object" && !Array.isArray(vessel) ? vessel : {};
  const metaValue = source.MetaData;
  const meta = metaValue && typeof metaValue === "object" && !Array.isArray(metaValue) ? metaValue : {};
  const declaredType = [
    source.ship_type,
    source.vessel_type,
    source.shipType,
    source.ShipType,
    source.vesselType,
    meta.ship_type,
    meta.vessel_type,
    meta.shipType,
    meta.ShipType,
    meta.vesselType,
    source.type,
    meta.type,
  ].find((value) => textValue(value));

  return declaredType === undefined ? "Unknown" : textValue(declaredType);
}

export function classifyAisVesselTaxonomyTypes(value) {
  const vesselType = normalizeTaxonomyText(value);
  if (!vesselType) return [];

  const types = new Set();
  if (/\b(cement carrier|cementero)\b/.test(vesselType)) types.add("cement_carrier");
  if (/\b(bulk carrier|bulker|dry bulk|handysize|handymax|supramax|ultramax|panamax|capesize)\b/.test(vesselType)) types.add("bulk_carrier");
  if (/\b(general cargo|coaster)\b/.test(vesselType)) types.add("general_cargo");
  if (/\b(multi purpose|multipurpose|mpp|mpv)\b/.test(vesselType)) types.add("multipurpose_mpp");

  return Array.from(types);
}

function classifyAisVesselCapabilityTaxonomies(vessel) {
  const source = vessel && typeof vessel === "object" && !Array.isArray(vessel) ? vessel : {};
  const metaValue = source.MetaData;
  const meta = metaValue && typeof metaValue === "object" && !Array.isArray(metaValue) ? metaValue : {};
  const evidence = normalizeTaxonomyText([
    source.ship_type,
    source.vessel_type,
    source.shipType,
    source.ShipType,
    source.vesselType,
    source.equipment,
    source.dischargeSystem,
    source.discharge_system,
    source.cargoGear,
    source.cargo_gear,
    meta.ship_type,
    meta.vessel_type,
    meta.shipType,
    meta.ShipType,
    meta.vesselType,
    meta.equipment,
    meta.dischargeSystem,
    meta.discharge_system,
  ].filter(Boolean).join(" "));
  const types = new Set();
  if (/\b(self discharger|self unloading|self unloader)\b/.test(evidence)) types.add("self_discharger");
  return Array.from(types);
}

function buildRequiredVesselDescription(allowedVesselTaxonomies) {
  return allowedVesselTaxonomies
    .map((taxonomy) => VesselTaxonomyLabels[taxonomy] || taxonomy)
    .join(" o ");
}

export function evaluateTaxonomyCompatibility(cargoDescription, vessel) {
  const cargoTaxonomy = classifyCargoCompatibilityTaxonomy(cargoDescription);
  const declaredVesselType = getAisVesselDeclaredTaxonomyType(vessel);
  const vesselTaxonomies = Array.from(new Set([
    ...classifyAisVesselTaxonomyTypes(declaredVesselType),
    ...classifyAisVesselCapabilityTaxonomies(vessel),
  ]));

  if (!cargoTaxonomy) {
    return {
      governed: false,
      compatible: true,
      cargoTaxonomy: null,
      declaredVesselType,
      vesselTaxonomies,
      allowedVesselTaxonomies: [],
      cargoDescription: textValue(cargoDescription),
      requiredVesselDescription: "",
      reason: "La descripción no activa una regla taxonómica estricta; se aplica la elegibilidad general por código de mercancía",
    };
  }

  const allowedVesselTaxonomies = [...TaxonomyCompatibilityMatrix[cargoTaxonomy]];
  const compatible = vesselTaxonomies.some((taxonomy) => allowedVesselTaxonomies.includes(taxonomy));
  const normalizedCargoDescription = CargoTaxonomyLabels[cargoTaxonomy] || textValue(cargoDescription);
  const requiredVesselDescription = buildRequiredVesselDescription(allowedVesselTaxonomies);
  return {
    governed: true,
    compatible,
    cargoTaxonomy,
    declaredVesselType,
    vesselTaxonomies,
    allowedVesselTaxonomies,
    cargoDescription: normalizedCargoDescription,
    requiredVesselDescription,
    reason: compatible
      ? `Compatibilidad taxonómica confirmada: ${normalizedCargoDescription}`
      : `Incompatibilidad taxonómica: ${normalizedCargoDescription} requiere ${requiredVesselDescription}`,
  };
}

export function calculateTaxonomyTechnicalScore(cargoDescription, vessel, calculatedTechnicalScore) {
  const compatibility = evaluateTaxonomyCompatibility(cargoDescription, vessel);
  return {
    compatibility,
    technicalScore: compatibility.compatible ? calculatedTechnicalScore : 0,
  };
}
