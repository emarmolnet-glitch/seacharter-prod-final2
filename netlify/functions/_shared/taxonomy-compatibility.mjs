export const TaxonomyCompatibilityMatrix = Object.freeze({
  cement_powder: Object.freeze(["cement_carrier"]),
  clinker: Object.freeze(["bulk_carrier"]),
  fertilizers: Object.freeze(["bulk_carrier", "general_cargo"]),
  steel_bars_beams: Object.freeze(["general_cargo", "multipurpose_mpp", "bulk_carrier"]),
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

  if (/\b(clinker|clinquer)\b/.test(cargo)) return "clinker";
  if (/\b(fertilizantes?|fertilisers?|fertilizers?)\b/.test(cargo)) return "fertilizers";
  if (/\b(acero|steel|barras?|bars?|vigas?|beams?)\b/.test(cargo)) return "steel_bars_beams";
  if (/\b(cemento|cement)\b/.test(cargo)) return "cement_powder";

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

export function evaluateTaxonomyCompatibility(cargoSpecification, vessel) {
  const cargoTaxonomy = classifyCargoCompatibilityTaxonomy(cargoSpecification);
  const declaredVesselType = getAisVesselDeclaredTaxonomyType(vessel);
  const vesselTaxonomies = classifyAisVesselTaxonomyTypes(declaredVesselType);

  if (!cargoTaxonomy) {
    return {
      governed: false,
      compatible: true,
      cargoTaxonomy: null,
      declaredVesselType,
      vesselTaxonomies,
      allowedVesselTaxonomies: [],
    };
  }

  const allowedVesselTaxonomies = [...TaxonomyCompatibilityMatrix[cargoTaxonomy]];
  return {
    governed: true,
    compatible: vesselTaxonomies.some((taxonomy) => allowedVesselTaxonomies.includes(taxonomy)),
    cargoTaxonomy,
    declaredVesselType,
    vesselTaxonomies,
    allowedVesselTaxonomies,
  };
}

export function calculateTaxonomyTechnicalScore(cargoSpecification, vessel, calculatedTechnicalScore) {
  const compatibility = evaluateTaxonomyCompatibility(cargoSpecification, vessel);
  return {
    compatibility,
    technicalScore: compatibility.compatible ? calculatedTechnicalScore : 0,
  };
}
