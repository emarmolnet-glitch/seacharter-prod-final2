import type { Config } from "@netlify/functions";
import {
  findVesselTechnicalRecord,
  upsertVesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import { createCorsHeaders } from "./_shared/cors.js";
import { AisCoordinatorError, getVesselParticulars } from "./_shared/aisCoordinator.js";
import {
  normalizeImo,
  resolveVesselByImo,
  serializeVesselRecord,
} from "./_shared/vessel-lookup.mjs";

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

  const url = new URL(request.url);
  const pathImo = url.pathname.split("/").filter(Boolean).at(-1);
  const queryImo = url.searchParams.get("imo") || url.searchParams.get("imo_number") || url.searchParams.get("q");
  const imoNumber = normalizeImo(queryImo || pathImo);
  if (!imoNumber) {
    return Response.json({ success: false, error: "A valid seven-digit IMO is required" }, { status: 400, headers });
  }

  try {
    const result = await resolveVesselByImo({
      imoNumber,
      findInDatabase: async (imo: number) => {
        try {
          return await findVesselTechnicalRecord(imo, null, null);
        } catch (error) {
          console.error("[vessel] Neon lookup failed; Datalastic fallback aborted.", {
            imo: String(imo),
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          throw new LocalDatabaseLookupError(error);
        }
      },
      fetchFromDatalastic: (imo: number) => getVesselParticulars(String(imo)),
      saveRecord: (record: Parameters<typeof upsertVesselTechnicalRecord>[0]) => (
        upsertVesselTechnicalRecord(record, undefined, "VERIFIED_DATALASTIC")
      ),
    });
    return Response.json({
      success: true,
      cache: result.cache,
      source: result.cache === "hit" ? "vessels_master" : "datalastic",
      creditsConsumed: result.cache === "hit" || result.providerMeta?.cacheStatus !== "MISS" ? 0 : 1,
      providerCacheStatus: result.providerMeta?.cacheStatus ?? null,
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

    const coordinatorError = error instanceof AisCoordinatorError;
    const providerStatus = coordinatorError ? error.status : undefined;
    console.error("[vessel] Vessel lookup failed.", {
      imoNumber,
      errorName: error instanceof Error ? error.name : "UnknownError",
      providerStatus,
    });
    return Response.json({
      success: false,
      error: coordinatorError ? error.message : "Vessel lookup or persistence failed",
    }, { status: coordinatorError ? error.status : 500, headers });
  }
};

export const config: Config = {
  path: "/api/vessel/:imo",
};
