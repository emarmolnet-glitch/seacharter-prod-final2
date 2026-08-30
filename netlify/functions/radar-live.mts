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

    // --- MODO RECOLECTOR AUTOMÁTICO DE FLOTA MERCANTE (EN SEGUNDO PLANO) ---
    const vessels = Array.isArray(result.data) ? result.data : [];
    if (vessels.length > 0) {
        context.waitUntil((async () => {
            try {
                const dbUrl = Netlify.env.get("DATABASE_URL") ?? Netlify.env.get("NETLIFY_DATABASE_URL") ?? Netlify.env.get("NETLIFY_DB_URL");
                if (!dbUrl) return;
                
                const database = getDatabase({ connectionString: dbUrl });
                const pool = database.pool as any;

                const STRICT_NOISE_RE = /\b(fishing|pesquero|pesca|trawler|tug|tugboat|remolcador|remolque|pusher|passenger|cruise|ferry|pleasure|yacht|sailing|dredger|vts|mark|point|danger|buoy|boya|military|sar|rescue|pilot|workboat|other|unknown)\b/i;
                const STRICT_CARGO_RE = /\b(bulk|bulker|cargo|carguero|coaster|cabotaje|container|tanker|petrolero|quimiquero|heavy load|heavy lift|break bulk|breakbulk|ro-ro|roro|cement|cementero|clinker|mpp|mpv|mmpp|freighter|merchant)\b/i;
                
                let savedCount = 0;
                await Promise.all(vessels.map(async (ship: any) => {
                    const rawType = String(ship.type || ship.vesselType || ship.vesselClass || ship.shipType || '').trim().toLowerCase();
                    const numType = Number(ship.type || ship.shipType || ship.ShipType);

                    // Categorical noise check
                    if (STRICT_NOISE_RE.test(rawType)) {
                        return;
                    }

                    // Numeric AIS check
                    if (Number.isFinite(numType) && numType > 0) {
                        if ((numType >= 20 && numType < 70) || numType >= 90) return;
                    }

                    // Cargo whitelist validation
                    const isCargoType = STRICT_CARGO_RE.test(rawType) || (Number.isFinite(numType) && ((numType >= 70 && numType <= 79) || (numType >= 80 && numType <= 89)));
                    const dwt = Number(ship.dwt) || null;
                    if (!isCargoType && (!dwt || dwt < 500)) {
                        return;
                    }

                    const imoClean = String(ship.imo || ship.imo_number || '').replace(/\D/g, '');
                    const mmsiClean = String(ship.mmsi || '').replace(/\D/g, '');
                    const vesselName = String(ship.name || ship.vesselName || ship.vessel_name || (imoClean ? `IMO ${imoClean}` : (mmsiClean ? `MMSI ${mmsiClean}` : 'COMMERCIAL VESSEL'))).trim().toUpperCase();
                    const vesselType = String(ship.type || ship.vesselType || ship.vesselClass || 'GENERAL CARGO').trim().toUpperCase();
                    const lat = Number(ship.lat ?? ship.latitude);
                    const lon = Number(ship.lon ?? ship.lng ?? ship.longitude);
                    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
                    const validLon = Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null;

                    if (imoClean.length === 7) {
                        await pool.query(`
                            INSERT INTO vessels_master (
                              imo_number, vessel_name, vessel_type, dwt, mmsi, latitude, longitude,
                              process_status, audit_status, validation_status, fecha_ultima_actualizacion
                            )
                            VALUES ($1::integer, $2, $3, $4, $5, $6, $7, 'COMPLETED', 'VALIDATED', 'VALIDATED', NOW())
                            ON CONFLICT (imo_number) DO UPDATE SET
                              vessel_name = EXCLUDED.vessel_name,
                              vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
                              dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
                              mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
                              latitude = COALESCE(EXCLUDED.latitude, vessels_master.latitude),
                              longitude = COALESCE(EXCLUDED.longitude, vessels_master.longitude),
                              fecha_ultima_actualizacion = NOW()
                        `, [Number(imoClean), vesselName, vesselType, dwt, mmsiClean || null, validLat, validLon]);
                        savedCount++;
                    } else if (mmsiClean.length === 9) {
                        await pool.query(`
                            UPDATE vessels_master SET
                              vessel_name = $1,
                              vessel_type = COALESCE($2, vessel_type),
                              dwt = COALESCE($3, dwt),
                              latitude = COALESCE($4, latitude),
                              longitude = COALESCE($5, longitude),
                              fecha_ultima_actualizacion = NOW()
                            WHERE mmsi = $6
                        `, [vesselName, vesselType, dwt, validLat, validLon, mmsiClean]);
                    }
                }));
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
  } catch (error: any) {
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