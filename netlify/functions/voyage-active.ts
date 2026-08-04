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

    const voyage = rows[0];
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
