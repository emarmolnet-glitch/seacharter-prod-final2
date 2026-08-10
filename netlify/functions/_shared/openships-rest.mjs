const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;
const DEFAULT_TIMEOUT_MS = 15000;
const OPENSHIPS_POSITION_PATH = "/external/vessels/position/box";
const OPENSHIPS_RADIUS_DEGREES = 50;
const VESSEL_CACHE_TTL_MS = 60 * 60 * 1000;
const SENSITIVE_QUERY_PARAM = /(?:api[-_]?key|token|secret|authorization|signature|credential|password)/i;
const vesselCache = new Map();

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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractProviderRows(payload) {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  const candidates = [record.vessels, record.ships, record.results, record.data, record.items, record.features];
  return candidates.find(Array.isArray) || [];
}

function redactOpenShipsUrl(url) {
  const redacted = new URL(url);
  if (redacted.username) redacted.username = "[redacted]";
  if (redacted.password) redacted.password = "[redacted]";
  for (const key of redacted.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAM.test(key)) redacted.searchParams.set(key, "[redacted]");
  }
  return redacted.toString();
}

function createClientFallback(url, apiKey) {
  const hasEmbeddedCredentials = Boolean(url.username || url.password)
    || Array.from(url.searchParams.keys()).some((key) => SENSITIVE_QUERY_PARAM.test(key));
  if (apiKey || hasEmbeddedCredentials) {
    return { allowed: false, reason: "OpenShips credentials are server-only" };
  }
  if (url.protocol !== "https:") {
    return { allowed: false, reason: "Browser fallback requires an HTTPS provider URL" };
  }
  return { allowed: true, method: "GET", url: url.toString() };
}

async function readUpstreamError(response, secrets = []) {
  const fallback = String(response.statusText || "Upstream request rejected").trim();
  try {
    const rawBody = String(await response.text()).replace(/\s+/g, " ").trim().slice(0, 500);
    if (!rawBody) return fallback;
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      const record = asRecord(parsed);
      message = String(record.error || record.message || record.detail || record.title || rawBody);
    } catch {
      message = rawBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[redacted]");
    return message.slice(0, 500) || fallback;
  } catch {
    return fallback;
  }
}

