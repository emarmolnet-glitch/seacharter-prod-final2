import type { Config } from "@netlify/functions";
import {
  findExactVesselsMasterRows,
  listLocalVesselsMaster,
  listVesselsMasterPendingAudit,
  type VesselMasterRow,
} from "../../db/vessels-master.js";
import runAiAisFilter from "./ai-ais-filter.js";

type AnyRecord = Record<string, unknown>;

const headers = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function textValue(...values: unknown[]) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined || value === null ? "" : String(value).trim();
}

function numericValue(...values: unknown[]) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function normalizeText(value: unknown) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCandidate(value: unknown, index: number) {
  const candidate = asRecord(value);
  const metadata = asRecord(candidate.MetaData);
  return {
    candidateId: textValue(candidate.candidateId, candidate.id, candidate.storageKey) || `candidate-${index + 1}`,
    imo: textValue(candidate.imo, candidate.IMO, candidate.imoNumber, candidate.imo_number, metadata.IMO),
    mmsi: textValue(candidate.mmsi, candidate.MMSI, metadata.MMSI),
    vesselName: textValue(candidate.vesselName, candidate.vessel_name, candidate.name, candidate.ShipName, metadata.ShipName) || `Buque ${index + 1}`,
    vesselType: textValue(candidate.vesselType, candidate.vessel_type, candidate.shipType, candidate.ShipType, candidate.tipo_buque, candidate.tipo, metadata.ShipType),
    dwt: numericValue(candidate.dwt, candidate.DWT, metadata.dwt, metadata.DWT),
    source: candidate,
  };
}

function serializeMasterVessel(row: VesselMasterRow) {
  const sourcePayload = asRecord(row.source_payload);
  return {
    ...sourcePayload,
    imo: row.imo_number,
    IMO: row.imo_number,
    imoNumber: row.imo_number,
    mmsi: row.mmsi,
    MMSI: row.mmsi,
    vesselName: row.vessel_name,
    vessel_name: row.vessel_name,
    vesselType: row.vessel_type,
    vessel_type: row.vessel_type,
    shipType: row.vessel_type,
    dwt: row.dwt,
    DWT: row.dwt,
    latitude: row.latitude,
    longitude: row.longitude,
    draft: row.draft_meters,
    flag: row.flag,
    eta: row.eta,
    lastPortOfCall: row.last_port,
    currentDestination: row.current_destination,
    destination: row.current_destination,
    yearBuilt: row.year_built,
    ownerManager: row.owner_manager,
    hasGears: row.has_gears,
    processStatus: row.process_status,
    cacheStatus: "Caché Validada",
    cacheValidated: true,
    masterUpdatedAt: new Date(row.updated_at).toISOString(),
  };
}

function findExactMasterRow(candidate: ReturnType<typeof normalizeCandidate>, rows: VesselMasterRow[]) {
  const candidateName = normalizeText(candidate.vesselName);
  return rows.find((row) => candidate.imo && row.imo_number === candidate.imo)
    || rows.find((row) => candidate.mmsi && row.mmsi === candidate.mmsi)
    || rows.find((row) => candidateName && normalizeText(row.vessel_name) === candidateName)
    || null;
}

async function loadExactCandidates(candidates: ReturnType<typeof normalizeCandidate>[]) {
  const imoNumbers = [...new Set(candidates.map((candidate) => candidate.imo).filter(Boolean))];
  const mmsiNumbers = [...new Set(candidates.map((candidate) => candidate.mmsi).filter(Boolean))];
  const vesselNames = [...new Set(candidates.map((candidate) => normalizeText(candidate.vesselName)).filter(Boolean))];
  if (imoNumbers.length === 0 && mmsiNumbers.length === 0 && vesselNames.length === 0) return [];

  return findExactVesselsMasterRows(imoNumbers, mmsiNumbers, vesselNames);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  try {
    const body = asRecord(await req.json());
    const operation = textValue(body.operation) || "match";
    const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
      .slice(0, 2000)
      .map(normalizeCandidate);

    if (operation === "execute") {
      const matchingPayload = asRecord(body.matchingPayload);
      const localRows = await listLocalVesselsMaster(6000);
      const localVessels = localRows.map(serializeMasterVessel);
      if (localVessels.length === 0) {
        return Response.json({
          success: true,
          operation: "execute",
          source: "vessels_master",
          readOnly: true,
          data: [],
          matches: [],
          count: 0,
          localVesselCount: 0,
          message: "No se encontraron coincidencias locales",
        }, { headers });
      }

      const scoringRequest = new Request(new URL("/api/ai-ais-filter", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...matchingPayload,
          radarSnapshot: localVessels,
          searchMode: "local_database",
          frozenAt: new Date().toISOString(),
        }),
      });
      const scoringResponse = await runAiAisFilter(scoringRequest);
      const scoringResult = asRecord(await scoringResponse.json());
      const matches = Array.isArray(scoringResult.data) ? scoringResult.data : [];
      return Response.json({
        ...scoringResult,
        success: scoringResponse.ok && scoringResult.success !== false,
        operation: "execute",
        source: "vessels_master",
        readOnly: true,
        data: matches,
        matches,
        count: matches.length,
        localVesselCount: localVessels.length,
        message: matches.length > 0 ? "Coincidencias locales calculadas" : "No se encontraron coincidencias locales",
      }, { status: scoringResponse.status, headers });
    }

    if (operation === "audit") {
      const auditRows = await listVesselsMasterPendingAudit();
      return Response.json({
        success: true,
        operation: "audit",
        readOnly: true,
        count: auditRows.length,
        vessels: auditRows,
      }, { headers });
    }

    const rows = await loadExactCandidates(candidates);
    const validated = [];
    const unknown = [];
    for (const candidate of candidates) {
      const matchedRow = findExactMasterRow(candidate, rows);
      if (matchedRow) {
        validated.push({
          candidateId: candidate.candidateId,
          status: "Caché Validada",
          vessel: serializeMasterVessel(matchedRow),
        });
      } else {
        unknown.push({
          ...candidate,
          status: "Desconocido",
          source: undefined,
        });
      }
    }

    return Response.json({
      success: true,
      operation: "match",
      source: "vessels_master",
      readOnly: true,
      stopped: unknown.length > 0,
      status: unknown.length > 0 ? "Desconocido" : "Caché Validada",
      validated,
      unknown,
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar vessels_master.";
    console.error("[matching-local] Read-only query failed.", message);
    return Response.json({ success: false, error: message }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/matching-local",
  method: "POST",
};
