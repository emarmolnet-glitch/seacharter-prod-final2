import WebSocket from "ws";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_AISSTREAM_SNAPSHOT_MS = 7000;
const MAX_AISSTREAM_SNAPSHOT_MS = 15000;
const OPENSHIPS_BOX_PATH = "/box";
const OPENSHIPS_DOCUMENTED_POSITION_PATH = "/external/vessels/position/box";
const OPENSHIPS_DEFAULT_API_URL = "https://api.openships.de/v1";
const AIS_MACRO_TYPE_CODES = Object.freeze({
  CARGO: Object.freeze([70, 71, 72, 73, 74, 75, 76, 77, 78, 79]),
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstValue(record, paths) {
  for (const path of paths) {
    let value = record;
    for (const key of path) value = asRecord(value)[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function extractProviderRows(payload) {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  return [record.vessels, record.ships, record.results, record.data, record.items, record.features]
    .find(Array.isArray) || [];
}

function createOpenShipsUrl(endpoint, bounds, limit, aisTypes = [], resourcePath = OPENSHIPS_BOX_PATH) {
  const url = new URL(endpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  const knownPaths = [OPENSHIPS_BOX_PATH, OPENSHIPS_DOCUMENTED_POSITION_PATH];
  const cleanBasePath = knownPaths.reduce(
    (currentPath, knownPath) => currentPath.endsWith(knownPath) ? currentPath.slice(0, -knownPath.length) : currentPath,
    basePath,
  );
  url.pathname = `${cleanBasePath}${resourcePath}`;
  ["box", "bbox", "minLat", "maxLat", "minLon", "maxLon"].forEach(key => url.searchParams.delete(key));
  url.searchParams.set("minLat", String(bounds.minLat));
  url.searchParams.set("minLon", String(bounds.minLon));
  url.searchParams.set("maxLat", String(bounds.maxLat));
  url.searchParams.set("maxLon", String(bounds.maxLon));
  url.searchParams.set("limit", String(limit));
  url.searchParams.delete("filterAisTypes");
  aisTypes.forEach(aisType => url.searchParams.append("filterAisTypes", String(aisType)));
  return url;
}

function aisStreamType(value) {
  const numeric = finiteNumber(value);
  if (numeric === null) return value;
  const code = Math.trunc(numeric);
  if (code >= 60 && code <= 69) return `Passenger Ship (${code})`;
  if (code >= 70 && code <= 79) return `Cargo Ship (${code})`;
  if (code >= 80 && code <= 89) return `Tanker (${code})`;
  if (code === 30) return `Fishing Vessel (${code})`;
  if (code >= 31 && code <= 32) return `Tug (${code})`;
  return String(code);
}

export function normalizeLiveAisVessel(value) {
  const source = asRecord(value);
  const properties = asRecord(source.properties);
  const record = Object.keys(properties).length > 0 ? { ...source, ...properties } : source;
  const geometry = asRecord(source.geometry);
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const metadata = asRecord(record.MetaData || record.metadata);
  const message = asRecord(record.Message);
  const position = asRecord(record.PositionReport || message.PositionReport || record.position);
  const staticData = asRecord(record.ShipStaticData || message.ShipStaticData);
  const lat = finiteNumber(firstValue(record, [
    ["lat"], ["latitude"], ["Latitude"], ["AIS_Live_Lat"],
    ["PositionReport", "Latitude"], ["Message", "PositionReport", "Latitude"],
    ["position", "lat"], ["position", "latitude"], ["MetaData", "latitude"],
  ]) ?? coordinates[1]);
  const lon = finiteNumber(firstValue(record, [
    ["lon"], ["lng"], ["longitude"], ["Longitude"], ["AIS_Live_Lon"],
    ["PositionReport", "Longitude"], ["Message", "PositionReport", "Longitude"],
    ["position", "lon"], ["position", "longitude"], ["MetaData", "longitude"],
  ]) ?? coordinates[0]);
  const vesselType = aisStreamType(firstValue(record, [
    ["vessel_type"], ["vesselType"], ["ship_type"], ["shipType"], ["ShipType"], ["type"],
    ["MetaData", "ShipType"], ["ShipStaticData", "Type"], ["Message", "ShipStaticData", "Type"],
  ]));

  return {
    mmsi: digits(firstValue(record, [
      ["mmsi"], ["MMSI"], ["MetaData", "MMSI"], ["PositionReport", "UserID"],
      ["Message", "PositionReport", "UserID"], ["ShipStaticData", "UserID"],
    ])) || null,
    imo: digits(firstValue(record, [
      ["imo"], ["IMO"], ["imo_number"], ["imoNumber"], ["MetaData", "IMO"],
      ["ShipStaticData", "ImoNumber"], ["Message", "ShipStaticData", "ImoNumber"],
    ])) || null,
    vessel_name: String(firstValue(record, [
      ["vessel_name"], ["vesselName"], ["name"], ["ShipName"], ["MetaData", "ShipName"],
      ["ShipStaticData", "Name"], ["Message", "ShipStaticData", "Name"],
    ]) || "Unknown vessel").trim(),
    lat,
    lon,
    speed_sog: finiteNumber(firstValue(record, [
      ["speed_sog"], ["speedOverGround"], ["speed_over_ground"], ["speed"], ["sog"], ["SOG"],
      ["PositionReport", "Sog"], ["Message", "PositionReport", "Sog"],
    ])),
    dwt: finiteNumber(firstValue(record, [
      ["dwt"], ["DWT"], ["deadweight"], ["deadweightTonnage"],
      ["MetaData", "DWT"], ["metadata", "dwt"],
    ])),
    nav_status: firstValue(record, [
      ["nav_status"], ["navigationalStatus"], ["navigationStatus"], ["NavigationalStatus"], ["status"],
      ["PositionReport", "NavigationalStatus"], ["Message", "PositionReport", "NavigationalStatus"],
    ]),
    vessel_type: vesselType === null || vesselType === undefined ? null : String(vesselType).trim(),
  };
}

export function isVesselInsideBounds(vessel, bounds) {
  return vessel.lat !== null && vessel.lon !== null
    && vessel.lat >= bounds.minLat && vessel.lat <= bounds.maxLat
    && vessel.lon >= bounds.minLon && vessel.lon <= bounds.maxLon;
}

export function mapAisMacroCategoryToTypes(value) {
  const macroCategory = String(value || "CARGO").trim().toUpperCase();
  return [...(AIS_MACRO_TYPE_CODES[macroCategory] || AIS_MACRO_TYPE_CODES.CARGO)];
}

export function isAisMacroCompatibleVessel(vessel, macroCategory) {
  const normalizedMacro = String(macroCategory || "CARGO").trim().toUpperCase();
  if (normalizedMacro !== "CARGO") return true;
  const vesselType = normalizeText(vessel?.vessel_type);
  if (!vesselType) return false;
  const excludedType = /passenger|cruise|pleasure|yacht|tug|tanker|fishing|trawler|container|ferry|ropax|ro pax|offshore|supply/.test(vesselType);
  if (excludedType) return false;
  const codeMatch = vesselType.match(/\b(\d{2})\b/);
  if (codeMatch) {
    const aisTypeCode = Number(codeMatch[1]);
    return aisTypeCode >= 70 && aisTypeCode <= 79;
  }
  return /bulk carrier|bulker|general cargo|dry cargo|cement carrier|clinker carrier|multipurpose|multi purpose|mpp/.test(vesselType);
}

function deduplicateVessels(vessels, limit) {
  const unique = new Map();
  for (const vessel of vessels) {
    if (!vessel || vessel.lat === null || vessel.lon === null) continue;
    const key = vessel.mmsi || vessel.imo || `${vessel.vessel_name}:${vessel.lat}:${vessel.lon}`;
    unique.set(key, vessel);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

async function readResponseMessage(response) {
  try {
    const payload = await response.json();
    return String(payload?.message || payload?.error || `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function fetchOpenShipsBoundingBox({ bounds, limit = DEFAULT_LIMIT, aisTypes = [], env = process.env, fetchImpl = fetch }) {
  const endpoint = String(env.OPENSHIPS_API_URL || OPENSHIPS_DEFAULT_API_URL).trim();
  const normalizedLimit = Math.trunc(clamp(Number(limit) || DEFAULT_LIMIT, 1, MAX_LIMIT));
  const normalizedAisTypes = Array.from(new Set((Array.isArray(aisTypes) ? aisTypes : [])
    .map(value => Math.trunc(Number(value)))
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 99)));
  const primaryUrl = createOpenShipsUrl(endpoint, bounds, normalizedLimit, normalizedAisTypes);
  const apiKey = String(env.OPENSHIPS_API_KEY || env.OPENSHIPS_API_TOKEN || "").trim();
  const headers = { Accept: "application/json" };
  const keyQueryParam = String(env.OPENSHIPS_API_KEY_QUERY_PARAM || "").trim();
  if (apiKey && keyQueryParam) primaryUrl.searchParams.set(keyQueryParam, apiKey);
  else if (apiKey) {
    const headerName = String(env.OPENSHIPS_API_KEY_HEADER || "Authorization").trim();
    const prefix = env.OPENSHIPS_API_KEY_PREFIX === undefined ? "Bearer " : String(env.OPENSHIPS_API_KEY_PREFIX);
    headers[headerName] = `${prefix}${apiKey}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), clamp(Number(env.LIVE_AIS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 1000, 30000));
  try {
    let response = await fetchImpl(primaryUrl, { method: "GET", headers, signal: controller.signal, cache: "no-store" });
    if (response.status === 404 && String(env.OPENSHIPS_DISABLE_DOCUMENTED_FALLBACK || "").toLowerCase() !== "true") {
      const fallbackUrl = createOpenShipsUrl(endpoint, bounds, normalizedLimit, normalizedAisTypes, OPENSHIPS_DOCUMENTED_POSITION_PATH);
      if (apiKey && keyQueryParam) fallbackUrl.searchParams.set(keyQueryParam, apiKey);
      response = await fetchImpl(fallbackUrl, { method: "GET", headers, signal: controller.signal, cache: "no-store" });
    }
    if (!response.ok) throw Object.assign(new Error(await readResponseMessage(response)), { code: "OPENSHIPS_HTTP_ERROR", status: response.status });
    const payload = await response.json();
    return extractProviderRows(payload).map(normalizeLiveAisVessel);
  } finally {
    clearTimeout(timer);
  }
}

function mergeAisStreamMessage(target, payload) {
  const metadata = asRecord(payload.MetaData);
  const message = asRecord(payload.Message);
  const position = asRecord(
    message.PositionReport
    || message.StandardClassBPositionReport
    || message.ExtendedClassBPositionReport,
  );
  const staticData = asRecord(message.ShipStaticData);
  return {
    ...target,
    MetaData: { ...asRecord(target.MetaData), ...metadata },
    PositionReport: { ...asRecord(target.PositionReport), ...position },
    ShipStaticData: { ...asRecord(target.ShipStaticData), ...staticData },
  };
}

export async function fetchAisStreamBoundingBox({ bounds, limit = DEFAULT_LIMIT, aisTypes = [], env = process.env, WebSocketImpl = WebSocket }) {
  const apiKey = String(env.AISSTREAM_API_KEY || env.AISTREAM_API_KEY || "").trim();
  if (!apiKey) throw Object.assign(new Error("AISStream is not configured"), { code: "AISSTREAM_NOT_CONFIGURED" });
  const endpoint = String(env.AISSTREAM_WS_URL || "wss://stream.aisstream.io/v0/stream").trim();
  const snapshotMs = clamp(Number(env.AISSTREAM_SNAPSHOT_MS) || DEFAULT_AISSTREAM_SNAPSHOT_MS, 1000, MAX_AISSTREAM_SNAPSHOT_MS);
  const normalizedLimit = Math.trunc(clamp(Number(limit) || DEFAULT_LIMIT, 1, MAX_LIMIT));
  const allowedAisTypes = new Set((Array.isArray(aisTypes) ? aisTypes : [])
    .map(value => Math.trunc(Number(value)))
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 99));
  const vesselsByMmsi = new Map();

  return await new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(endpoint);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      if (error) reject(error);
      else resolve(Array.from(vesselsByMmsi.values()).map(normalizeLiveAisVessel));
    };
    const timer = setTimeout(() => finish(), snapshotMs);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]]],
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport", "ShipStaticData"],
      }));
    });
    socket.on("message", data => {
      try {
        const payload = JSON.parse(String(data));
        const mmsi = digits(payload?.MetaData?.MMSI || payload?.Message?.PositionReport?.UserID || payload?.Message?.ShipStaticData?.UserID);
        if (!mmsi) return;
        const merged = mergeAisStreamMessage(vesselsByMmsi.get(mmsi), payload);
        const normalized = normalizeLiveAisVessel(merged);
        const typeMatch = String(normalized.vessel_type || "").match(/(?:^|\D)(\d{2})(?:\D|$)/);
        const typeCode = typeMatch ? Number(typeMatch[1]) : null;
        if (typeCode !== null && allowedAisTypes.size > 0 && !allowedAisTypes.has(typeCode)) {
          vesselsByMmsi.delete(mmsi);
          return;
        }
        if (typeCode === null && allowedAisTypes.size > 0 && !vesselsByMmsi.has(mmsi) && vesselsByMmsi.size >= normalizedLimit) {
          return;
        }
        vesselsByMmsi.set(mmsi, merged);
        if (typeCode !== null && vesselsByMmsi.size >= normalizedLimit) finish();
      } catch {}
    });
    socket.on("error", error => finish(Object.assign(new Error("AISStream connection failed"), { code: "AISSTREAM_CONNECTION_ERROR", cause: error })));
    socket.on("close", () => finish());
  });
}

export async function fetchLiveAisBoundingBox(options) {
  const env = options.env || process.env;
  const requestedProvider = normalizeText(env.LIVE_AIS_PROVIDER || env.AIS_PROVIDER || "auto");
  const providers = requestedProvider === "aisstream"
    ? ["aisstream"]
    : requestedProvider === "openships"
      ? ["openships"]
      : ["openships", "aisstream"];
  const errors = [];
  for (const provider of providers) {
    try {
      const vessels = provider === "openships"
        ? await fetchOpenShipsBoundingBox(options)
        : await fetchAisStreamBoundingBox(options);
      return { provider, vessels: deduplicateVessels(vessels, options.limit || DEFAULT_LIMIT) };
    } catch (error) {
      errors.push({ provider, code: error?.code || "LIVE_AIS_PROVIDER_ERROR" });
    }
  }
  const error = new Error("No live AIS provider is available");
  error.code = "LIVE_AIS_UNAVAILABLE";
  error.providers = errors;
  throw error;
}
