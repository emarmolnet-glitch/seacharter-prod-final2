import type { Config } from "@netlify/functions";
import {
  AisCoordinatorError,
  getDatalasticCreditSnapshot,
  getLivePosition,
  getRadarTraffic,
} from "./_shared/aisCoordinator.js";

function errorResponse(error: unknown) {
  const controlled = error instanceof AisCoordinatorError;
  if (!controlled) console.error("[ais-coordinator] AIS request failed.");
  return Response.json({
    success: false,
    error: controlled ? error.message : "AIS coordinator request failed",
    code: controlled ? error.code : "AIS_INTERNAL_ERROR",
    details: controlled ? error.details : undefined,
  }, {
    status: controlled ? error.status : 500,
    headers: { "cache-control": "no-store" },
  });
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith("/consumption")) {
      return Response.json({ success: true, data: await getDatalasticCreditSnapshot() }, {
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.pathname.endsWith("/live-position")) {
      const result = await getLivePosition(url.searchParams.get("imo"));
      return Response.json({ success: true, ...result }, {
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.pathname.endsWith("/radar-traffic")) {
      const result = await getRadarTraffic(
        url.searchParams.get("lat"),
        url.searchParams.get("lon"),
        url.searchParams.get("radius") || undefined,
      );
      return Response.json({ success: true, ...result }, {
        headers: { "cache-control": "no-store" },
      });
    }
    return Response.json({ success: false, error: "AIS route not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config: Config = {
  path: [
    "/api/internal/ais/live-position",
    "/api/internal/ais/radar-traffic",
    "/api/internal/ais/consumption",
  ],
  method: "GET",
};
