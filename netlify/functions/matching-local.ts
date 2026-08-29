import type { Config } from "@netlify/functions";
import { getDatabase } from "netlify-database-client";
import { getLatestScanResults } from "../../db/scan-results.js";
import runAiAisFilter from "./ai-ais-filter.js";
import { enrichDatalasticRadarVessels } from "./_shared/radar-enrichment.mjs";

type AnyRecord = Record<string, unknown>;

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function textValue(...values: unknown[]) {
  const value = firstValue(...values);
  return value === undefined ? undefined : String(value).trim() || undefined;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

export function normalizeNeonScanCandidate(value: unknown): AnyRecord | null {
  const source = asRecord(value);
  if (Object.keys(source).length === 0) return null;
  const vessel = asRecord(source.vessel);
  const ais = asRecord(source.ais);
  const metadata = asRecord(source.MetaData || source.metadata);
  const routing = asRecord(source.routing);

  return {
    ...source,
    imo: textValue(vessel.imo, source.imo, source.IMO, source.imo_number, ais.imo, metadata.IMO),
    mmsi: textValue(vessel.mmsi, source.mmsi, source.MMSI, ais.mmsi, metadata.MMSI),
    vesselName: textValue(
      vessel.vesselName,
      vessel.vessel_name,
      source.vesselName,
      source.vessel_name,
      source.ShipName,
      source.name,
      ais.vesselName,
      metadata.ShipName,
    ),
    vesselType: textValue(
      vessel.vesselClass,
      vessel.specialtyType,
      vessel.vesselType,
      source.vesselType,
      source.vessel_type,
      source.shipType,
      source.type,
      ais.vesselType,
      metadata.ShipType,
    ),
    dwt: numberValue(vessel.dwt, source.dwt, source.DWT, ais.dwt, metadata.dwt, metadata.DWT),
    latitude: numberValue(source.latitude, source.lat, ais.latitude, ais.lat, metadata.latitude, metadata.AIS_Live_Lat),
    longitude: numberValue(source.longitude, source.lon, source.lng, ais.longitude, ais.lon, ais.lng, metadata.longitude, metadata.AIS_Live_Lon),
    speed: numberValue(source.speed, source.sog, source.speed_over_ground, ais.speed, ais.speedKts),
    destination: textValue(source.destination, ais.destination, ais.plannedDestination),
    eta: textValue(source.eta, routing.eta, ais.eta, ais.eta_puerto_carga),
    source: "NEON_SCAN_RESULTS",
    source_origin: "NEON_SCAN_RESULTS",
    source_origins: ["NEON_SCAN_RESULTS"],
    data_source: "scan_results",
  };
}

export async function readLatestNeonScan(matchingPayload: AnyRecord = {}) {
  const scan = await getLatestScanResults(matchingPayload);
  return {
    syncId: scan.scanId,
    updatedAt: scan.createdAt,
    vessels: scan.vessels.map(normalizeNeonScanCandidate).filter((vessel): vessel is AnyRecord => vessel !== null),
  };
}

function connectionString() {
  return Netlify.env.get("DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DB_URL");
}

async function listPendingAudit() {
  const databaseUrl = connectionString();
  if (!databaseUrl) return [];
  const database = getDatabase({ connectionString: databaseUrl });
  const pool = database.pool as unknown as {
    query: (query: string, values?: unknown[]) => Promise<{ rows: AnyRecord[] }>;
  };
  const result = await pool.query(
    `SELECT imo_number, mmsi, vessel_name, dwt, vessel_type, draft_meters, flag,
            audit_status, validation_status, process_status
       FROM vessels_master
      WHERE UPPER(COALESCE(audit_status, '')) IN ('PENDING', 'IN_DUE_DILIGENCE')
         OR UPPER(COALESCE(process_status, '')) IN ('PENDING_REVIEW', 'DUE_DILIGENCE')
      ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
      LIMIT 500`,
  );
  return result.rows;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 512 * 1024) {
    return Response.json({ success: false, error: "MATCHING_LOCAL_PAYLOAD_TOO_LARGE" }, { status: 413, headers });
  }

  try {
    const body = asRecord(await req.json());
    const operation = String(body.operation || "validate").toLowerCase();
    const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 1000) : [];

    if (operation === "audit") {
      const vessels = await listPendingAudit();
      return Response.json({ success: true, operation, readOnly: true, count: vessels.length, vessels }, { headers });
    }

    const matchingPayload = asRecord(body.matchingPayload);

    if (operation === "snapshot") {
      const activeScan = await readLatestNeonScan(matchingPayload);
      return Response.json({
        success: true,
        available: activeScan.vessels.length > 0,
        operation,
        source: "neon_scan_results",
        scanId: activeScan.syncId,
        scanUpdatedAt: activeScan.updatedAt,
        count: activeScan.vessels.length,
        vessels: activeScan.vessels,
      }, { headers });
    }

    if (operation === "execute") {
      const activeScan = await readLatestNeonScan(matchingPayload);
      const sourceCounts = {
        activeScan: activeScan.vessels.length,
        liveRadar: activeScan.vessels.length,
        technicalMatches: activeScan.vessels.filter((vessel) => numberValue(vessel.dwt) !== undefined).length,
      };
      if (activeScan.vessels.length === 0) {
        return Response.json({
          success: true,
          operation,
          source: "neon_scan_results",
          syncId: activeScan.syncId,
          scanUpdatedAt: activeScan.updatedAt,
          sourceCounts,
          data: [],
          matches: [],
          count: 0,
          liveRadarVesselCount: 0,
          technicalMatchCount: 0,
          message: "La última búsqueda activa de Neon no contiene candidatos",
        }, { headers });
      }

      const scoringRequest = new Request(new URL("/api/ai-ais-filter", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...matchingPayload,
          radarSnapshot: activeScan.vessels,
          searchMode: "neon_scan_results",
          syncId: activeScan.syncId,
          frozenAt: activeScan.updatedAt || new Date().toISOString(),
        }),
      });
      const scoringResponse = await runAiAisFilter(scoringRequest);
      const scoringResult = asRecord(await scoringResponse.json());
      const data = Array.isArray(scoringResult.data) ? scoringResult.data : [];
      const matches = Array.isArray(scoringResult.matches) ? scoringResult.matches : [];
      return Response.json({
        ...scoringResult,
        success: scoringResponse.ok && scoringResult.success !== false,
        operation,
        source: "neon_scan_results",
        syncId: activeScan.syncId,
        scanUpdatedAt: activeScan.updatedAt,
        sourceCounts,
        data,
        matches,
        count: data.length,
        liveRadarVesselCount: sourceCounts.liveRadar,
        technicalMatchCount: sourceCounts.technicalMatches,
        allowedSources: ["NEON_SCAN_RESULTS"],
        readOnly: true,
      }, { status: scoringResponse.status, headers });
    }

    const enrichment = await enrichDatalasticRadarVessels(candidates);
    const sourceCounts = enrichment.counts;
    const validated = enrichment.vessels.filter((vessel) => vessel.technicalMatch === true);
    const unknown = enrichment.vessels.filter((vessel) => vessel.technicalMatch !== true);

    // --- MODO RECOLECTOR AUTOMÁTICO ---
    if (unknown.length > 0) {
        try {
            console.log(`[Modo Recolector] Detectados ${unknown.length} buques nuevos en radar. Procesando inserción...`);
            
            const databaseUrl = connectionString();
            if (databaseUrl) {
                const database = getDatabase({ connectionString: databaseUrl });
                const pool = database.pool as unknown as { query: (query: string, values?: unknown[]) => Promise<{ rows: AnyRecord[] }> };

                await Promise.all(unknown.map(async (ship) => {
                    const imoClean = String(ship.imo || '').replace(/\D/g, '');
                    if (imoClean.length === 7) {
                        const vesselName = String(ship.name || ship.vesselName || 'UNKNOWN').trim().toUpperCase();
                        const vesselType = String(ship.type || ship.vesselType || 'UNKNOWN').trim().toUpperCase();
                        const dwt = Number(ship.dwt) || null;

                        // Insertamos el barco y lo mandamos directo a la cartera (Blindados)
                        await pool.query(`
                            INSERT INTO vessels_master (imo_number, vessel_name, vessel_type, dwt, process_status, audit_status, validation_status)
                            VALUES ($1, $2, $3, $4, 'COMPLETED', 'VALIDATED', 'VALIDATED')
                            ON CONFLICT (imo_number) DO NOTHING
                        `, [imoClean, vesselName, vesselType, dwt]);
                    }
                }));
            }
        } catch (dbErr) {
            console.error("[Modo Recolector] Error al guardar buques automáticos:", dbErr);
        }
    }
    // ----------------------------------

    return Response.json({
        success: true,
        operation: "validate",
        source: "datalastic_radar",
        sourceCounts,
        count: enrichment.vessels.length,
        validated,
        unknown,
    }, { headers });
  } catch (error) {
    console.error("[matching-local] Radar snapshot processing failed.", error instanceof Error ? error.message : String(error));
    return Response.json({ success: false, error: "MATCHING_LOCAL_PROCESSING_FAILED" }, { status: 500, headers });
  }
};

export const config: Config = {
  path: "/api/matching-local",
  method: "POST",
};
