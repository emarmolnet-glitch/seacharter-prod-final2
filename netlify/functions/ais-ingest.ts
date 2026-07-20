import WebSocket from "ws";
import { upsertVessels, type VesselRecord } from "./vessel-store.js";
import { filterVesselsByTaxonomies, parseRequestedTaxonomies } from "./ais-taxonomy.js";

const AISSTREAM_ENDPOINT = "wss://stream.aisstream.io/v0/stream";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_TIMEOUT_MS = 6000;
const DEFAULT_LIMIT = 250;

declare const process: { env: Record<string, string | undefined> };

type PostgreSqlError = Error & {
  code?: string;
  severity?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

type EtaTarget = {
  lat: number;
  lon: number;
  label: string;
};

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readNested(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const direct = source[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusNm = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radiusNm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildEstimatedEta(latitude: number, longitude: number, speed: number | null, target: EtaTarget | null) {
  if (!target) return {};
  const speedKnots = speed && speed > 0.5 ? speed : 11;
  const distanceNm = haversineNm(latitude, longitude, target.lat, target.lon);
  const hours = distanceNm / speedKnots;
  return {
    estimatedEta: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    estimatedEtaTarget: target.label,
    estimatedEtaDistanceNm: Math.round(distanceNm),
    estimatedEtaHours: Math.round(hours * 10) / 10,
    estimatedEtaSpeedKnots: Math.round(speedKnots * 10) / 10,
    estimatedEtaConfidence: speed && speed > 2 ? "high" as const : "medium" as const,
  };
}

function normalizeDraughtMeters(value: unknown): number | null {
  const draught = toNumber(value);
  if (draught === null) return null;
  return draught > 25 ? Math.round((draught / 10) * 100) / 100 : draught;
}

function readPortText(source: Record<string, unknown>, keys: string[]): string | null {
  const text = toText(readNested(source, keys));
  if (!text || text.toUpperCase() === "NOT AVAILABLE" || text.toUpperCase() === "N/A") return null;
  return text;
}

function parseBoundingBoxes(rawBoxes: string | null) {
  if (!rawBoxes) return null;
  try {
    const boxes = JSON.parse(rawBoxes) as unknown;
    if (!Array.isArray(boxes) || boxes.length === 0) return null;
    return boxes;
  } catch (_) {
    return null;
  }
}

function getEtaTarget(url: URL): EtaTarget | null {
  const lat = toNumber(url.searchParams.get("targetLat") || url.searchParams.get("polLat") || url.searchParams.get("podLat"));
  const lon = toNumber(url.searchParams.get("targetLon") || url.searchParams.get("polLon") || url.searchParams.get("podLon"));
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return {
    lat,
    lon,
    label: toText(url.searchParams.get("targetName") || url.searchParams.get("polName") || url.searchParams.get("podName")) || "Objetivo radar",
  };
}

function mergeDefined(current: Record<string, unknown> | undefined, incoming: Record<string, unknown>) {
  const merged = { ...(current || {}) };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (key === "MetaData" && typeof value === "object" && value && typeof merged.MetaData === "object" && merged.MetaData) {
      merged.MetaData = mergeDefined(merged.MetaData as Record<string, unknown>, value as Record<string, unknown>);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

async function insertAisRows(rows: VesselRecord[]) {
  try {
    await upsertVessels(rows);
  } catch (error) {
    const databaseError = error as PostgreSqlError;
    console.error("[ais-ingest] AISStream database insertion failed.", {
      message: databaseError instanceof Error ? databaseError.message : "Unknown database insertion error",
      code: databaseError.code || null,
      severity: databaseError.severity || null,
      detail: databaseError.detail || null,
      hint: databaseError.hint || null,
      schema: databaseError.schema || null,
      table: databaseError.table || null,
      column: databaseError.column || null,
      constraint: databaseError.constraint || null,
      expectedBuffer: "vessel_radar_feed",
      rowCount: rows.length,
    });
    throw error;
  }
}

function normalizeVessel(item: unknown, etaTarget: EtaTarget | null): VesselRecord | null {
  const vessel = pickObject(item);
  const message = pickObject(vessel.Message);
  const position = pickObject(message.PositionReport ?? vessel.PositionReport);
  const metadata = pickObject(vessel.MetaData ?? message.MetaData);
  const shipProfile = pickObject(message.ShipStaticData ?? vessel.ShipStaticData);
  const merged = { ...vessel, ...message, ...position, ...metadata, ...shipProfile };

  const rawImoNumber = toText(readNested(merged, ["imoNumber", "imo", "IMO", "IMONumber", "ImoNumber"]));
  const mmsi = toText(readNested(merged, ["mmsi", "MMSI", "UserID"]));
  const shipType = toText(readNested(merged, ["shipType", "ShipType", "type", "Type", "Tipo", "tipo", "cargoType", "tipo_carga", "vesselType", "categoryLabel"]));
  const latitude = toNumber(readNested(merged, ["latitude", "Latitude", "lat", "Lat"]));
  const longitude = toNumber(readNested(merged, ["longitude", "Longitude", "lon", "Lon", "lng", "Lng"]));

  if (!mmsi || latitude === null || longitude === null) return null;

  const now = new Date().toISOString();
  const speed = toNumber(readNested(merged, ["speed", "Sog", "SOG", "Speed"]));
  return {
    imoNumber: rawImoNumber ?? `MMSI-${mmsi}`,
    mmsi,
    vesselName: toText(readNested(merged, ["vesselName", "ShipName", "shipName", "Name"])),
    shipType,
    draught: normalizeDraughtMeters(readNested(merged, ["draught", "Draught", "draft", "Draft", "MaximumStaticDraught"])),
    latitude,
    longitude,
    speed,
    course: toNumber(readNested(merged, ["course", "Cog", "COG", "Course"])),
    heading: toNumber(readNested(merged, ["heading", "TrueHeading", "Heading"])),
    navigationalStatus: toText(readNested(merged, ["navigationalStatus", "NavigationalStatus", "Status"])),
    destination: readPortText(merged, ["destination", "Destination", "PortOfDestination", "DestinationPort", "destino"]),
    lastPortOfCall: readPortText(merged, ["lastPortOfCall", "last_port_of_call", "ultimo_puerto", "ultimoPuerto", "LastPort", "LastPortOfCall", "PreviousPort", "DeparturePort", "PortOfDeparture"]),
    eta: toText(readNested(merged, ["eta", "ETA", "Eta"])),
    ...buildEstimatedEta(latitude, longitude, speed, etaTarget),
    source: "AISStream",
    rawData: item,
    lastSeenAt: now,
    updatedAt: now,
    createdAt: now,
  };
}

function collectVessels(apiKey: string, boundingBoxes: unknown[], timeoutMs: number, limit: number, etaTarget: EtaTarget | null) {
  return new Promise<VesselRecord[]>((resolve, reject) => {
    const messagesByMmsi = new Map<string, Record<string, unknown>>();
    const ws = new WebSocket(AISSTREAM_ENDPOINT);
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch (_) {}
      const rows = Array.from(messagesByMmsi.values()).map((message) => normalizeVessel(message, etaTarget)).filter((row): row is VesselRecord => row !== null);
      if (error && rows.length === 0) {
        reject(error);
        return;
      }
      resolve(rows.slice(0, limit));
    };

    const timer = setTimeout(() => finish(), timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: boundingBoxes,
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport",
          "ShipStaticData",
        ],
      }));
    });

    ws.on("message", (data: { toString: () => string }) => {
      try {
        const payload = JSON.parse(data.toString()) as Record<string, unknown>;
        const metadata = pickObject(payload.MetaData);
        const message = pickObject(payload.Message);
        const position = pickObject(
          message.PositionReport
            ?? payload.PositionReport
            ?? message.StandardClassBPositionReport
            ?? payload.StandardClassBPositionReport
            ?? message.ExtendedClassBPositionReport
            ?? payload.ExtendedClassBPositionReport,
        );
        const staticData = pickObject(message.ShipStaticData ?? payload.ShipStaticData);
        const mmsi = toText(readNested({ ...payload, ...message, ...position, ...metadata, ...staticData }, ["MMSI", "mmsi", "UserID"]));
        if (!mmsi) return;
        messagesByMmsi.set(mmsi, mergeDefined(messagesByMmsi.get(mmsi), payload));
        if (messagesByMmsi.size >= limit) finish();
      } catch (_) {}
    });

    ws.on("error", () => finish(new Error("AISStream WebSocket connection failed.")));
    ws.on("close", () => finish());
  });
}

