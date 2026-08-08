const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 10000;
const DEFAULT_TIMEOUT_MS = 15000;

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
  const url = new URL(endpoint);
  const bboxParam = String(env.OPENSHIPS_BBOX_PARAM || "bbox").trim();
  const globalBbox = String(env.OPENSHIPS_GLOBAL_BBOX || "-180,-90,180,90").trim();
  const limitParam = String(env.OPENSHIPS_LIMIT_PARAM || "limit").trim();
  if (bboxParam && !url.searchParams.has(bboxParam)) url.searchParams.set(bboxParam, globalBbox);
  if (limitParam && !url.searchParams.has(limitParam)) url.searchParams.set(limitParam, String(limit));

  const apiKey = String(env.OPENSHIPS_API_KEY || env.OPENSHIPS_API_TOKEN || "").trim();
  const keyQueryParam = String(env.OPENSHIPS_API_KEY_QUERY_PARAM || "").trim();
  const headers = { Accept: "application/json" };
  if (apiKey && keyQueryParam) {
    url.searchParams.set(keyQueryParam, apiKey);
  } else if (apiKey) {
    const headerName = String(env.OPENSHIPS_API_KEY_HEADER || "Authorization").trim();
    const prefix = env.OPENSHIPS_API_KEY_PREFIX === undefined ? "Bearer " : String(env.OPENSHIPS_API_KEY_PREFIX);
    headers[headerName] = `${prefix}${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const error = new Error(`OpenShips REST request failed with HTTP ${response.status}`);
      error.code = "OPENSHIPS_HTTP_ERROR";
      throw error;
    }
    const payload = await response.json();
    const vessels = extractProviderRows(payload)
      .slice(0, limit)
      .map(normalizeOpenShipsVessel);
    return {
      vessels,
      count: vessels.length,
      fetchedAt: new Date().toISOString(),
      providerMeta: asRecord(payload).meta || asRecord(payload).pagination || null,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("OpenShips REST request timed out");
      timeoutError.code = "OPENSHIPS_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
