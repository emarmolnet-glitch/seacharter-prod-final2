export const fieldMappings = Object.freeze({
  "imo": "imo_number",
  "imo number": "imo_number",
  "vessel name": "vessel_name",
  "ship name": "vessel_name",
  "vessel": "vessel_name",
  "ship": "vessel_name",
  "name": "vessel_name",
  "flag": "flag",
  "country": "flag",
  "vessel type": "vessel_type",
  "ship type": "vessel_type",
  "type": "vessel_type",
  "class": "vessel_type",
  "length": "loa_meters",
  "length overall": "loa_meters",
  "length overall loa": "loa_meters",
  "loa": "loa_meters",
  "beam": "beam_meters",
  "breadth": "beam_meters",
  "gt": "gross_tonnage",
  "gross tonnage": "gross_tonnage",
  "nt": "net_tonnage",
  "net tonnage": "net_tonnage",
  "dwt": "dwt",
  "deadweight": "dwt",
  "year of built": "year_built",
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
  return fieldMappings[normalizedKey] || null;
}
