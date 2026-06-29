import type { Config } from "@netlify/functions";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { vesselsMaster } from "../../db/schema.js";

type VesselInsert = typeof vesselsMaster.$inferInsert;

function toApiVessel(row: typeof vesselsMaster.$inferSelect) {
  return {
    imo: row.imoNumber,
    imoNumber: row.imoNumber,
    mmsi: row.mmsi,
    name: row.vesselName,
    vesselName: row.vesselName,
    shipType: row.shipType,
    latitude: row.latitude,
    longitude: row.longitude,
    speed: row.speed,
    course: row.course,
    heading: row.heading,
    navigationalStatus: row.navigationalStatus,
    destination: row.destination,
    eta: row.eta,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
  };
}

export default async (req: Request) => {
  if (req.method === "POST") {
    const payload = await req.json().catch(() => null);
    const vessel = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const imoNumber = String(vessel.imoNumber || vessel.imo || "").trim();
    const latitude = Number(vessel.latitude ?? vessel.lat ?? 0);
    const longitude = Number(vessel.longitude ?? vessel.lon ?? vessel.lng ?? 0);

    if (!imoNumber || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json(
        { success: false, error: "imoNumber, latitude and longitude are required for database insertion" },
        { status: 400 },
      );
    }

    const row: VesselInsert = {
      imoNumber,
      mmsi: vessel.mmsi ? String(vessel.mmsi) : null,
      vesselName: vessel.vesselName || vessel.vessel_name || vessel.name ? String(vessel.vesselName || vessel.vessel_name || vessel.name) : null,
      shipType: vessel.shipType || vessel.ship_type ? String(vessel.shipType || vessel.ship_type) : null,
      latitude,
      longitude,
      speed: Number.isFinite(Number(vessel.speed)) ? Number(vessel.speed) : null,
      course: Number.isFinite(Number(vessel.course)) ? Number(vessel.course) : null,
      heading: Number.isFinite(Number(vessel.heading)) ? Number(vessel.heading) : null,
      navigationalStatus: vessel.navigationalStatus || vessel.status ? String(vessel.navigationalStatus || vessel.status) : null,
      destination: vessel.destination ? String(vessel.destination) : null,
      eta: vessel.eta ? String(vessel.eta) : null,
      source: "manual",
      rawData: vessel,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    const [saved] = await db
      .insert(vesselsMaster)
      .values(row)
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
      })
      .returning();

    return Response.json({ success: true, data: toApiVessel(saved) }, { status: 201 });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "1000"), 1), 45000);
  const mmsi = url.searchParams.get("mmsi");
  const imo = url.searchParams.get("imo") || url.searchParams.get("imoNumber");
  const search = url.searchParams.get("q") || url.searchParams.get("search");

  const filters = [
    mmsi ? eq(vesselsMaster.mmsi, mmsi) : undefined,
    imo ? eq(vesselsMaster.imoNumber, imo) : undefined,
    search
      ? or(
          ilike(vesselsMaster.vesselName, `%${search}%`),
          ilike(vesselsMaster.imoNumber, `%${search}%`),
          ilike(vesselsMaster.mmsi, `%${search}%`),
        )
      : undefined,
  ].filter(Boolean);

  const query = db
    .select()
    .from(vesselsMaster)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(vesselsMaster.lastSeenAt))
    .limit(limit);

  const rows = await query;
  return Response.json({ success: true, data: rows.map(toApiVessel), source: "database" });
};

export const config: Config = {
  path: "/api/vessels",
};
