import type { Config } from "@netlify/functions";
import {
  findVesselMasterTableByImo,
  upsertVesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import { createCorsHeaders } from "./_shared/cors.js";
import {
  fetchHifleetVessel,
  formatHifleetApiError,
  HifleetConfigurationError,
  HifleetUpstreamError,
  normalizeImo,
  resolveVesselByImo,
  serializeVesselRecord,
} from "./_shared/hifleet-vessel.mjs";

const headersFor = (request: Request) => ({
  "cache-control": "no-store",
  ...createCorsHeaders(request, "GET, OPTIONS"),
});

class LocalDatabaseLookupError extends Error {
  databaseError: unknown;

  constructor(databaseError: unknown) {
    super("Local vessel database lookup failed");
    this.name = "LocalDatabaseLookupError";
    this.databaseError = databaseError;
  }
}

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
      findCached: async (imo: number) => {
        try {
          return await findVesselMasterTableByImo(String(imo));
        } catch (error) {
          console.error("[vessel] Local Neon cache lookup failed; HiFleet fallback aborted.", {
            imo: String(imo),
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw new LocalDatabaseLookupError(error);
        }
      },
      fetchRemote: (imo: number) => fetchHifleetVessel({ imoNumber: imo }),
      saveRecord: (record: Parameters<typeof upsertVesselTechnicalRecord>[0]) => (
        upsertVesselTechnicalRecord(record, undefined, "VERIFIED_HIFLEET")
      ),
    });
    return Response.json({
      success: true,
      cache: result.cache,
      source: result.cache === "hit" ? "vessels_master_table" : "hifleet",
      vessel: serializeVesselRecord(result.vessel),
    }, { headers });
  } catch (error) {
    if (error instanceof LocalDatabaseLookupError) {
      const databaseMessage = error.databaseError instanceof Error
        ? error.databaseError.message
        : String(error.databaseError);
      return Response.json({
        success: false,
        error: "Local vessel database lookup failed",
        databaseError: databaseMessage,
      }, { status: 500, headers });
    }

    const configurationError = error instanceof HifleetConfigurationError;
    const upstreamError = error instanceof HifleetUpstreamError;
    const providerStatus = upstreamError
      && typeof error === "object"
      && error !== null
      && "status" in error
      ? (error as { status?: number }).status
      : undefined;
    console.error("[vessel] Vessel lookup failed.", {
      imoNumber,
      errorName: error instanceof Error ? error.name : "UnknownError",
      providerStatus,
    });
    return Response.json({
      success: false,
      error: configurationError
        ? "Vessel data provider is not configured"
        : upstreamError
          ? formatHifleetApiError(error)
          : "Vessel data provider request failed",
    }, { status: configurationError ? 503 : upstreamError ? 502 : 500, headers });
  }
};

export const config: Config = {
  path: "/api/vessel/:imo",
};
