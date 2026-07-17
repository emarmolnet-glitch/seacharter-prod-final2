type VesselMessage = Record<string, unknown>;

export const ALLOWED_AIS_TAXONOMIES = new Set([
  "category:cargo",
  "type:bulk",
  "type:general",
  "type:container",
  "type:cement",
  "type:mpv",
  "type:heavy_lift",
  "category:tanker",
  "type:crude_tanker",
  "type:lng_tanker",
  "type:chemical_tanker",
  "type:product_tanker",
  "type:lpg_tanker",
  "category:passenger",
  "type:passenger",
  "type:cruise",
  "type:ferry",
  "category:other",
  "type:offshore",
  "type:tug",
  "type:fishing",
]);

const TAXONOMY_TERMS: Record<string, string[]> = {
  "type:bulk": ["bulk carrier", "bulker", "handysize", "handymax", "supramax", "ultramax", "panamax", "capesize", "mini bulker", "dry bulk"],
  "type:general": ["general cargo", "general cargo vessel", "coaster", "coastal cargo", "cabotage"],
  "type:container": ["container ship", "container vessel", "feeder"],
  "type:cement": ["cement carrier", "cement", "cemento", "ciment", "clinker carrier", "clinker"],
  "type:mpv": ["multipurpose", "multi purpose", "mpp", "mmpp"],
  "type:heavy_lift": ["heavy lift", "project cargo"],
  "type:crude_tanker": ["crude oil tanker", "crude tanker", "oil tanker"],
  "type:lng_tanker": ["lng tanker", "lng carrier", "liquefied natural gas"],
  "type:chemical_tanker": ["chemical tanker", "chemical carrier"],
  "type:product_tanker": ["product tanker", "oil products tanker"],
  "type:lpg_tanker": ["lpg tanker", "lpg carrier", "liquefied petroleum gas"],
  "type:passenger": ["passenger ship", "passenger vessel"],
  "type:cruise": ["cruise ship", "cruise vessel"],
  "type:ferry": ["ferry", "ropax", "ro pax"],
  "type:offshore": ["offshore", "supply vessel", "platform supply"],
  "type:tug": ["tug", "tugboat", "support vessel", "towage"],
  "type:fishing": ["fishing", "trawler"],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseShipTypeCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const match = String(value || "").match(/\b(\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function getTaxonomySource(vessel: VesselMessage) {
  const metadata = asRecord(vessel.MetaData);
  const nestedMessage = asRecord(vessel.Message);
  const staticData = asRecord(vessel.ShipStaticData || nestedMessage.ShipStaticData);
  const values = [
    vessel.ShipType,
    vessel.shipType,
    vessel.type,
    vessel.Type,
    vessel.Tipo,
    vessel.tipo,
    vessel.cargoType,
    vessel.tipo_carga,
    vessel.vesselType,
    vessel.vesselClass,
    vessel.categoryLabel,
    vessel.radarCategory,
    metadata.ShipType,
    metadata.shipType,
    metadata.type,
    metadata.Tipo,
    metadata.tipo,
    metadata.cargoType,
    metadata.tipo_carga,
    metadata.vesselType,
    metadata.vesselClass,
    metadata.categoryLabel,
    staticData.Type,
  ];
  const text = normalizeText(values.filter(Boolean).join(" "));
  const code = values.map(parseShipTypeCode).find((value) => value !== null) ?? null;
  return { text, code };
}

function includesAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

export function parseRequestedTaxonomies(url: URL): string[] {
  const rawValues = url.searchParams.getAll("taxonomies");
  const candidates = rawValues.flatMap((rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) {}
    return value.split(",");
  });
  return Array.from(new Set(candidates.map((value) => value.trim()).filter((value) => ALLOWED_AIS_TAXONOMIES.has(value))));
}

export function matchesAisTaxonomy(vessel: VesselMessage, taxonomy: string): boolean {
  const { text, code } = getTaxonomySource(vessel);
  if (!text && code === null) return false;

  if (taxonomy === "category:cargo") {
    if (code !== null) return code >= 70 && code <= 79;
    return includesAnyTerm(text, ["cargo", "bulk", "container", "cement", "multipurpose", "mpp", "heavy lift", "freighter"]);
  }
  if (taxonomy === "category:tanker") {
    if (code !== null) return code >= 80 && code <= 89;
    return includesAnyTerm(text, ["tanker", "crude", "chemical", "oil products", "lng carrier", "lpg carrier"]);
  }
  if (taxonomy === "category:passenger") {
    if (code !== null) return code >= 60 && code <= 69;
    return includesAnyTerm(text, ["passenger", "cruise", "ferry", "ropax"]);
  }
  if (taxonomy === "category:other") {
    const knownCategoryCode = code !== null && ((code >= 60 && code <= 69) || (code >= 70 && code <= 89));
    return (!knownCategoryCode && includesAnyTerm(text, ["offshore", "tug", "support", "fishing", "trawler", "dredger", "pilot", "yacht", "sailing"]))
      || (code !== null && ((code >= 30 && code <= 59) || code < 30 || code > 89));
  }

  const terms = TAXONOMY_TERMS[taxonomy];
  if (!terms) return false;
  if (taxonomy === "type:passenger" && code !== null && code >= 60 && code <= 69) return true;
  if (taxonomy === "type:fishing" && code === 30) return true;
  if (taxonomy === "type:tug" && code !== null && code >= 31 && code <= 52) return includesAnyTerm(text, terms);
  return includesAnyTerm(text, terms);
}

export function filterVesselsByTaxonomies(vessels: VesselMessage[], taxonomies: string[]) {
  if (!Array.isArray(vessels) || taxonomies.length === 0) return [];
  return vessels.filter((vessel) => taxonomies.some((taxonomy) => matchesAisTaxonomy(vessel, taxonomy)));
}
