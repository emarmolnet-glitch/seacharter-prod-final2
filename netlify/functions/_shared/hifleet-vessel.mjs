import { sanitizeVesselTechnicalRecord } from "../../../db/vessel-technical-normalizer.mjs";

const DEFAULT_TIMEOUT_MS = 12_000;
const CENSORED_VALUE_PATTERN = /\*{2,}/;

const FIELD_ALIASES = {
  imoNumber: ["imo", "imonumber", "imono", "imo_number"],
  mmsi: ["mmsi", "mmsinumber", "mmsi_number"],
  vesselName: ["vesselname", "shipname", "name", "vessel_name", "ship_name"],
  dwt: ["dwt", "deadweight", "deadweighttonnage", "dead_weight"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng", "long"],
  vesselType: ["vesseltype", "shiptype", "type", "vessel_type", "ship_type"],
  draftMeters: ["draft", "draught", "draftmeters", "draughtmeters", "draft_meters"],
  flag: ["flag", "flagcountry", "country", "flag_country"],
  callSign: ["callsign", "call_sign"],
  yearBuilt: ["yearbuilt", "buildyear", "built", "year_built"],
  grossTonnage: ["gt", "grosstonnage", "gross", "gross_tonnage"],
  netTonnage: ["nt", "nettonnage", "net_tonnage"],
  loaMeters: ["loa", "lengthoverall", "length", "loameters", "loa_meters"],
  beamMeters: ["beam", "breadth", "width", "beammeters", "beam_meters"],
  lastPort: ["lastport", "previousport", "last_port"],
  eta: ["eta", "estimatedtimeofarrival", "estimated_arrival"],
};

export class HifleetConfigurationError extends Error {}
export class HifleetUpstreamError extends Error {
  constructor(message, { status = 502, detail = message } = {}) {
    super(message);
    this.name = "HifleetUpstreamError";
    this.status = status;
    this.detail = detail;
  }
}

function serializeErrorDetail(value) {
  if (typeof value === "string") return value.trim() || "Unknown provider error";
  if (value === undefined || value === null) return "Unknown provider error";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractProviderError(error) {
  const status = Number(error?.response?.status ?? error?.status);
  const detail = error?.response?.data ?? error?.message;
  return {
    status: Number.isInteger(status) && status > 0 ? status : 502,
    detail: serializeErrorDetail(detail),
  };
}

async function readProviderResponseDetail(response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    return contentType.includes("application/json")
      ? serializeErrorDetail(await response.json())
      : serializeErrorDetail(await response.text());
  } catch {
    return response.statusText || "Unknown provider error";
  }
}

export function formatHifleetApiError(error) {
  const { status, detail } = error instanceof HifleetUpstreamError
    ? error
    : extractProviderError(error);
  return `HiFleet API Error [${status}]: ${serializeErrorDetail(detail)}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function indexedRecord(record) {
  const entries = new Map();
  for (const [key, value] of Object.entries(record)) entries.set(canonicalKey(key), value);
  return entries;
}

function readAliasedValue(record, aliases) {
  const entries = indexedRecord(record);
  for (const alias of aliases) {
    const value = entries.get(canonicalKey(alias));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function candidateScore(record, requestedImo) {
  const indexed = indexedRecord(record);
  let score = 0;
  for (const aliases of Object.values(FIELD_ALIASES)) {
    if (aliases.some((alias) => indexed.has(canonicalKey(alias)))) score += 1;
  }
  const candidateImo = String(readAliasedValue(record, FIELD_ALIASES.imoNumber) ?? "").replace(/\D/g, "");
  if (candidateImo === String(requestedImo)) score += 20;
  return score;
}

function findBestVesselObject(payload, requestedImo) {
  const candidates = [];
  const visit = (value, depth = 0) => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    candidates.push(value);
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  visit(payload);
  return candidates
    .map((record) => ({ record, score: candidateScore(record, requestedImo) }))
    .sort((left, right) => right.score - left.score)[0]?.record ?? null;
}

function hasCensoredMandatoryValue(record) {
  return [FIELD_ALIASES.dwt, FIELD_ALIASES.grossTonnage]
    .map((aliases) => readAliasedValue(record, aliases))
    .some((value) => typeof value === "string" && CENSORED_VALUE_PATTERN.test(value));
}

export function normalizeImo(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? Number(digits) : null;
}

export function normalizeHifleetPayload(payload, requestedImo) {
  const vesselObject = findBestVesselObject(payload, requestedImo);
  if (!vesselObject || candidateScore(vesselObject, requestedImo) < 2) {
    throw new HifleetUpstreamError("HiFleet returned no recognizable vessel record.");
  }
  if (hasCensoredMandatoryValue(vesselObject)) {
    throw new HifleetUpstreamError("HiFleet returned censored technical fields.");
  }

  const rawRecord = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, readAliasedValue(vesselObject, aliases)]),
  );
  rawRecord.imoNumber = normalizeImo(rawRecord.imoNumber) ?? requestedImo;
  const vessel = sanitizeVesselTechnicalRecord(rawRecord);
  if (vessel.imoNumber !== requestedImo) {
    throw new HifleetUpstreamError("HiFleet returned a different IMO number.");
  }
  return vessel;
}

function readCredentialHeaders(env) {
  const cookie = String(env.HIFLEET_COOKIE ?? "").trim();
  if (!cookie) throw new HifleetConfigurationError("HiFleet cookie is not configured.");
  return { Cookie: cookie };
}

function buildRequest(env, imoNumber) {
  const configuredUrl = String(env.HIFLEET_API_URL ?? "").trim();
  if (!configuredUrl) throw new HifleetConfigurationError("HiFleet endpoint is not configured.");

  const url = new URL(configuredUrl.replaceAll("{imo}", encodeURIComponent(String(imoNumber))));
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...readCredentialHeaders(env),
  };
  const options = {
    method: "POST",
    headers,
    body: JSON.stringify({
      limit: 1,
      offset: 1,
      params: {
        shipname: "",
        callsign: "",
        shiptype: "",
        shipflag: "",
        keyword: "",
        mmsi: -1,
        imo: Number(imoNumber),
      },
      _v: "5.3.588",
    }),
  };
  return { url, options };
}

export async function fetchHifleetVessel({ imoNumber, env, fetchImpl = fetch }) {
  const providerEnv = env ?? {
    HIFLEET_API_URL: process.env.HIFLEET_API_URL,
    HIFLEET_COOKIE: process.env.HIFLEET_COOKIE,
    HIFLEET_TIMEOUT_MS: process.env.HIFLEET_TIMEOUT_MS,
  };
  const { url, options } = buildRequest(providerEnv, imoNumber);
  const configuredTimeout = Number(providerEnv.HIFLEET_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, 30_000)
    : DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const providerError = extractProviderError(error);
    if (error?.name === "TimeoutError") {
      providerError.status = 504;
      providerError.detail = "HiFleet request timed out.";
    }
    throw new HifleetUpstreamError("HiFleet request failed.", providerError);
  }
  if (!response.ok) {
    const detail = await readProviderResponseDetail(response);
    throw new HifleetUpstreamError(`HiFleet returned HTTP ${response.status}.`, {
      status: response.status,
      detail,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HifleetUpstreamError("HiFleet returned an invalid JSON payload.", {
      status: response.status,
    });
  }
  const vesselRecord = isRecord(payload) && Array.isArray(payload.data)
    ? payload.data[0]
    : undefined;
  return normalizeHifleetPayload(vesselRecord, imoNumber);
}

export async function resolveVesselByImo({ imoNumber, findCached, fetchRemote, saveRecord }) {
  const cached = await findCached(imoNumber);
  if (cached) return { cache: "hit", vessel: cached };

  const remote = await fetchRemote(imoNumber);
  const saved = await saveRecord(remote);
  return { cache: "miss", vessel: saved };
}

export function serializeVesselRecord(record) {
  return {
    imo_number: record.imoNumber,
    mmsi: record.mmsi,
    vessel_name: record.vesselName,
    dwt: record.dwt,
    latitude: record.latitude,
    longitude: record.longitude,
    vessel_type: record.vesselType,
    draft_meters: record.draftMeters,
    flag: record.flag,
    call_sign: record.callSign,
    year_built: record.yearBuilt,
    gross_tonnage: record.grossTonnage,
    net_tonnage: record.netTonnage,
    loa_meters: record.loaMeters,
    beam_meters: record.beamMeters,
    last_port: record.lastPort,
    eta: record.eta,
  };
}
