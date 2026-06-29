import { readVessels, sortByLastSeen, upsertVessels, type VesselRecord } from "./vessel-store.js";

const AISSTREAM_ENDPOINT = "https://api.aisstream.io/v0/vessels";
const BOUNDING_BOX = {
  minLat: 20.0,
  maxLat: 46.0,
  minLon: -20.0,
  maxLon: 16.0,
};

function pickObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readNested(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
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

function normalizeLiveVessel(item: unknown): VesselRecord | null {
  const vessel = pickObject(item);
  const message = pickObject(vessel.Message);
  const position = pickObject(message.PositionReport ?? vessel.PositionReport);
  const metadata = pickObject(vessel.MetaData ?? message.MetaData);
  const staticData = pickObject(message.ShipStaticData ?? vessel.ShipStaticData);
  const merged = { ...vessel, ...message, ...position, ...metadata, ...staticData };

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

function toAisVessel(row: VesselRecord) {
  const syntheticImo = row.imoNumber && row.imoNumber.startsWith("MMSI-") ? "N/A" : row.imoNumber;
  return {
    MetaData: {
      IMO: syntheticImo,
      MMSI: row.mmsi,
      ShipName: row.vesselName,
      ShipType: row.shipType,
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      Destination: row.destination,
      NavigationalStatus: row.navigationalStatus,
    },
    Message: {
      PositionReport: {
        MMSI: row.mmsi,
        Latitude: row.latitude,
        Longitude: row.longitude,
        Sog: row.speed,
        Cog: row.course,
        TrueHeading: row.heading,
        NavigationalStatus: row.navigationalStatus,
      },
    },
    imoNumber: syntheticImo,
    imo: syntheticImo,
    IMO: syntheticImo,
    mmsi: row.mmsi,
    MMSI: row.mmsi,
    vesselName: row.vesselName,
    ShipName: row.vesselName,
    latitude: row.latitude,
    longitude: row.longitude,
    lat: row.latitude,
    lon: row.longitude,
    speed: row.speed,
    shipType: row.shipType,
    ShipType: row.shipType,
    destination: row.destination,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
  };
}

async function hydrateFromAisStream(limit: number) {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) return 0;

  const aisResponse = await fetch(AISSTREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      APIKey: apiKey,
      BoundingBox: [[BOUNDING_BOX.minLat, BOUNDING_BOX.minLon], [BOUNDING_BOX.maxLat, BOUNDING_BOX.maxLon]],
      boundingBox: BOUNDING_BOX,
    }),
  });

  if (!aisResponse.ok) return 0;

  const payload = await aisResponse.json();
  const rows = getRealData(payload)
    .map(normalizeLiveVessel)
    .filter((row): row is VesselRecord => row !== null)
    .slice(0, limit);

  if (rows.length === 0) return 0;

  await upsertVessels(rows);

  return rows.length;
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("quantity") || "500"), 1), 500);

    let rows = sortByLastSeen(await readVessels()).slice(0, limit);

    if (rows.length === 0 || url.searchParams.get("force") === "1") {
      await hydrateFromAisStream(limit);
      rows = sortByLastSeen(await readVessels()).slice(0, limit);
    }

    console.log("[get-vessels] Blob rows before response parsing:", JSON.stringify(rows, null, 2));

    return Response.json(
      { vessels: rows.map(toAisVessel), source: "blobs", count: rows.length },
      {
        headers: {
          "x-ais-persisted-count": String(rows.length),
          "x-ais-target-count": String(limit),
        },
      },
    );
  } catch (err) {
    console.error("[get-vessels] Falling back to an empty vessel list.", err);
    return new Response(JSON.stringify({ vessels: [] }), { status: 200 });
  }
};
