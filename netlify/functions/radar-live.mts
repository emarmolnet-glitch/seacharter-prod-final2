import type { Config, Context } from "@netlify/functions";
import { AisCoordinatorError, getRadarTraffic } from "./_shared/aisCoordinator.js";

type BackgroundContext = Context & {
  waitUntil(promise: Promise<unknown>): void;
};

export default async (req: Request, context: BackgroundContext) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const parameters = new URL(req.url).searchParams;
    const radiusValue = Number(parameters.get("radius"));
    const result = await getRadarTraffic(
      parameters.get("lat"),
      parameters.get("lon"),
      Number.isFinite(radiusValue) ? radiusValue : undefined,
      { scheduleRefresh: (promise: Promise<unknown>) => context.waitUntil(promise) },
    );
    return Response.json({ success: true, ...result }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const controlled = error instanceof AisCoordinatorError;
    if (!controlled) console.error("[radar-live] Live radar request failed.");
    return Response.json({
      success: false,
      error: controlled ? error.message : "Live radar unavailable",
      code: controlled ? error.code : "RADAR_LIVE_ERROR",
      details: controlled ? error.details : undefined,
    }, {
      status: controlled ? error.status : 500,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/radar/live",
  method: "GET",
};
