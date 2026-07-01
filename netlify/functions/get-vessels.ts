import type { Config } from "@netlify/functions";
import WebSocket from "ws";
import { readVessels, upsertVessels, type VesselRecord } from "./vessel-store.js";

type VesselMessage = Record<string, unknown>;

const AIS_STREAM_URL = "wss://stream.aisstream.io/v0/stream";
const DEFAULT_TIMEOUT_MS = 8500;
const MAX_TIMEOUT_MS = 12000;
const DEFAULT_QUANTITY = 1000;
const MAX_QUANTITY = 45000;

let vesselCache: VesselMessage[] = [];
let cacheUpdatedAt = 0;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function vesselsResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers || {}),
    },
  });
}

function numberParam(url: URL, names: string[], fallback: number) {
  for (const name of names) {
    const value = Number(url.searchParams.get(name));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function parseRequestedBoxes(url: URL) {
  const rawBoxes = url.searchParams.get("boxes");
  if (!rawBoxes) return null;

  try {
    const parsed = JSON.parse(rawBoxes) as unknown;
    if (!Array.isArray(parsed)) return null;

    const boxes = parsed
      .map((box) => {
        if (!Array.isArray(box) || !Array.isArray(box[0]) || !Array.isArray(box[1])) return null;
        const minLat = Number(box[0][0]);
        const minLon = Number(box[0][1]);
        const maxLat = Number(box[1][0]);
        const maxLon = Number(box[1][1]);
        if (![minLat, minLon, maxLat, maxLon].every(Number.isFinite)) return null;
        if (Math.min(minLat, maxLat) < -90 || Math.max(minLat, maxLat) > 90) return null;
        if (Math.min(minLon, maxLon) < -180 || Math.max(minLon, maxLon) > 180) return null;
        return [
          [Math.min(minLat, maxLat), Math.min(minLon, maxLon)],
          [Math.max(minLat, maxLat), Math.max(minLon, maxLon)],
        ];
      })
      .filter((box): box is number[][] => Array.isArray(box));

    return boxes.length > 0 ? boxes.slice(0, 4) : null;
  } catch (_) {
    return null;
  }
}

function getRequestedBounds(url: URL) {
  if (url.searchParams.get("mode") === "global") {
    return [
      [-90.0, -180.0],
      [90.0, 180.0],
    ];
  }

  const minLat = numberParam(url, ["minLat", "latMin"], NaN);
  const maxLat = numberParam(url, ["maxLat", "latMax"], NaN);
  const minLon = numberParam(url, ["minLon", "lonMin"], NaN);
  const maxLon = numberParam(url, ["maxLon", "lonMax"], NaN);

  if ([minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
    return [
      [Math.min(minLat, maxLat), Math.min(minLon, maxLon)],
      [Math.max(minLat, maxLat), Math.max(minLon, maxLon)],
    ];
  }

  return [
    [30.0, -12.0],
    [47.5, 42.0],
  ];
}

function getRequestedBoundingBoxes(url: URL) {
  return parseRequestedBoxes(url) || [getRequestedBounds(url)];
}

function getApiKey() {
  return String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getVesselKey(message: VesselMessage) {
  const metadata = asRecord(message.MetaData);
  return String(
    metadata.MMSI ||
    metadata.mmsi ||
    message.MMSI ||
    message.mmsi ||
    metadata.IMO ||
    message.IMO ||
    "",
  ).trim();
}

function normalizeVesselMessage(message: VesselMessage): VesselMessage {
  const metadata = asRecord(message.MetaData);
  const nestedMessage = asRecord(message.Message);
  const positionReport = asRecord(message.PositionReport || nestedMessage.PositionReport);
  const staticData = asRecord(message.ShipStaticData || nestedMessage.ShipStaticData);

  const latitude = normalizeNumber(firstDefined(
    message.latitude,
    message.AIS_Live_Lat,
    metadata.latitude,
    metadata.AIS_Live_Lat,
    positionReport.Latitude,
    positionReport.latitude,
  ));
  const longitude = normalizeNumber(firstDefined(
    message.longitude,
    message.AIS_Live_Lon,
    metadata.longitude,
    metadata.AIS_Live_Lon,
    positionReport.Longitude,
    positionReport.longitude,
  ));
  const mmsi = firstDefined(message.MMSI, message.mmsi, metadata.MMSI, metadata.mmsi, positionReport.UserID, staticData.UserID);
  const shipName = firstDefined(message.ShipName, message.vesselName, message.name, metadata.ShipName, metadata.shipName, staticData.Name);
  const imo = firstDefined(message.IMO, message.imo, metadata.IMO, metadata.imo, staticData.ImoNumber);
  const shipType = firstDefined(message.ShipType, message.shipType, metadata.ShipType, metadata.shipType, staticData.Type);
  const speed = normalizeNumber(firstDefined(message.speed, metadata.speed, positionReport.Sog, positionReport.SOG));
  const navigationalStatus = firstDefined(message.NavigationalStatus, metadata.NavigationalStatus, positionReport.NavigationalStatus);
  const destination = firstDefined(message.destination, message.Destination, message.destino_actual, metadata.Destination, metadata.destination, staticData.Destination, staticData.PortOfDestination);
  const lastPortOfCall = firstDefined(
    message.lastPortOfCall,
    message.last_port_of_call,
    message.ultimo_puerto,
    message.ultimoPuerto,
    message.LastPort,
    message.LastPortOfCall,
    message.PreviousPort,
    message.DeparturePort,
    metadata.lastPortOfCall,
    metadata.last_port_of_call,
    metadata.ultimo_puerto,
    metadata.LastPort,
    metadata.LastPortOfCall,
    metadata.PreviousPort,
    metadata.DeparturePort,
    staticData.LastPort,
    staticData.LastPortOfCall,
    staticData.PreviousPort,
    staticData.DeparturePort,
  );

  return {
    ...message,
    MMSI: mmsi,
    mmsi,
    ShipName: shipName,
    vesselName: shipName,
    IMO: imo || (mmsi ? "N/A" : undefined),
    imo: imo || (mmsi ? "N/A" : undefined),
    ShipType: shipType,
    shipType,
    latitude,
    longitude,
    AIS_Live_Lat: latitude,
    AIS_Live_Lon: longitude,
    speed,
    NavigationalStatus: navigationalStatus,
    destination,
    Destination: destination,
    destino_actual: destination,
    lastPortOfCall,
    last_port_of_call: lastPortOfCall,
    ultimo_puerto: lastPortOfCall,
    MetaData: {
      ...metadata,
      MMSI: firstDefined(metadata.MMSI, mmsi),
      ShipName: firstDefined(metadata.ShipName, shipName),
      IMO: firstDefined(metadata.IMO, imo, mmsi ? "N/A" : undefined),
      ShipType: firstDefined(metadata.ShipType, shipType),
      latitude: firstDefined(metadata.latitude, latitude),
      longitude: firstDefined(metadata.longitude, longitude),
      speed: firstDefined(metadata.speed, speed),
      NavigationalStatus: firstDefined(metadata.NavigationalStatus, navigationalStatus),
      Destination: firstDefined(metadata.Destination, destination),
      lastPortOfCall: firstDefined(metadata.lastPortOfCall, lastPortOfCall),
      ultimo_puerto: firstDefined(metadata.ultimo_puerto, lastPortOfCall),
    },
  };
}

function toVesselRecord(message: VesselMessage): VesselRecord | null {
  const normalized = normalizeVesselMessage(message);
  const metadata = asRecord(normalized.MetaData);
  const mmsi = String(firstDefined(normalized.mmsi, normalized.MMSI, metadata.MMSI, "") || "").trim();
  const latitude = normalizeNumber(firstDefined(normalized.latitude, normalized.AIS_Live_Lat, metadata.latitude));
  const longitude = normalizeNumber(firstDefined(normalized.longitude, normalized.AIS_Live_Lon, metadata.longitude));

  if (!mmsi || latitude === undefined || longitude === undefined) return null;

  const now = new Date().toISOString();
  const imo = String(firstDefined(normalized.imo, normalized.IMO, metadata.IMO, "") || "").trim();

  return {
    imoNumber: imo && imo !== "N/A" ? imo : `MMSI-${mmsi}`,
    mmsi,
    vesselName: String(firstDefined(normalized.vesselName, normalized.ShipName, metadata.ShipName, "") || "").trim() || null,
    shipType: String(firstDefined(normalized.shipType, normalized.ShipType, metadata.ShipType, "") || "").trim() || null,
    latitude,
    longitude,
    speed: normalizeNumber(firstDefined(normalized.speed, metadata.speed)) ?? null,
    course: normalizeNumber(firstDefined(normalized.course, normalized.COG, metadata.course)) ?? null,
    heading: normalizeNumber(firstDefined(normalized.heading, normalized.TrueHeading, metadata.heading)) ?? null,
    navigationalStatus: String(firstDefined(normalized.NavigationalStatus, metadata.NavigationalStatus, "") || "").trim() || null,
    destination: String(firstDefined(normalized.destination, normalized.Destination, metadata.Destination, "") || "").trim() || null,
    lastPortOfCall: String(firstDefined(normalized.lastPortOfCall, normalized.last_port_of_call, normalized.ultimo_puerto, metadata.lastPortOfCall, metadata.ultimo_puerto, "") || "").trim() || null,
    eta: String(firstDefined(normalized.eta, normalized.ETA, metadata.ETA, "") || "").trim() || null,
    source: "AISStream",
    rawData: normalized,
    lastSeenAt: now,
    updatedAt: now,
    createdAt: now,
  };
}

function fromVesselRecord(row: VesselRecord): VesselMessage {
  return normalizeVesselMessage({
    MMSI: row.mmsi,
    mmsi: row.mmsi,
    IMO: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
    imo: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
    ShipName: row.vesselName,
    vesselName: row.vesselName,
    ShipType: row.shipType,
    shipType: row.shipType,
    latitude: row.latitude,
    longitude: row.longitude,
    AIS_Live_Lat: row.latitude,
    AIS_Live_Lon: row.longitude,
    speed: row.speed,
    course: row.course,
    heading: row.heading,
    NavigationalStatus: row.navigationalStatus,
    destination: row.destination,
    Destination: row.destination,
    destino_actual: row.destination,
    lastPortOfCall: row.lastPortOfCall,
    last_port_of_call: row.lastPortOfCall,
    ultimo_puerto: row.lastPortOfCall,
    eta: row.eta,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
    rawData: row.rawData,
    MetaData: {
      MMSI: row.mmsi,
      IMO: row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber,
      ShipName: row.vesselName,
      ShipType: row.shipType,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      NavigationalStatus: row.navigationalStatus,
      Destination: row.destination,
      lastPortOfCall: row.lastPortOfCall,
      ultimo_puerto: row.lastPortOfCall,
    },
  });
}

async function readStoredVesselMessages(limit: number) {
  try {
    return (await readVessels()).slice(0, limit).map(fromVesselRecord);
  } catch (error) {
    console.warn("AIS vessel store read failed:", error);
    return [];
  }
}

async function persistVesselMessages(vessels: VesselMessage[]) {
  const rows = vessels.map(toVesselRecord).filter((row): row is VesselRecord => row !== null);
  if (rows.length === 0) return;

  try {
    await upsertVessels(rows);
  } catch (error) {
    console.warn("AIS vessel store write failed:", error);
  }
}

function mergeDefinedVesselFields(current: VesselMessage | undefined, incoming: VesselMessage) {
  const merged: VesselMessage = { ...(current || {}) };

  Object.entries(incoming).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (key === "MetaData" && typeof value === "object" && value && typeof merged.MetaData === "object" && merged.MetaData) {
      merged.MetaData = mergeDefinedVesselFields(merged.MetaData as VesselMessage, value as VesselMessage);
      return;
    }

    merged[key] = value;
  });

  return merged;
}

function collectVessels(url: URL, apiKey: string) {
  const quantity = Math.min(MAX_QUANTITY, Math.max(1, numberParam(url, ["quantity", "limit"], DEFAULT_QUANTITY)));
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(2500, numberParam(url, ["timeoutMs"], DEFAULT_TIMEOUT_MS)));
  const bounds = getRequestedBoundingBoxes(url);

  return new Promise<VesselMessage[]>((resolve, reject) => {
    const vesselsByKey = new Map<string, VesselMessage>();
    const ws = new WebSocket(AIS_STREAM_URL);
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      try {
        ws.close();
      } catch (_) {}

      if (error && vesselsByKey.size === 0) {
        reject(error);
        return;
      }

      resolve(Array.from(vesselsByKey.values()).slice(0, quantity));
    };

    timer = setTimeout(() => finish(), timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: bounds,
        VesselTypes: [],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    });

    ws.on("message", (data) => {
      try {
        const message = normalizeVesselMessage(JSON.parse(data.toString()) as VesselMessage);
        const key = getVesselKey(message);
        if (!key) return;
        vesselsByKey.set(key, mergeDefinedVesselFields(vesselsByKey.get(key), message));
        if (vesselsByKey.size >= quantity) finish();
      } catch (_) {}
    });

    ws.on("error", () => finish(new Error("AIS stream connection failed.")));
    ws.on("close", () => finish());
  });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const requestedQuantity = Math.min(MAX_QUANTITY, Math.max(1, numberParam(url, ["quantity", "limit"], DEFAULT_QUANTITY)));

  if (url.searchParams.get("action") === "reset-cache") {
    vesselCache = [];
    cacheUpdatedAt = 0;
    return vesselsResponse({ ok: true, reset: true });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const storedVessels = await readStoredVesselMessages(requestedQuantity);
    if (storedVessels.length > 0) {
      vesselCache = storedVessels;
      cacheUpdatedAt = Date.now();
    }

    return vesselsResponse({
      vessels: vesselCache,
      warning: "AIS stream API key is not configured on the server.",
      updatedAt: cacheUpdatedAt,
      source: vesselCache.length ? "stored-cache" : "empty-fallback",
    });
  }

  try {
    const vessels = await collectVessels(url, apiKey);
    if (vessels.length > 0) {
      vesselCache = vessels;
      cacheUpdatedAt = Date.now();
      await persistVesselMessages(vessels);
    } else if (vesselCache.length === 0) {
      vesselCache = await readStoredVesselMessages(requestedQuantity);
      if (vesselCache.length > 0) cacheUpdatedAt = Date.now();
    }

    return vesselsResponse(
      { vessels: vessels.length ? vessels : vesselCache, updatedAt: cacheUpdatedAt, source: vessels.length ? "aisstream-live" : "stored-cache" },
      {
        headers: {
          "x-ais-persisted-count": String(vesselCache.length),
          "x-ais-target-count": String(requestedQuantity),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "AIS stream request failed.";
    if (vesselCache.length === 0) {
      vesselCache = await readStoredVesselMessages(requestedQuantity);
      if (vesselCache.length > 0) cacheUpdatedAt = Date.now();
    }

    return vesselsResponse({
      vessels: vesselCache,
      warning: message,
      updatedAt: cacheUpdatedAt,
      source: vesselCache.length ? "stored-cache" : "empty-fallback",
    });
  }
};

export const config: Config = {
  method: ["GET", "POST"],
};
