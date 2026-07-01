import type { Config } from "@netlify/functions";
import { readVessels, sortByLastSeen, upsertVessels, type VesselRecord } from "./vessel-store.js";

function toApiVessel(row: VesselRecord) {
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
    Destination: row.destination,
    destino_actual: row.destination,
    lastPortOfCall: row.lastPortOfCall,
    last_port_of_call: row.lastPortOfCall,
    ultimo_puerto: row.lastPortOfCall,
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
        { success: false, error: "imoNumber, latitude and longitude are required for vessel storage" },
        { status: 400 },
      );
    }

    const row: VesselRecord = {
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
      lastPortOfCall: vessel.lastPortOfCall || vessel.last_port_of_call || vessel.ultimo_puerto || vessel.lastPort
        ? String(vessel.lastPortOfCall || vessel.last_port_of_call || vessel.ultimo_puerto || vessel.lastPort)
        : null,
      eta: vessel.eta ? String(vessel.eta) : null,
      source: "manual",
      rawData: vessel,
      lastSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await upsertVessels([row]);
    const saved = (await readVessels()).find((vesselRow) => vesselRow.imoNumber === row.imoNumber) || row;

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

  const normalizedSearch = search?.toLowerCase();
  const rows = sortByLastSeen(await readVessels())
    .filter((row) => !mmsi || row.mmsi === mmsi)
    .filter((row) => !imo || row.imoNumber === imo)
    .filter((row) => {
      if (!normalizedSearch) return true;
      return [row.vesselName, row.imoNumber, row.mmsi]
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    })
    .slice(0, limit);

  return Response.json({ success: true, data: rows.map(toApiVessel), source: "blobs" });
};

export const config: Config = {
  path: "/api/vessels",
};
