export const vesselFieldDictionary = Object.freeze({
  "imo": "imo_number",
  "imo number": "imo_number",
  "vessel name": "vessel_name",
  "ship name": "vessel_name",
  "vessel": "vessel_name",
  "ship": "vessel_name",
  "name": "vessel_name",
  "flag": "flag",
  "bandera": "flag",
  "country": "flag",
  "call sign": "call_sign",
  "callsign": "call_sign",
  "indicativo": "call_sign",
  "vessel type": "vessel_type",
  "tipo de buque": "vessel_type",
  "ship type": "vessel_type",
  "type": "vessel_type",
  "class": "vessel_type",
  "length": "loa_meters",
  "length overall": "loa_meters",
  "length overall loa": "loa_meters",
  "loa": "loa_meters",
  "beam": "beam_meters",
  "manga": "beam_meters",
  "breadth": "beam_meters",
  "gt": "gross_tonnage",
  "gross tonnage": "gross_tonnage",
  "nt": "net_tonnage",
  "net tonnage": "net_tonnage",
  "dwt": "dwt",
  "deadweight": "dwt",
  "year of built": "year_built",
  "año de construcción": "year_built",
  "year of build": "year_built",
  "year built": "year_built",
  "built year": "year_built",
  "built": "year_built",
  "year": "year_built",
  "build year": "year_built",
  "last port": "last_port",
  "last port of call": "last_port",
  "eta": "eta",
  "estimated time of arrival": "eta",
});

export const fieldMappings = vesselFieldDictionary;

const DECIMAL_FIELDS = new Set([
  "dwt",
  "gross_tonnage",
  "net_tonnage",
  "loa_meters",
  "beam_meters",
]);

export function normalizeVesselFieldKey(rawKey) {
  return String(rawKey ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\b(?:m|mt|t|meters?|metres?|tons?|tonnes?)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[:#-]\s*$/g, "")
    .trim();
}

export function mappedVesselField(rawKey) {
  const normalizedKey = normalizeVesselFieldKey(rawKey);
  return vesselFieldDictionary[normalizedKey] || null;
}

function parseDecimalValue(rawValue) {
  const compact = String(rawValue ?? "").replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
  if (!compact) return null;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;

  if (lastComma >= 0 && lastDot < 0 && /^-?\d{1,3}(?:,\d{3})+$/.test(compact)) {
    normalized = compact.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = compact.replace(/,/g, "");
  } else {
    normalized = compact.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseVesselAttribute(rawLabel, rawValue) {
  if (!rawLabel || rawValue === null || rawValue === undefined || String(rawValue).trim() === "") return null;

  const column = mappedVesselField(rawLabel);
  if (!column) return null;

  if (DECIMAL_FIELDS.has(column)) {
    return { column, value: parseDecimalValue(rawValue) };
  }

  if (column === "year_built") {
    const yearMatch = String(rawValue).match(/\b(18|19|20)\d{2}\b/);
    return { column, value: yearMatch ? Number.parseInt(yearMatch[0], 10) : null };
  }

  if (column === "imo_number") {
    const digits = String(rawValue).replace(/\D/g, "");
    return { column, value: digits.length >= 7 ? digits.slice(-7) : null };
  }

  const value = String(rawValue).replace(/\s+/g, " ").trim();
  return { column, value: value || null };
}
