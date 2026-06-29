import { desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vesselsMaster } from "../../db/schema.js";

function toAisVessel(row: typeof vesselsMaster.$inferSelect) {
  return {
    MetaData: {
      IMO: row.imoNumber,
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
    imoNumber: row.imoNumber,
    vesselName: row.vesselName,
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
  };
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("quantity") || "1000"), 1), 45000);

  const rows = await db
    .select()
    .from(vesselsMaster)
    .orderBy(desc(vesselsMaster.lastSeenAt))
    .limit(limit);

  return Response.json({ vessels: rows.map(toAisVessel), source: "database" });
};
