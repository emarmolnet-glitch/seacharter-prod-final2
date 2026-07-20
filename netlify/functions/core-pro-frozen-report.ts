import type { Config } from "@netlify/functions";
import { upsertRadarVesselsMaster, type RadarVesselMasterInput } from "../../db/vessels-master-sync.js";
import {
  getFleetRow,
  getFleetRowBySyncId,
  normalizeSessionSyncVessels,
  SESSION_SYNC_ACTION_MODULE,
  SESSION_SYNC_USER_ID,
  type SessionSyncData,
  upsertSessionSync,
} from "../../db/session-sync.js";
import { createCorsHeaders } from "./_shared/cors.js";

const MAX_REPORT_BYTES = 10 * 1024 * 1024;

const cacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readContentLength(req: Request) {
  const contentLength = Number(req.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function textValue(...values: unknown[]) {
  const value = firstValue(...values);
  return value === undefined ? null : String(value).trim() || null;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function toMasterVessel(value: unknown): RadarVesselMasterInput | null {
  if (!isObject(value)) return null;
  const vessel = isObject(value.vessel) ? value.vessel : {};
  const ais = isObject(value.ais) ? value.ais : {};
  const routing = isObject(value.routing) ? value.routing : {};
  const metadata = isObject(value.MetaData) ? value.MetaData : {};
  const latitude = numberValue(value.latitude, value.lat, ais.latitude, ais.lat, metadata.latitude, metadata.AIS_Live_Lat);
  const longitude = numberValue(value.longitude, value.lon, value.lng, ais.longitude, ais.lon, ais.lng, metadata.longitude, metadata.AIS_Live_Lon);
  if (latitude === null || longitude === null) return null;

  return {
    imoNumber: textValue(vessel.imo, vessel.IMO, value.imo, value.IMO, value.imo_number, ais.imo, metadata.IMO),
    mmsi: textValue(vessel.mmsi, value.mmsi, value.MMSI, ais.mmsi, metadata.MMSI),
    vesselName: textValue(vessel.vesselName, vessel.vessel_name, value.vesselName, value.vessel_name, value.ShipName, value.name, metadata.ShipName),
    shipType: textValue(vessel.vesselClass, vessel.specialtyType, vessel.shipType, value.vessel_type, value.shipType, value.ShipType, metadata.ShipType),
    draught: numberValue(vessel.draft, vessel.draught, value.draft, value.draught, ais.draft),
    dwt: numberValue(vessel.dwt, value.dwt, ais.dwt),
    latitude,
    longitude,
    destination: textValue(vessel.destination, value.destination, value.Destination, ais.destination, ais.plannedDestination),
    lastPortOfCall: textValue(value.lastPortOfCall, value.last_port_of_call, ais.lastPortOfCall, ais.ultimo_puerto),
    eta: textValue(routing.eta, value.eta, ais.eta, ais.eta_puerto_carga),
    source: "Core PRO / Data Bridge",
    rawData: value,
    flag: textValue(vessel.flag, value.flag, ais.flag),
    yearBuilt: numberValue(vessel.builtYear, vessel.built_year, value.year_built),
    ownerManager: textValue(vessel.owner, vessel.manager, vessel.operator, value.owner_manager),
    hasGears: typeof vessel.hasCranes === "boolean" ? vessel.hasCranes : null,
    processStatus: "SYNCED",
    systemIdentity: textValue(value.candidateId, value.storageKey, value.id, vessel.vesselName, vessel.vessel_name, value.vesselName, value.vessel_name, value.name),
  };
}

function generateSyncId() {
  return crypto.randomUUID();
}

function normalizeReport(payload: Record<string, unknown>): { report?: SessionSyncData; error?: string } {
  if (!Array.isArray(payload.vessels) || payload.vessels.length === 0) {
    return { error: "vessels must be a non-empty array" };
  }

  const normalizedVessels = normalizeSessionSyncVessels(payload.vessels);
  if (normalizedVessels.invalidCoordinateIndex >= 0) {
    return { error: `vessels[${normalizedVessels.invalidCoordinateIndex}] must include valid latitude and longitude` };
  }

  const incomingSyncId = typeof payload.syncId === "string" && payload.syncId.trim()
    ? payload.syncId
    : typeof payload.sync_id === "string" && payload.sync_id.trim()
      ? payload.sync_id
      : generateSyncId();

  const createdAt = typeof payload.created_at === "string" && !Number.isNaN(Date.parse(payload.created_at))
    ? payload.created_at
    : new Date().toISOString();

  const canonicalPayload = { ...payload };
  delete canonicalPayload.sync_id;

  return {
    report: {
      ...canonicalPayload,
      format: "v2",
      source: "Core PRO",
      syncId: incomingSyncId.trim(),
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      vessels: normalizedVessels.vessels,
    },
  };
}

export default async (req: Request) => {
  const headers = {
    ...cacheHeaders,
    ...createCorsHeaders(req, "GET, POST, PUT, OPTIONS"),
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method === "GET") {
    const requestedSyncId = new URL(req.url).searchParams.get("sync_id")?.trim()
      || new URL(req.url).searchParams.get("syncId")?.trim()
      || "";
    const savedReport = requestedSyncId
      ? await getFleetRowBySyncId(requestedSyncId)
      : await getFleetRow();
    const report = savedReport?.lastSyncData;

    if (!report || !Array.isArray(report.vessels)) {
      return Response.json({
        success: true,
        available: false,
        message: "Reporte no disponible",
        syncId: requestedSyncId || null,
        vessels: [],
        vessel_count: 0,
      }, { status: 200, headers });
    }

    return Response.json({
      ...report,
      success: true,
      available: report.vessels.length > 0,
      vessel_count: report.vessels.length,
    }, { status: 200, headers });
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const contentLength = readContentLength(req);
  if (contentLength !== null && contentLength > MAX_REPORT_BYTES) {
    return Response.json({
      success: false,
      error: "El reporte supera el límite de 10 MB.",
    }, { status: 413, headers });
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REPORT_BYTES) {
      return Response.json({
        success: false,
        error: "El reporte supera el límite de 10 MB.",
      }, { status: 413, headers });
    }

    const payload = JSON.parse(rawBody) as unknown;
    if (!isObject(payload)) {
      return Response.json({ success: false, error: "A JSON object is required" }, { status: 400, headers });
    }

    const normalized = normalizeReport(payload);
    if (!normalized.report) {
      return Response.json({
        success: false,
        error: normalized.error || "Invalid frozen report",
      }, { status: 400, headers });
    }
    const report = normalized.report;

    const savedSync = await upsertSessionSync({
      userId: SESSION_SYNC_USER_ID,
      lastSyncData: report,
      lastActionModule: SESSION_SYNC_ACTION_MODULE,
    });

    const committedSync = await getFleetRowBySyncId(report.syncId || "");
    const savedVessels = committedSync?.lastSyncData.vessels;
    if (
      savedSync.syncId !== report.syncId
      || committedSync?.syncId !== report.syncId
      || !Array.isArray(savedVessels)
      || savedVessels.length !== report.vessels.length
    ) {
      throw new Error("The persisted vessel array does not match the uploaded report.");
    }

    const masterRows = savedVessels.map(toMasterVessel).filter((vessel): vessel is RadarVesselMasterInput => vessel !== null);
    const masterPersistedCount = await upsertRadarVesselsMaster(masterRows);

    return Response.json({
      ...committedSync!.lastSyncData,
      success: true,
      available: true,
      vessel_count: savedVessels.length,
      masterPersistedCount,
    }, { status: 200, headers });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers });
    }

    console.error("[core-pro-frozen-report] Failed to persist the complete report.", error);
    return Response.json({
      success: false,
      error: "Core PRO frozen report persistence failed",
    }, { status: 500, headers });
  }
};

export const config: Config = {
  path: ["/api/core-pro-frozen-report", "/.netlify/functions/core-pro-frozen-report"],
};
