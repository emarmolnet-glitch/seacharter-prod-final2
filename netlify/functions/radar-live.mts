import type { Config, Context } from "@netlify/functions";
import {
  AisCoordinatorError,
  getRadarTraffic,
  fetchAisStreamAndNeonFallback,
  persistMerchantFleetInNeon,
} from "./_shared/aisCoordinator.js";
import { getDatabase } from "netlify-database-client";

type BackgroundContext = Context & {
  waitUntil(promise: Promise<unknown>): void;
};

export default async (req: Request, context: BackgroundContext) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const parameters = new URL(req.url).searchParams;
  const lat = parameters.get("lat");
  const lon = parameters.get("lon");
  const radiusValue = Number(parameters.get("radius"));
  const radius = Number.isFinite(radiusValue) ? radiusValue : undefined;

  let result: any;
  try {
    result = await getRadarTraffic(
      lat,
      lon,
      radius,
      { scheduleRefresh: (promise: Promise<unknown>) => context.waitUntil(promise) },
    );
  } catch (error: any) {
    const controlled = error instanceof AisCoordinatorError;
    const errorCode = controlled ? error.code : "RADAR_LIVE_ERROR";

    if (
      ["AIS_BUDGET_EXCEEDED", "AIS_PROVIDER_NOT_CONFIGURED", "AIS_PROVIDER_ERROR", "AIS_PROVIDER_UNAVAILABLE"].includes(errorCode) &&
      lat && lon
    ) {
      console.warn(`[radar-live] Datalastic unavailable (${errorCode}); invoking fetchAisStreamAndNeonFallback...`);
      result = await fetchAisStreamAndNeonFallback({
        lat,
        lon,
        radius: radius ?? 50,
      });
    } else {
      if (!controlled) console.error("[radar-live] Live radar request failed.");
      return Response.json({
        success: false,
        error: controlled ? error.message : "Live radar unavailable",
        code: errorCode,
        details: controlled ? error.details : undefined,
      }, {
        status: controlled ? error.status : 500,
        headers: { "cache-control": "no-store" },
      });
    }
  }

  // --- MODO RECOLECTOR AUTOMÁTICO DE FLOTA MERCANTE (EN SEGUNDO PLANO) ---
  const vessels = Array.isArray(result?.data) ? result.data : [];
  if (vessels.length > 0) {
    context.waitUntil((async () => {
      try {
        const dbUrl = Netlify.env.get("DATABASE_URL") ?? Netlify.env.get("NETLIFY_DATABASE_URL") ?? Netlify.env.get("NETLIFY_DB_URL");
        if (!dbUrl) return;

        const database = getDatabase({ connectionString: dbUrl });
        const pool = database.pool as any;
        const savedCount = await persistMerchantFleetInNeon(vessels, pool);
        console.log(`[Modo Recolector Live] ${savedCount} buques comerciales válidos persistidos en vessels_master.`);
      } catch (dbErr) {
        console.error("[Modo Recolector Live] Error guardando buques comerciales:", dbErr);
      }
    })());
  }
  // ------------------------------------------------------------------------

  return Response.json({ success: true, ...result }, {
    headers: { "cache-control": "no-store" },
  });
};

export const config: Config = {
  path: "/api/radar/live",
  method: "GET",
};