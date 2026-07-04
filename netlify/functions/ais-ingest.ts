import WebSocket from "ws";
import { isCargoShipType, upsertVessels, type VesselRecord } from "./vessel-store.js";

const AISSTREAM_ENDPOINT = "wss://stream.aisstream.io/v0/stream";
const DEFAULT_TIMEOUT_MS = 8500;
const MAX_TIMEOUT_MS = 12000;
const DEFAULT_LIMIT = 250;

declare const process: { env: Record<string, string | undefined> };

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

function normalizeVessel(item: unknown): VesselRecord | null {
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
  if (shipType && !isCargoShipType(shipType)) return null;

  const now = new Date().toISOString();
  return {
    imoNumber: rawImoNumber ?? `MMSI-${mmsi}`,
    mmsi,
    vesselName: toText(readNested(merged, ["vesselName", "ShipName", "shipName", "Name"])),
    shipType,
    draught: normalizeDraughtMeters(readNested(merged, ["draught", "Draught", "draft", "Draft", "MaximumStaticDraught"])),
    latitude,
    longitude,
    speed: toNumber(readNested(merged, ["speed", "Sog", "SOG", "Speed"])),
    course: toNumber(readNested(merged, ["course", "Cog", "COG", "Course"])),
    heading: toNumber(readNested(merged, ["heading", "TrueHeading", "Heading"])),
    navigationalStatus: toText(readNested(merged, ["navigationalStatus", "NavigationalStatus", "Status"])),
    destination: readPortText(merged, ["destination", "Destination", "PortOfDestination", "DestinationPort", "destino"]),
    lastPortOfCall: readPortText(merged, ["lastPortOfCall", "last_port_of_call", "ultimo_puerto", "ultimoPuerto", "LastPort", "LastPortOfCall", "PreviousPort", "DeparturePort", "PortOfDeparture"]),
    eta: toText(readNested(merged, ["eta", "ETA", "Eta"])),
    source: "AISStream",
    rawData: item,
    lastSeenAt: now,
    updatedAt: now,
    createdAt: now,
  };
}

function collectVessels(apiKey: string, boundingBoxes: unknown[], timeoutMs: number, limit: number) {
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
      const rows = Array.from(messagesByMmsi.values()).map(normalizeVessel).filter((row): row is VesselRecord => row !== null);
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
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    });

    ws.on("message", (data: { toString: () => string }) => {
      try {
        const payload = JSON.parse(data.toString()) as Record<string, unknown>;
        const metadata = pickObject(payload.MetaData);
        const message = pickObject(payload.Message);
        const position = pickObject(message.PositionReport ?? payload.PositionReport);
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
    const rows = await collectVessels(apiKey, boundingBoxes, timeoutMs, limit);

    if (rows.length > 0) {
      await upsertVessels(rows);
    }

    return Response.json({ ok: true, inserted: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AIS ingest failed";
    console.error("AIS ingest failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};
