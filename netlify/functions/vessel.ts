import type { Config } from "@netlify/functions";
import {
  findVesselTechnicalRecord,
  upsertVesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import { createCorsHeaders } from "./_shared/cors.js";
import {
  fetchHifleetVessel,
  HifleetConfigurationError,
  normalizeImo,
  resolveVesselByImo,
  serializeVesselRecord,
} from "./_shared/hifleet-vessel.mjs";

const headersFor = (request: Request) => ({
  "cache-control": "no-store",
  ...createCorsHeaders(request, "GET, OPTIONS"),
});

export default async (request: Request) => {
  const headers = headersFor(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers });
  }

  const pathImo = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);
  const imoNumber = normalizeImo(pathImo);
  if (!imoNumber) {
    return Response.json({ success: false, error: "A valid seven-digit IMO is required" }, { status: 400, headers });
  }

  try {
    const result = await resolveVesselByImo({
      imoNumber,
      findCached: (imo) => findVesselTechnicalRecord(imo, null),
      fetchRemote: (imo) => fetchHifleetVessel({ imoNumber: imo }),
      saveRecord: (record) => upsertVesselTechnicalRecord(record, undefined, "VERIFIED_HIFLEET"),
    });
    return Response.json({
      success: true,
      cache: result.cache,
      source: result.cache === "hit" ? "vessels_master" : "hifleet",
      vessel: serializeVesselRecord(result.vessel),
    }, { headers });
  } catch (error) {
    const configurationError = error instanceof HifleetConfigurationError;
    console.error("[vessel] Vessel lookup failed.", {
      imoNumber,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({
      success: false,
      error: configurationError
        ? "Vessel data provider is not configured"
        : "Vessel data provider request failed",
    }, { status: configurationError ? 503 : 502, headers });
  }
};

export const config: Config = {
  path: "/api/vessel/:imo",
};
