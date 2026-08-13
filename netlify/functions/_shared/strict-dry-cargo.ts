type AnyRecord = Record<string, unknown>;

const DRY_CARGO_TEXT = /\b(bulk carrier|bulker|general cargo|dry cargo|cement carrier|clinker carrier|multipurpose|multi purpose|mpp)\b/i;
const EXCLUDED_TEXT = /\b(passenger|cruise|pleasure|yacht|tug|tanker|fishing|trawler|container|ferry|ropax|ro[- ]?pax|offshore|supply)\b/i;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

export function validImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : "";
}

export function readAisType(value: unknown) {
  const vessel = asRecord(value);
  const metadata = asRecord(vessel.MetaData || vessel.metadata);
  const message = asRecord(vessel.Message);
  const staticData = asRecord(vessel.ShipStaticData || message.ShipStaticData);
  const rawType = firstValue(
    vessel.aisType,
    vessel.ais_type,
    vessel.vesselType,
    vessel.vessel_type,
    vessel.shipType,
    vessel.ShipType,
    vessel.type,
    metadata.ShipType,
    metadata.shipType,
    staticData.Type,
  );
  const typeText = String(rawType ?? "").trim();
  const codeMatch = typeText.match(/(?:^|\D)(7\d)(?:\D|$)/);
  return {
    code: codeMatch ? Number(codeMatch[1]) : null,
    text: typeText,
  };
}

export function isStrictDryCargoVessel(value: unknown) {
  const { code, text } = readAisType(value);
  if (code !== null) return code >= 70 && code <= 79;
  if (!text || EXCLUDED_TEXT.test(text)) return false;
  return DRY_CARGO_TEXT.test(text);
}

export function filterStrictDryCargoVessels<T>(values: T[]) {
  return values.filter(isStrictDryCargoVessel);
}
