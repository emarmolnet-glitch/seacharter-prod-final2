import { toIsoAlpha2Flag } from "./flag-country-codes.mjs";

function nullableText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text || null;
}

function nullableNumber(value) {
  const text = nullableText(value);
  if (!text) return null;

  const compact = text.replace(/\s/g, "").replace(/[^0-9.,-]/g, "");
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

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function nullablePositiveNumber(value) {
  const number = nullableNumber(value);
  return number !== null && number > 0 ? number : null;
}

function nullableInteger(value) {
  const number = nullableNumber(value);
  return number === null ? null : Math.trunc(number);
}

function nullableCoordinate(value, minimum, maximum) {
  const number = nullableNumber(value);
  return number !== null && number >= minimum && number <= maximum ? number : null;
}

export function normalizeEta(value, referenceDate = new Date()) {
  const text = nullableText(value);
  if (!text) return null;

  const explicitTimestamp = Date.parse(text);
  if (/\b\d{4}\b/.test(text) && Number.isFinite(explicitTimestamp)) {
    return new Date(explicitTimestamp).toISOString();
  }

  const vesselFinderEta = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})$/);
  if (!vesselFinderEta) return null;

  const [, month, day, hour, minute] = vesselFinderEta;
  const currentYear = referenceDate.getUTCFullYear();
  let timestamp = Date.parse(`${month} ${day}, ${currentYear} ${hour}:${minute}:00 UTC`);
  if (!Number.isFinite(timestamp)) return null;

  const thirtyDaysAgo = referenceDate.getTime() - (30 * 24 * 60 * 60 * 1000);
  if (timestamp < thirtyDaysAgo) {
    timestamp = Date.parse(`${month} ${day}, ${currentYear + 1} ${hour}:${minute}:00 UTC`);
  }

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function sanitizeVesselTechnicalRecord(record = {}) {
  const yearBuilt = nullableInteger(record.yearBuilt);
  const dwt = nullablePositiveNumber(record.dwt);
  return {
    imoNumber: nullableInteger(record.imoNumber),
    mmsi: nullableText(record.mmsi),
    vesselName: nullableText(record.vesselName),
    dwt: dwt === null ? null : Math.trunc(dwt),
    latitude: nullableCoordinate(record.latitude, -90, 90),
    longitude: nullableCoordinate(record.longitude, -180, 180),
    vesselType: nullableText(record.vesselType),
    draftMeters: nullablePositiveNumber(record.draftMeters),
    flag: toIsoAlpha2Flag(record.flag),
    callSign: nullableText(record.callSign),
    yearBuilt: yearBuilt !== null && yearBuilt >= 1800 && yearBuilt <= 2100 ? yearBuilt : null,
    grossTonnage: nullablePositiveNumber(record.grossTonnage),
    netTonnage: nullablePositiveNumber(record.netTonnage),
    loaMeters: nullablePositiveNumber(record.loaMeters),
    beamMeters: nullablePositiveNumber(record.beamMeters),
    lastPort: nullableText(record.lastPort),
    eta: normalizeEta(record.eta),
  };
}

export function prepareVesselTechnicalPersistence(record = {}) {
  const vessel = sanitizeVesselTechnicalRecord(record);
  return {
    vessel,
    parameters: [
      vessel.imoNumber,
      vessel.mmsi,
      vessel.vesselName,
      vessel.dwt,
      vessel.latitude,
      vessel.longitude,
      vessel.vesselType,
      vessel.draftMeters,
      vessel.flag,
      vessel.callSign,
      vessel.yearBuilt,
      vessel.grossTonnage,
      vessel.netTonnage,
      vessel.loaMeters,
      vessel.beamMeters,
      vessel.lastPort,
      vessel.eta,
    ],
  };
}
