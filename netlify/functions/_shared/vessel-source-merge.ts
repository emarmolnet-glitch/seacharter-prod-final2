type AnyRecord = Record<string, unknown>;

export type VesselSourceOrigin = "MASTER" | "DATABRIDGE" | "AIS_LIVE";

const DWT_BUCKET_SIZE = 2500;
const EMPTY_MARKERS = new Set(["", "0", "n/a", "na", "unknown", "pending", "null", "undefined"]);

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function isMeaningful(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return !EMPTY_MARKERS.has(value.trim().toLowerCase());
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function validImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : "";
}

function normalizeVesselName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(m\/?v|m\/?s|s\/?s)\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dwtRange(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "unknown";
  const lower = Math.floor(numeric / DWT_BUCKET_SIZE) * DWT_BUCKET_SIZE;
  return `${lower}-${lower + DWT_BUCKET_SIZE - 1}`;
}

function vesselIdentityParts(value: unknown) {
  const record = asRecord(value);
  const vessel = asRecord(record.vessel);
  const ais = asRecord(record.ais);
  const metadata = asRecord(record.MetaData || record.metadata);
  const imo = validImo(firstValue(
    record.imo,
    record.IMO,
    record.imoNumber,
    record.imo_number,
    vessel.imo,
    vessel.IMO,
    ais.imo,
    ais.IMO,
    metadata.IMO,
  ));
  const name = normalizeVesselName(firstValue(
    record.vesselName,
    record.vessel_name,
    record.ShipName,
    record.name,
    vessel.vesselName,
    vessel.vessel_name,
    vessel.ShipName,
    ais.vesselName,
    ais.vessel_name,
    metadata.ShipName,
  ));
  const dwt = firstValue(record.dwt, record.DWT, vessel.dwt, vessel.DWT, ais.dwt, ais.DWT, metadata.DWT);
  return { imo, name, dwt };
}

export function getVesselKey(value: unknown) {
  const { imo, name, dwt } = vesselIdentityParts(value);
  if (imo) return `imo-${imo}`;
  return `name-dwt-${name || "unknown"}-${dwtRange(dwt)}`;
}

export function getVesselFallbackKey(value: unknown) {
  const { name, dwt } = vesselIdentityParts(value);
  return `name-dwt-${name || "unknown"}-${dwtRange(dwt)}`;
}

function mergeMeaningful(baseValue: unknown, incomingValue: unknown): unknown {
  const base = asRecord(baseValue);
  const incoming = asRecord(incomingValue);
  const merged: AnyRecord = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (!isMeaningful(value)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[key] = mergeMeaningful(merged[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function readOrigins(value: unknown): VesselSourceOrigin[] {
  const record = asRecord(value);
  const rawOrigins = Array.isArray(record.source_origins)
    ? record.source_origins
    : Array.isArray(record.sourceOrigins)
      ? record.sourceOrigins
      : [];
  return rawOrigins.filter((origin): origin is VesselSourceOrigin => (
    origin === "MASTER" || origin === "DATABRIDGE" || origin === "AIS_LIVE"
  ));
}

function applyOrigins(value: unknown, origins: VesselSourceOrigin[]) {
  const record = asRecord(value);
  const uniqueOrigins = [...new Set(origins)];
  const sourceLabel = uniqueOrigins.join(" + ");
  const vesselKey = getVesselKey(record);
  return {
    ...record,
    vessel_key: vesselKey,
    vesselKey,
    source_origins: uniqueOrigins,
    sourceOrigins: uniqueOrigins,
    source_origin: sourceLabel,
    sourceOrigin: sourceLabel,
    data_source: sourceLabel,
  };
}

const AIS_LIVE_FIELDS = [
  "latitude", "longitude", "lat", "lon", "lng",
  "speed", "sog", "SOG", "speed_over_ground", "speedOverGround",
  "heading", "trueHeading", "TrueHeading", "course", "cog", "COG",
  "timestamp", "lastSeen", "lastSeenAt", "updatedAt",
  "destination", "Destination", "current_destination",
];

function mergeAisLive(baseValue: unknown, aisValue: unknown) {
  const base = asRecord(baseValue);
  const ais = asRecord(aisValue);
  const merged = asRecord(mergeMeaningful(ais, base));
  for (const field of AIS_LIVE_FIELDS) {
    if (isMeaningful(ais[field])) merged[field] = ais[field];
  }
  merged.ais = mergeMeaningful(base.ais, ais.ais || ais);
  if (base.vessel || ais.vessel) {
    merged.vessel = mergeMeaningful(base.vessel, ais.vessel);
  }
  return merged;
}

export function mergeTripleVesselSources(
  masterRows: unknown[] = [],
  dataBridgeRows: unknown[] = [],
  aisRows: unknown[] = [],
) {
  const mergedByKey = new Map<string, AnyRecord>();
  const keyAliases = new Map<string, string>();

  const mergeList = (rows: unknown[], origin: VesselSourceOrigin) => {
    rows.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const primaryKey = getVesselKey(row);
      const fallbackKey = getVesselFallbackKey(row);
      let canonicalKey = keyAliases.get(primaryKey) || keyAliases.get(fallbackKey) || primaryKey;
      let existing = mergedByKey.get(canonicalKey);
      if (primaryKey.startsWith("imo-") && canonicalKey !== primaryKey && existing) {
        mergedByKey.delete(canonicalKey);
        canonicalKey = primaryKey;
        mergedByKey.set(canonicalKey, existing);
      }
      const existingOrigins = readOrigins(existing);
      const incomingOrigins = readOrigins(row);
      const origins = [...existingOrigins, ...incomingOrigins, origin];
      const merged = !existing
        ? asRecord(mergeMeaningful({}, row))
        : origin === "AIS_LIVE"
          ? mergeAisLive(existing, row)
          : asRecord(mergeMeaningful(existing, row));
      const tagged = applyOrigins(merged, origins);
      mergedByKey.set(canonicalKey, tagged);
      keyAliases.set(primaryKey, canonicalKey);
      keyAliases.set(fallbackKey, canonicalKey);
      keyAliases.set(getVesselKey(tagged), canonicalKey);
      keyAliases.set(getVesselFallbackKey(tagged), canonicalKey);
    });
  };

  mergeList(masterRows, "MASTER");
  mergeList(dataBridgeRows, "DATABRIDGE");
  mergeList(aisRows, "AIS_LIVE");

  return Array.from(mergedByKey.values());
}
