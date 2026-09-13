import type { Config, Context } from "@netlify/functions";
import { desc, isNull, sql } from "drizzle-orm";
import { netlifyDb } from "../../db/netlify.js";
import { voyagesTracking } from "../../db/schema.js";

const phaseLabels: Record<string, string> = {
  APPROACHING_POL: "Aproximación a puerto de carga",
  AT_POL: "En puerto de carga",
  LOADING: "En carga",
  IN_TRANSIT: "En tránsito",
  AT_POD: "En puerto de descarga",
  DISCHARGING: "En descarga",
  COMPLETED: "Completado",
};

const voyageSelection = {
  reference: voyagesTracking.contractRef,
  vesselName: voyagesTracking.vesselName,
  imo: voyagesTracking.imoNumber,
  mmsi: voyagesTracking.mmsi,
  cargoType: voyagesTracking.cargoName,
  cargoQty: voyagesTracking.cargoQuantityMt,
  loadPortCode: voyagesTracking.polCode,
  loadPortName: voyagesTracking.polName,
  loadPortLatitude: voyagesTracking.polLatitude,
  loadPortLongitude: voyagesTracking.polLongitude,
  dischargePortCode: voyagesTracking.podCode,
  dischargePortName: voyagesTracking.podName,
  dischargePortLatitude: voyagesTracking.podLatitude,
  dischargePortLongitude: voyagesTracking.podLongitude,
  laydaysStartAt: voyagesTracking.laydaysStartAt,
  cancellingAt: voyagesTracking.cancellingAt,
  operationalPhase: voyagesTracking.currentStatus,
  currentPhase: voyagesTracking.currentPhase,
  routeProgressPct: voyagesTracking.routeProgressPct,
  updatedAt: voyagesTracking.updatedAt,
};

function port(name: string, code: string | null, latitude: number, longitude: number) {
  return { name, id: code, lat: latitude, lng: longitude, latitude, longitude };
}

