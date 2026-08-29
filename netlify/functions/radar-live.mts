import type { Config, Context } from "@netlify/functions";
import { AisCoordinatorError, getRadarTraffic } from "./_shared/aisCoordinator.js";
import { getDatabase } from "netlify-database-client";

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

    // --- MODO RECOLECTOR AUTOMÁTICO (EN SEGUNDO PLANO) ---
    const vessels = Array.isArray(result.data) ? result.data : [];
    if (vessels.length > 0) {
        context.waitUntil((async () => {
            try {
                const dbUrl = Netlify.env.get("DATABASE_URL") ?? Netlify.env.get("NETLIFY_DATABASE_URL") ?? Netlify.env.get("NETLIFY_DB_URL");
                if (!dbUrl) return;
                
                const database = getDatabase({ connectionString: dbUrl });
                const pool = database.pool as any;
                
                await Promise.all(vessels.map(async (ship: any) => {
                    const imoClean = String(ship.imo || '').replace(/\D/g, '');
                    if (imoClean.length === 7) {
                        const vesselName = String(ship.name || ship.vesselName || ship.vessel_name || 'UNKNOWN').trim().toUpperCase();
                        const vesselType = String(ship.type || ship.vesselType || ship.vesselClass || 'UNKNOWN').trim().toUpperCase();
                        const dwt = Number(ship.dwt) || null;

                        await pool.query(`
                            INSERT INTO vessels_master (imo_number, vessel_name, vessel_type, dwt, process_status, audit_status, validation_status)
                            VALUES ($1, $2, $3, $4, 'COMPLETED', 'VALIDATED', 'VALIDATED')
                            ON CONFLICT (imo_number) DO NOTHING
                        `, [imoClean, vesselName, vesselType, dwt]);
                    }
                }));
                console.log(`[Modo Recolector Live] ${vessels.length} buques procesados y guardados en la base de datos.`);
            } catch (dbErr) {
                console.error("[Modo Recolector Live] Error guardando buques:", dbErr);
            }
        })());
    }
    // ----------------------------------------------------

    return Response.json({ success: true, ...result }, {
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/radar/live",
  method: "GET",
};
