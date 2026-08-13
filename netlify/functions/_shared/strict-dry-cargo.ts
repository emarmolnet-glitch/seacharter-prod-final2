type AnyRecord = Record<string, unknown>;

const DRY_CARGO_TEXT = /\b(bulk carrier|bulker|general cargo|dry cargo)\b/i;
const EXCLUDED_TEXT = /\b(passenger|cruise|pleasure|yacht|tug|tanker|fishing|trawler|container|ferry|ropax|ro[- ]?pax|offshore|supply)\b/i;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
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
  const nestedVessel = asRecord(vessel.vessel);
  const nestedAis = asRecord(vessel.ais || vessel.AIS);
  const sourcePayload = asRecord(vessel.source_payload || vessel.sourcePayload);
  const sourceMetadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);
  const rawTypes = [
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
    nestedVessel.aisType,
    nestedVessel.ais_type,
    nestedVessel.vesselType,
    nestedVessel.vessel_type,
    nestedVessel.shipType,
    nestedVessel.ShipType,
    nestedAis.aisType,
    nestedAis.ais_type,
    nestedAis.vesselType,
    nestedAis.vessel_type,
    nestedAis.shipType,
    nestedAis.ShipType,
    sourcePayload.aisType,
    sourcePayload.ais_type,
    sourcePayload.vesselType,
    sourcePayload.vessel_type,
    sourcePayload.shipType,
    sourcePayload.ShipType,
    sourceMetadata.ShipType,
    sourceMetadata.shipType,
  ].filter((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
  const typeText = rawTypes.map((candidate) => String(candidate).trim()).join(" | ");
  const codeMatch = typeText.match(/(?:^|\D)(7\d)(?:\D|$)/);
  return {
    code: codeMatch ? Number(codeMatch[1]) : null,
    text: typeText,
  };
}

export function isStrictDryCargoVessel(value: unknown) {
  const { code, text } = readAisType(value);
  if (EXCLUDED_TEXT.test(text)) return false;
  if (code !== null) return code >= 70 && code <= 79;
  if (!text) return false;
  return DRY_CARGO_TEXT.test(text);
}

export function filterStrictDryCargoVessels<T>(values: T[]) {
  return values.filter(isStrictDryCargoVessel);
}
