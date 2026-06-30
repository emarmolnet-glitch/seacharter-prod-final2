import { upsertVessels, type VesselRecord } from "./vessel-store.js";

const AISSTREAM_ENDPOINT = "wss://stream.aisstream.io/v0/stream";
const BOUNDING_BOX = {
  minLat: -90.0,
  maxLat: 90.0,
  minLon: -180.0,
  maxLon: 180.0,
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
  const shipProfile = pickObject(message.ShipStaticData ?? vessel.ShipStaticData);
  const merged = { ...vessel, ...message, ...position, ...metadata, ...shipProfile };

  const rawImoNumber = toText(readNested(merged, ["imoNumber", "imo", "IMO", "IMONumber", "ImoNumber"]));
  const mmsi = toText(readNested(merged, ["mmsi", "MMSI"]));
  const latitude = toNumber(readNested(merged, ["latitude", "Latitude", "lat", "Lat"]));
  const longitude = toNumber(readNested(merged, ["longitude", "Longitude", "lon", "Lon", "lng", "Lng"]));

  if (!mmsi || latitude === null || longitude === null) return null;

  return {
    imoNumber: rawImoNumber ?? `MMSI-${mmsi}`,
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
  try {
    console.log("LOG: La función ais-ingest ha comenzado.");
    
    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) throw new Error("AISSTREAM_API_KEY no configurada");

    const aisResponse = await fetch(AISSTREAM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[BOUNDING_BOX.minLat, BOUNDING_BOX.minLon], [BOUNDING_BOX.maxLat, BOUNDING_BOX.maxLon]]],
      }),
    });

    if (!aisResponse.ok) throw new Error(`AISStream falló: ${aisResponse.status}`);

    const payload = await aisResponse.json();
    const rows = getRealData(payload).map(normalizeVessel).filter((r): r is VesselRecord => r !== null);

    if (rows.length > 0) {
      await upsertVessels(rows);
      console.log(`[AISStream] Insertados: ${rows.length} buques.`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("LOG: ERROR FATAL DETECTADO:", error);
    return new Response("Error", { status: 500 });
  }
};