function withDiagnostics(error, diagnostics) {
  error.diagnostics = diagnostics;
  return error;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createOpenShipsPositionUrl(endpoint, latitude, longitude, radiusDegrees = OPENSHIPS_RADIUS_DEGREES) {
  const url = new URL(endpoint);
  const basePath = url.pathname.replace(/\/+$/, "");
  if (!basePath.endsWith(OPENSHIPS_POSITION_PATH)) {
    url.pathname = `${basePath}${OPENSHIPS_POSITION_PATH}`;
  }
  url.searchParams.delete("box");
  url.searchParams.delete("bbox");
  url.searchParams.set("minLat", String(clamp(latitude - radiusDegrees, -90, 90)));
  url.searchParams.set("maxLat", String(clamp(latitude + radiusDegrees, -90, 90)));
  url.searchParams.set("minLon", String(clamp(longitude - radiusDegrees, -180, 180)));
  url.searchParams.set("maxLon", String(clamp(longitude + radiusDegrees, -180, 180)));
  return url;
}

export function normalizeOpenShipsVessel(value, index = 0) {
  const source = asRecord(value);
  const properties = asRecord(source.properties);
  const record = Object.keys(properties).length > 0 ? { ...source, ...properties } : source;
  const geometry = asRecord(source.geometry);
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const metadata = asRecord(record.MetaData || record.metadata);
  const message = asRecord(record.Message);
  const staticData = asRecord(record.ShipStaticData || message.ShipStaticData);
  const position = asRecord(record.PositionReport || message.PositionReport || record.position);
  const longitude = finiteNumber(firstValue(record, [
    ["longitude"], ["lon"], ["lng"], ["Longitude"], ["AIS_Live_Lon"],
    ["position", "longitude"], ["position", "lon"], ["MetaData", "longitude"],
  ]) ?? coordinates[0]);
  const latitude = finiteNumber(firstValue(record, [
    ["latitude"], ["lat"], ["Latitude"], ["AIS_Live_Lat"],
    ["position", "latitude"], ["position", "lat"], ["MetaData", "latitude"],
  ]) ?? coordinates[1]);
  const mmsi = String(firstValue(record, [
    ["mmsi"], ["MMSI"], ["MetaData", "MMSI"], ["PositionReport", "UserID"],
    ["Message", "PositionReport", "UserID"], ["ShipStaticData", "UserID"],
  ]) || "").replace(/\D/g, "");
  const imo = String(firstValue(record, [
    ["imo"], ["IMO"], ["imo_number"], ["imoNumber"], ["MetaData", "IMO"],
    ["ShipStaticData", "ImoNumber"], ["Message", "ShipStaticData", "ImoNumber"],
  ]) || "").replace(/\D/g, "");
  const vesselName = String(firstValue(record, [
    ["vessel_name"], ["vesselName"], ["name"], ["ShipName"], ["MetaData", "ShipName"],
    ["ShipStaticData", "Name"], ["Message", "ShipStaticData", "Name"],
  ]) || `OpenShips vessel ${index + 1}`).trim();
  const vesselType = firstValue(record, [
    ["vessel_type"], ["vesselType"], ["shipType"], ["ShipType"], ["type"],
    ["MetaData", "ShipType"], ["ShipStaticData", "Type"], ["Message", "ShipStaticData", "Type"],
  ]);
  const destination = firstValue(record, [
    ["destination"], ["Destination"], ["current_destination"], ["currentDestination"],
    ["MetaData", "Destination"], ["ShipStaticData", "Destination"],
    ["Message", "ShipStaticData", "Destination"], ["ShipStaticData", "PortOfDestination"],
  ]);
  const eta = firstValue(record, [
    ["eta"], ["ETA"], ["estimatedEta"], ["declaredEta"], ["MetaData", "ETA"],
    ["ShipStaticData", "ETA"], ["Message", "ShipStaticData", "ETA"],
  ]);
  const speed = finiteNumber(firstValue(record, [
    ["speed_over_ground"], ["speed"], ["sog"], ["SOG"], ["PositionReport", "Sog"],
    ["Message", "PositionReport", "Sog"],
  ]));

  return {
    ...record,
    latitude,
    lat: latitude,
    longitude,
    lon: longitude,
    lng: longitude,
    mmsi: mmsi || null,
    MMSI: mmsi || null,
    imo: imo || null,
    IMO: imo || null,
    imo_number: imo || null,
    vessel_name: vesselName,
    vesselName,
    ShipName: vesselName,
    vessel_type: vesselType ?? null,
    vesselType: vesselType ?? null,
    shipType: vesselType ?? null,
    destination: destination ?? null,
    Destination: destination ?? null,
    eta: eta ?? null,
    ETA: eta ?? null,
    speed_over_ground: speed,
    speed,
    source: "OPENSHIPS",
    source_origin: "OPENSHIPS",
    source_origins: ["OPENSHIPS"],
    data_source: "OPENSHIPS",
    providerPayload: source,
    MetaData: {
      ...metadata,
      MMSI: mmsi || metadata.MMSI || null,
      IMO: imo || metadata.IMO || null,
      ShipName: vesselName,
      ShipType: vesselType ?? metadata.ShipType ?? null,
      Destination: destination ?? metadata.Destination ?? null,
      Latitude: latitude,
      Longitude: longitude,
    },
    Message: message,
    ShipStaticData: staticData,
    PositionReport: position,
  };
}

export async function fetchOpenShipsLive(options = {}) {
  const env = options.env || process.env;
  const endpoint = String(env.OPENSHIPS_API_URL || "").trim();
  if (!endpoint) {
    const error = new Error("OPENSHIPS_API_URL is not configured");
    error.code = "OPENSHIPS_NOT_CONFIGURED";
    throw error;
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(options.limit) || DEFAULT_LIMIT)));
  const timeoutMs = Math.max(1000, Math.min(30000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const radiusDegrees = Math.max(1, Math.min(180, Number(options.radiusDegrees) || OPENSHIPS_RADIUS_DEGREES));
  const latitude = finiteNumber(options.latitude);
  const longitude = finiteNumber(options.longitude);
  if (latitude === null || latitude < -90 || latitude > 90 || longitude === null || longitude < -180 || longitude > 180) {
    const error = new Error("Valid POL coordinates are required for the OpenShips request");
    error.code = "OPENSHIPS_INVALID_COORDINATES";
    throw error;
  }
  const url = createOpenShipsPositionUrl(endpoint, latitude, longitude, radiusDegrees);
  const limitParam = String(env.OPENSHIPS_LIMIT_PARAM || "limit").trim();
  if (limitParam && !url.searchParams.has(limitParam)) url.searchParams.set(limitParam, String(limit));
  const cacheKey = redactOpenShipsUrl(url);
  const cached = vesselCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.savedAt < VESSEL_CACHE_TTL_MS) return cached.result;
  if (cached) vesselCache.delete(cacheKey);

  const apiKey = String(env.OPENSHIPS_API_KEY || env.OPENSHIPS_API_TOKEN || "").trim();
  const keyQueryParam = String(env.OPENSHIPS_API_KEY_QUERY_PARAM || "").trim();
  const headers = { Accept: "application/json" };
  const clientFallback = createClientFallback(url, apiKey);
  if (apiKey && keyQueryParam) {
    url.searchParams.set(keyQueryParam, apiKey);
  } else if (apiKey) {
    const headerName = String(env.OPENSHIPS_API_KEY_HEADER || "Authorization").trim();
    const prefix = env.OPENSHIPS_API_KEY_PREFIX === undefined ? "Bearer " : String(env.OPENSHIPS_API_KEY_PREFIX);
    headers[headerName] = `${prefix}${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = redactOpenShipsUrl(url);
  console.log(`[OpenShips Fetch] Requesting: ${requestUrl}`);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const upstreamMessage = await readUpstreamError(response, [apiKey]);
      const statusText = String(response.statusText || "").trim();
      const statusLabel = `HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`;
      const error = new Error(`OpenShips REST request failed: ${statusLabel}${upstreamMessage ? ` - ${upstreamMessage}` : ""}`);
      error.code = "OPENSHIPS_HTTP_ERROR";
      error.status = response.status;
      throw withDiagnostics(error, {
        httpStatus: response.status,
        statusText,
        message: upstreamMessage,
        requestUrl,
        clientFallback: response.status === 400 || response.status === 403
          ? clientFallback
          : { allowed: false, reason: `HTTP ${response.status} is not eligible for browser fallback` },
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch (parseError) {
      const error = new Error("OpenShips REST returned an invalid JSON payload");
      error.code = "OPENSHIPS_INVALID_JSON";
      throw withDiagnostics(error, {
        httpStatus: response.status,
        statusText: String(response.statusText || "").trim(),
        message: parseError instanceof Error ? parseError.message : "JSON parsing failed",
        requestUrl,
        clientFallback: { allowed: false, reason: "Browser fallback is reserved for HTTP 400 or 403" },
      });
    }
    const providerRows = extractProviderRows(payload);
    const vessels = providerRows
      .slice(0, limit)
      .map(normalizeOpenShipsVessel);
    const result = {
      vessels,
      count: vessels.length,
      fetchedAt: new Date().toISOString(),
      providerMeta: asRecord(payload).meta || asRecord(payload).pagination || null,
      providerDiagnostics: {
        payloadType: Array.isArray(payload) ? "array" : typeof payload,
        topLevelKeys: Object.keys(asRecord(payload)).slice(0, 20),
        extractedRows: providerRows.length,
        requestUrl,
      },
    };
    vesselCache.set(cacheKey, { result, savedAt: Date.now() });
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("OpenShips REST request timed out");
      timeoutError.code = "OPENSHIPS_TIMEOUT";
      throw withDiagnostics(timeoutError, {
        httpStatus: null,
        statusText: "Timeout",
        message: timeoutError.message,
        requestUrl,
        clientFallback: { allowed: false, reason: "Browser fallback is reserved for HTTP 400 or 403" },
      });
    }
    if (error && typeof error === "object" && !("diagnostics" in error)) {
      error.diagnostics = {
        httpStatus: null,
        statusText: "Network Error",
        message: error instanceof Error ? error.message : "OpenShips network request failed",
        requestUrl,
        clientFallback: { allowed: false, reason: "Browser fallback is reserved for HTTP 400 or 403" },
      };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