export default async (request: Request, context: Context) => {
  if (request.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405 });
  }

  try {
    const contractRef = new URL(request.url).searchParams.get("contractRef")?.trim().toUpperCase();
    const rows = contractRef
      ? await netlifyDb
          .select(voyageSelection)
          .from(voyagesTracking)
          .where(sql`upper(${voyagesTracking.contractRef}) = ${contractRef}`)
          .limit(1)
      : await netlifyDb
          .select(voyageSelection)
          .from(voyagesTracking)
          .where(isNull(voyagesTracking.closedAt))
          .orderBy(desc(voyagesTracking.updatedAt))
          .limit(1);

    let voyage = rows[0];

    // Fallback estructural: si voyages_tracking no tiene el viaje o carece de puertos,
    // recuperar desde charter_dossiers, session_sync o app_state
    if (!voyage || (!voyage.loadPortName && !voyage.dischargePortName)) {
      try {
        const { getPool } = await import("../../db/index.js");
        const pool = getPool();
        const targetRef = contractRef || "";
        let fallbackPol = "";
        let fallbackPod = "";
        let fallbackRef = targetRef;
        let fallbackVessel = "TBA VESSEL";
        let fallbackCargo = "General Cargo";
        let fallbackVolume = 0;

        if (targetRef) {
          const dossierRes = await pool.query(
            `SELECT pol, pod, reference, cargo_name, cargo_volume, updated_at FROM charter_dossiers WHERE upper(reference) = $1 LIMIT 1`,
            [targetRef]
          );
          if (dossierRes.rows[0]) {
            fallbackPol = dossierRes.rows[0].pol || "";
            fallbackPod = dossierRes.rows[0].pod || "";
            fallbackRef = dossierRes.rows[0].reference || targetRef;
            if (dossierRes.rows[0].cargo_name) fallbackCargo = dossierRes.rows[0].cargo_name;
            if (Number(dossierRes.rows[0].cargo_volume) > 0) fallbackVolume = Number(dossierRes.rows[0].cargo_volume);
          }
        }

        if (!fallbackPol && !fallbackPod) {
          const syncRes = targetRef
            ? await pool.query(
                `SELECT sync_id, last_sync_data FROM session_sync WHERE upper(sync_id) = $1 LIMIT 1`,
                [targetRef]
              )
            : await pool.query(
                `SELECT sync_id, last_sync_data FROM session_sync ORDER BY updated_at DESC LIMIT 1`
              );
          if (syncRes.rows[0]) {
            const syncData = (syncRes.rows[0].last_sync_data || {}) as Record<string, any>;
            fallbackPol = syncData.pol || syncData.pol_name || syncData.load_port || syncData.loadPortName || "";
            fallbackPod = syncData.pod || syncData.pod_name || syncData.discharge_port || syncData.dischargePortName || "";
            fallbackRef = syncRes.rows[0].sync_id || targetRef;
            if (syncData.vessel_name) fallbackVessel = syncData.vessel_name;
            if (syncData.cargo_name) fallbackCargo = syncData.cargo_name;
            if (Number(syncData.cargo_quantity_mt) > 0) fallbackVolume = Number(syncData.cargo_quantity_mt);
          }
        }

        if (!fallbackPol && !fallbackPod) {
          const appStateRes = await pool.query(
            `SELECT value, session_ref FROM app_state WHERE key = 'core_pro_active_session' LIMIT 1`
          );
          if (appStateRes.rows[0]) {
            fallbackRef = appStateRes.rows[0].value || appStateRes.rows[0].session_ref || targetRef;
          }
        }

        if (fallbackPol || fallbackPod || fallbackRef) {
          voyage = {
            reference: voyage?.reference || fallbackRef || "RDM/2026-ACTIVE",
            vesselName: voyage?.vesselName || fallbackVessel,
            imo: voyage?.imo || null,
            mmsi: voyage?.mmsi || null,
            cargoType: voyage?.cargoType || fallbackCargo,
            cargoQty: voyage?.cargoQty || fallbackVolume,
            loadPortCode: voyage?.loadPortCode || null,
            loadPortName: voyage?.loadPortName || fallbackPol || "POL",
            loadPortLatitude: voyage?.loadPortLatitude || 0,
            loadPortLongitude: voyage?.loadPortLongitude || 0,
            dischargePortCode: voyage?.dischargePortCode || null,
            dischargePortName: voyage?.dischargePortName || fallbackPod || "POD",
            dischargePortLatitude: voyage?.dischargePortLatitude || 0,
            dischargePortLongitude: voyage?.dischargePortLongitude || 0,
            laydaysStartAt: voyage?.laydaysStartAt || null,
            cancellingAt: voyage?.cancellingAt || null,
            operationalPhase: voyage?.operationalPhase || "APPROACHING_POL",
            currentPhase: voyage?.currentPhase || 1,
            routeProgressPct: voyage?.routeProgressPct || 0,
            updatedAt: voyage?.updatedAt || new Date(),
          };
        }
      } catch (fallbackError) {
        console.warn("[voyage-active] Fallback lookup warning:", fallbackError);
      }
    }

    if (!voyage) {
      return Response.json({ error: "No existe un viaje activo." }, { status: 404 });
    }

    return Response.json(
      {
        voyage: {
          reference: voyage.reference,
          vesselName: voyage.vesselName,
          imo: voyage.imo,
          mmsi: voyage.mmsi,
          cargoType: voyage.cargoType,
          cargoQty: voyage.cargoQty,
          cargoUnit: "MT",
          loadPort: port(voyage.loadPortName, voyage.loadPortCode, voyage.loadPortLatitude, voyage.loadPortLongitude),
          dischargePort: port(voyage.dischargePortName, voyage.dischargePortCode, voyage.dischargePortLatitude, voyage.dischargePortLongitude),
          laydaysStartAt: voyage.laydaysStartAt,
          cancellingAt: voyage.cancellingAt,
          operationalPhase: voyage.operationalPhase,
          operationalPhaseLabel: phaseLabels[voyage.operationalPhase] || voyage.operationalPhase,
          currentPhase: voyage.currentPhase,
          routeProgressPct: voyage.routeProgressPct,
          updatedAt: voyage.updatedAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    console.error("[voyage-active] Request failed.", {
      requestId: context.requestId,
      message: error?.message,
    });
    return Response.json({ error: "No fue posible cargar el viaje activo." }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/voyage/active",
};
