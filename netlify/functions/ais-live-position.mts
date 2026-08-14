import type { Config } from "@netlify/functions";
import { AisCoordinatorError, getLivePosition } from "./_shared/aisCoordinator.js";

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const imo = new URL(req.url).searchParams.get("imo");
    const result = await getLivePosition(imo);
    return Response.json({ success: true, ...result }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const controlled = error instanceof AisCoordinatorError;
    if (!controlled) console.error("[ais-live-position] Shadow AIS request failed.");
    return Response.json({
      success: false,
      error: controlled ? error.message : "AIS live position request failed",
      code: controlled ? error.code : "AIS_INTERNAL_ERROR",
      details: controlled ? error.details : undefined,
    }, {
      status: controlled ? error.status : 500,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/internal/ais/live-position",
  method: "GET",
};
