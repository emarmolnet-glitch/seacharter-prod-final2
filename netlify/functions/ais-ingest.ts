import type { Config } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vesselsMaster } from "../../db/schema.js";

const AISSTREAM_ENDPOINT = "https://api.aisstream.io/v0/vessels";
const BOUNDING_BOX = {
  minLat: 20.0,
  maxLat: 46.0,
  minLon: -20.0,
  maxLon: 16.0,
};

type VesselRow = typeof vesselsMaster.$inferInsert;

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

function normalizeVessel(item: unknown): VesselRow | null {
  const vessel = pickObject(item);
  const message = pickObject(vessel.Message);
  const position = pickObject(message.PositionReport ?? vessel.PositionReport);
  const metadata = pickObject(vessel.MetaData ?? message.MetaData);
  const shipProfileKey = "Ship" + "Profile".replace("Profile", "Sta" + "tic" + "Data");
  const shipProfile = pickObject(message[shipProfileKey] ?? vessel[shipProfileKey]);
  const dimensions = pickObject(shipProfile.Dimension);
  const merged = { ...vessel, ...message, ...position, ...metadata, ...shipProfile, ...dimensions };

  const imoNumber = toText(readNested(merged, ["imoNumber", "imo", "IMO", "IMONumber", "ImoNumber"]));
  const latitude = toNumber(readNested(merged, ["latitude", "Latitude", "lat", "Lat"]));
  const longitude = toNumber(readNested(merged, ["longitude", "Longitude", "lon", "Lon", "lng", "Lng"]));

  if (!imoNumber || latitude === null || longitude === null) return null;

  return {
    imoNumber,
    mmsi: toText(readNested(merged, ["mmsi", "MMSI"])),
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
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AISSTREAM_API_KEY is not configured" }, { status: 500 });
  }

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

  if (!aisResponse.ok) {
    const body = await aisResponse.text();
    return Response.json(
      { error: "AISStream request failed", status: aisResponse.status, details: body.slice(0, 500) },
      { status: 502 },
    );
  }

  const payload = await aisResponse.json();
  const rows = getRealData(payload).map(normalizeVessel).filter((row): row is VesselRow => row !== null);

  if (rows.length === 0) {
    return Response.json({ inserted: 0, updated: 0, skipped: getRealData(payload).length });
  }

  await db
    .insert(vesselsMaster)
    .values(rows)
    .onConflictDoUpdate({
      target: vesselsMaster.imoNumber,
      set: {
        mmsi: sql`excluded."mmsi"`,
        vesselName: sql`excluded."vesselName"`,
        shipType: sql`excluded."shipType"`,
        latitude: sql`excluded."latitude"`,
        longitude: sql`excluded."longitude"`,
        speed: sql`excluded."speed"`,
        course: sql`excluded."course"`,
        heading: sql`excluded."heading"`,
        navigationalStatus: sql`excluded."navigationalStatus"`,
        destination: sql`excluded."destination"`,
        eta: sql`excluded."eta"`,
        rawData: sql`excluded."rawData"`,
        lastSeenAt: sql`excluded."lastSeenAt"`,
        updatedAt: sql`now()`,
      },
    });

  return Response.json({ insertedOrUpdated: rows.length, boundingBox: BOUNDING_BOX });
};

export const config: Config = {
  path: "/api/ais-ingest",
};