export default async (req: Request) => {
  try {
    const apiKey = String(process.env.AISSTREAM_API_KEY || process.env.AISTREAM_API_KEY || "").trim();
    if (!apiKey) {
      return Response.json({ ok: false, error: "AISSTREAM_API_KEY no configurada" }, { status: 401 });
    }

    const url = new URL(req.url);
    const boundingBoxes = parseBoundingBoxes(url.searchParams.get("boxes"));
    if (!boundingBoxes) {
      return Response.json({ ok: false, error: "AIS POL/POD bounding boxes are required" }, { status: 400 });
    }

    const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(2500, Number(url.searchParams.get("timeoutMs")) || DEFAULT_TIMEOUT_MS));
    const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || Number(url.searchParams.get("quantity")) || DEFAULT_LIMIT));
    const etaTarget = getEtaTarget(url);
    const rows = await collectVessels(apiKey, boundingBoxes, timeoutMs, limit, etaTarget);
    const strictTaxonomyMode = url.searchParams.get("taxonomyMode") === "strict";
    const selectedTaxonomies = parseRequestedTaxonomies(url);
    if (strictTaxonomyMode && selectedTaxonomies.length === 0) {
      return Response.json({ ok: false, error: "At least one valid vessel taxonomy is required" }, { status: 400 });
    }
    const acceptedRows = strictTaxonomyMode
      ? filterVesselsByTaxonomies(rows as unknown as Record<string, unknown>[], selectedTaxonomies) as unknown as VesselRecord[]
      : rows;

    if (acceptedRows.length > 0) {
      await insertAisRows(acceptedRows);
    }

    return Response.json({
      ok: true,
      inserted: acceptedRows.length,
      discardedByTaxonomy: strictTaxonomyMode ? Math.max(0, rows.length - acceptedRows.length) : 0,
      selectedTaxonomies: strictTaxonomyMode ? selectedTaxonomies : undefined,
      etaTarget: etaTarget ? etaTarget.label : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AIS ingest failed";
    console.error("AIS ingest failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
