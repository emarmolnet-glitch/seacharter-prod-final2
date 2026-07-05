import type { Config } from "@netlify/functions";
import { isCargoShipType, readVessels, sortByLastSeen, upsertVessels, type VesselRecord } from "./vessel-store.js";

function toApiVessel(row: VesselRecord) {
  return {
    imo: row.imoNumber,
    imoNumber: row.imoNumber,
    mmsi: row.mmsi,
    name: row.vesselName,
    vesselName: row.vesselName,
    shipType: row.shipType,
    cargoClass: row.cargoClass,
    vesselClass: row.vesselClass,
    dwt: row.dwt,
    draught: row.draught,
    draft: row.draught,
    designDraft: row.designDraft,
    loadState: row.loadState,
    estado_carga: row.loadState,
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
    predictedDestination: row.predictedDestination,
    predictedDestinationConfidence: row.predictedDestinationConfidence,
    eta: row.eta,
    estimatedEta: row.estimatedEta,
    etaEstimated: row.estimatedEta,
    eta_calculado: row.estimatedEta,
    estimatedEtaTarget: row.estimatedEtaTarget,
    estimatedEtaDistanceNm: row.estimatedEtaDistanceNm,
    estimatedEtaHours: row.estimatedEtaHours,
    estimatedEtaSpeedKnots: row.estimatedEtaSpeedKnots,
    estimatedEtaConfidence: row.estimatedEtaConfidence,
    source: row.source,
    classificationSignals: row.classificationSignals,
    cementCarrierClassification: row.cementCarrierClassification,
    missingData: row.missingData,
    classificationComplete: row.classificationComplete,
    radarSweepCount: row.radarSweepCount,
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
    const shipTypeValue = vessel.shipType ?? vessel.ship_type ?? vessel.ShipType ?? vessel.tipo_buque ?? vessel.tipo ?? vessel.type ?? vessel.radarCategory ?? vessel.cargoClass ?? vessel.vesselClass;
    const shipType = shipTypeValue ? String(shipTypeValue) : null;

    if (!imoNumber || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json(
        { success: false, error: "imoNumber, latitude and longitude are required for vessel storage" },
        { status: 400 },
      );
    }
    if (shipType && !isCargoShipType(shipType)) {
      return Response.json(
        { success: false, error: "Only cargo vessel ship types are accepted for radar vessel storage" },
        { status: 422 },
      );
    }

    const row: VesselRecord = {
      imoNumber,
      mmsi: vessel.mmsi ? String(vessel.mmsi) : null,
      vesselName: vessel.vesselName || vessel.vessel_name || vessel.name ? String(vessel.vesselName || vessel.vessel_name || vessel.name) : null,
      shipType,
      cargoClass: vessel.cargoClass || vessel.radarCategory || vessel.tipo_carga ? String(vessel.cargoClass || vessel.radarCategory || vessel.tipo_carga) : null,
      vesselClass: vessel.vesselClass || vessel.radarCategory || vessel.tipo_buque ? String(vessel.vesselClass || vessel.radarCategory || vessel.tipo_buque) : null,
      draught: Number.isFinite(Number(vessel.draught ?? vessel.draft)) ? Number(vessel.draught ?? vessel.draft) : null,
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
      estimatedEta: vessel.estimatedEta || vessel.etaEstimated || vessel.eta_calculado ? String(vessel.estimatedEta || vessel.etaEstimated || vessel.eta_calculado) : null,
      estimatedEtaTarget: vessel.estimatedEtaTarget ? String(vessel.estimatedEtaTarget) : null,
      estimatedEtaDistanceNm: Number.isFinite(Number(vessel.estimatedEtaDistanceNm)) ? Number(vessel.estimatedEtaDistanceNm) : null,
      estimatedEtaHours: Number.isFinite(Number(vessel.estimatedEtaHours)) ? Number(vessel.estimatedEtaHours) : null,
      estimatedEtaSpeedKnots: Number.isFinite(Number(vessel.estimatedEtaSpeedKnots)) ? Number(vessel.estimatedEtaSpeedKnots) : null,
      estimatedEtaConfidence: vessel.estimatedEtaConfidence ? String(vessel.estimatedEtaConfidence) as VesselRecord["estimatedEtaConfidence"] : null,
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

  return Response.json({ success: true, data: rows.map(toApiVessel), source: "database" });
};

export const config: Config = {
  path: "/api/vessels",
};
