import type { Config } from "@netlify/functions";
import { AisCoordinatorError, getRadarTraffic } from "./_shared/aisCoordinator.js";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const parameters = new URL(req.url).searchParams;
    const result = await getRadarTraffic(
      parameters.get("lat"),
      parameters.get("lon"),
      parameters.get("radius") || undefined,
    );
    return Response.json({ success: true, ...result }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const controlled = error instanceof AisCoordinatorError;
    if (!controlled) console.error("[ais-radar-traffic] Shadow AIS request failed.");
    return Response.json({
      success: false,
      error: controlled ? error.message : "AIS radar traffic request failed",
      code: controlled ? error.code : "AIS_INTERNAL_ERROR",
      details: controlled ? error.details : undefined,
    }, {
      status: controlled ? error.status : 500,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/internal/ais/radar-traffic",
  method: "GET",
};
