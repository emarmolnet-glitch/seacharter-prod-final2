import type { Config } from "@netlify/functions";
import { getDatabase } from "netlify-database-client";
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

    const enrichment = await enrichDatalasticRadarVessels(candidates);
    const sourceCounts = enrichment.counts;

    if (operation === "execute") {
      if (enrichment.vessels.length === 0) {
        return Response.json({
          success: true,
          operation,
          source: "datalastic_radar",
          sourceCounts,
          data: [],
          matches: [],
          count: 0,
          liveRadarVesselCount: 0,
          technicalMatchCount: 0,
          message: "El snapshot Datalastic no contiene buques",
        }, { headers });
      }

      const matchingPayload = asRecord(body.matchingPayload);
      const scoringRequest = new Request(new URL("/api/ai-ais-filter", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...matchingPayload,
          radarSnapshot: enrichment.vessels,
          searchMode: "datalastic_radar_snapshot",
          frozenAt: new Date().toISOString(),
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
        source: "datalastic_radar",
        sourceCounts,
        data,
        matches,
        count: data.length,
        liveRadarVesselCount: sourceCounts.liveRadar,
        technicalMatchCount: sourceCounts.technicalMatches,
        allowedSources: ["DATALASTIC"],
        readOnly: true,
      }, { status: scoringResponse.status, headers });
    }

    const validated = enrichment.vessels.filter((vessel) => vessel.technicalMatch === true);
    const unknown = enrichment.vessels.filter((vessel) => vessel.technicalMatch !== true);
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
