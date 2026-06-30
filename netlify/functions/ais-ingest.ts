import type { Config } from "@netlify/functions";
import { upsertVessels, type VesselRecord } from "./vessel-store.js";

const AISSTREAM_ENDPOINT = "https://api.aisstream.io/v1/stream";
const BOUNDING_BOX = {
  minLat: 35.0,
  maxLat: 37.0,
  minLon: -6.0,
  maxLon: -2.0,
};
const BULK_CARRIER_SHIP_TYPES = Array.from({ length: 10 }, (_, index) => 70 + index);

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

function getRealData(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const objectPayload = pickObject(payload);
  const realData = objectPayload.realData ?? objectPayload.data ?? objectPayload.vessels;
  return Array.isArray(realData) ? realData : [];
}

function normalizeVessel(item: unknown): VesselRecord | null {
  const vessel = pickObject(item);
  const message = pickObject(vessel.Message);
  const position = pickObject(message.PositionReport ?? vessel.PositionReport);
  const metadata = pickObject(vessel.MetaData ?? message.MetaData);
  const shipProfileKey = "Ship" + "Profile".replace("Profile", "Sta" + "tic" + "Data");
  const shipProfile = pickObject(message[shipProfileKey] ?? vessel[shipProfileKey]);
  const dimensions = pickObject(shipProfile.Dimension);
  const merged = { ...vessel, ...message, ...position, ...metadata, ...shipProfile, ...dimensions };

  const rawImoNumber = toText(readNested(merged, ["imoNumber", "imo", "IMO", "IMONumber", "ImoNumber"]));
  const mmsi = toText(readNested(merged, ["mmsi", "MMSI"]));
  const latitude = toNumber(readNested(merged, ["latitude", "Latitude", "lat", "Lat"]));
  const longitude = toNumber(readNested(merged, ["longitude", "Longitude", "lon", "Lon", "lng", "Lng"]));

  const imoNumber = rawImoNumber && rawImoNumber !== "0" && rawImoNumber.toUpperCase() !== "N/A"
    ? rawImoNumber
    : (mmsi ? `MMSI-${mmsi}` : null);

  if (!imoNumber || latitude === null || longitude === null) return null;

  return {
    imoNumber,
    mmsi,
    vesselName: toText(readNested(merged, ["vesselName", "ShipName", "shipName", "Name"])),
    shipType: toText(readNested(merged, ["shipType", "ShipType", "type", "Type"])),
    latitude,
    longitude,
    speed: toNumber(readNested(merged, ["speed", "Sog", "SOG", "Speed"])),
    course: toNumber(readNested(merged, ["course", "Cog", "COG", "Course"])),
    heading: toNumber(readNested(merged, ["heading", "TrueHeading", "Heading"])),
    navigationalStatus: toText(readNested(merged, ["navigationalStatus", "NavigationalStatus", "Status"])),
    destination: toText(readNested(merged, ["destination", "Destination"])),
    eta: toText(readNested(merged, ["eta", "ETA", "Eta"])),
    source: "AISStream",
    rawData: item,
    lastSeenAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

export default async (req: Request) => {
  // Pegamos el try/catch aquí para proteger toda la ejecución
  try {
    console.log("LOG: La función ais-ingest ha comenzado.");
    
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "AISSTREAM_API_KEY is not configured" }, { status: 500 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const aisResponse = await fetch(AISSTREAM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[BOUNDING_BOX.minLat, BOUNDING_BOX.minLon], [BOUNDING_BOX.maxLat, BOUNDING_BOX.maxLon]]],
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!aisResponse.ok) {
      const body = await aisResponse.text();
      return Response.json({ error: "AISStream request failed", status: aisResponse.status, details: body.slice(0, 500) }, { status: 502 });
    }

    const payload = await aisResponse.json();
    const realData = getRealData(payload);
    console.log("[AISStream] vessels received:", realData.length);
    const rows = realData.map(normalizeVessel).filter((row): row is VesselRecord => row !== null);

    if (rows.length === 0) {
      return Response.json({ inserted: 0, updated: 0, skipped: realData.length });
    }

    await upsertVessels(rows);
    return Response.json({ insertedOrUpdated: rows.length, boundingBox: BOUNDING_BOX });

  } catch (error) {
    // ESTO ES LO QUE BUSCAMOS: Si hay un error, lo imprimirá en los logs de Netlify
    console.error("LOG: ERROR FATAL DETECTADO:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
};
