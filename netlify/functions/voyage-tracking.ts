import type { Config, Context } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { voyagesTracking } from "../../db/schema.js";

type TrackingRow = typeof voyagesTracking.$inferSelect;
type TrackingStatus = "complete" | "active" | "pending";
type UnknownRecord = Record<string, unknown>;

const ROUTE_PREFIX = "/api/v1/voyage/tracking/";
const NOT_FOUND_ERROR = "No existe un viaje asociado a esta referencia contractual.";

function errorResponse(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

function getContractRef(request: Request, context: Context): string | null {
  const pathname = new URL(request.url).pathname;
  const params = context.params as Record<string, string> | undefined;
  const encodedParam = pathname.startsWith(ROUTE_PREFIX)
    ? pathname.slice(ROUTE_PREFIX.length)
    : params?.["*"] || params?.["0"] || "";

  if (!encodedParam) return null;

  try {
    return decodeURIComponent(encodedParam).trim().toUpperCase() || null;
  } catch (error) {
    console.error("[voyage-tracking] Contract reference decoding failed.", {
      requestId: context.requestId,
      error,
    });
    return null;
  }
}

function asObject(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function milestoneStatus(phase: number, currentPhase: number): TrackingStatus {
  if (phase < currentPhase) return "complete";
  if (phase === currentPhase) return "active";
  return "pending";
}

function defaultMilestones(row: TrackingRow) {
  const currentPhase = Math.min(6, Math.max(1, Number(row.currentPhase) || 1));
  const totalMt = row.cargoQuantityMt;

  return [
    {
      phase: 1,
      title: "Aproximación al POL",
      status: milestoneStatus(1, currentPhase),
      metrics: {
        previousPort: row.previousPortName,
        eta: row.dynamicEtaAt,
        cancellingAt: row.cancellingAt,
      },
    },
    {
      phase: 2,
      title: "NOR y plancha en POL",
      status: milestoneStatus(2, currentPhase),
      metrics: {
        tenderedAt: row.norPolTenderedAt,
        acceptedAt: row.norPolAcceptedAt,
        laytimeStartedAt: row.laytimeStartedAt,
      },
    },
    {
      phase: 3,
      title: "Operación de carga",
      status: milestoneStatus(3, currentPhase),
      metrics: {
        loadedMt: row.loadedQuantityMt,
        totalMt,
        actualRateMtDay: row.actualLoadingRateMtDay,
        agreedRateMtDay: row.loadingRateMtDay,
        demurrageUsd: row.demurrageUsd,
      },
    },
    {
      phase: 4,
      title: "Travesía marítima",
      status: milestoneStatus(4, currentPhase),
      metrics: {
        remainingDistanceNm: row.remainingDistanceNm,
        averageSpeedKnots: row.averageSpeedKnots,
        eta: row.dynamicEtaAt,
      },
    },
    {
      phase: 5,
      title: "Aproximación y NOR en POD",
      status: milestoneStatus(5, currentPhase),
      metrics: {
        tenderedAt: row.norPodTenderedAt,
        acceptedAt: row.norPodAcceptedAt,
        destination: row.podName,
      },
    },
    {
      phase: 6,
      title: "Descarga y cierre",
      status: milestoneStatus(6, currentPhase),
      metrics: {
        dischargedMt: row.dischargedQuantityMt,
        totalMt,
        actualRateMtDay: row.actualDischargeRateMtDay,
        agreedRateMtDay: row.dischargeRateMtDay,
        portCostsUsd: row.portCostsUsd,
        closedAt: row.closedAt,
      },
    },
  ];
}

function point(name: string | null, code: string | null, latitude: number | null, longitude: number | null) {
  if (!name && !code) return null;
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  return {
    name,
    id: code,
    lat: hasCoordinates ? latitude : null,
    lng: hasCoordinates ? longitude : null,
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
  };
}

function buildPayload(row: TrackingRow) {
  const storedMilestones = asArray(row.milestones);
  const commercial = asObject(row.commercialDetails);
  const previousPort = point(row.previousPortName, row.previousPortCode, row.previousPortLatitude, row.previousPortLongitude);
  const pol = point(row.polName, row.polCode, row.polLatitude, row.polLongitude);
  const pod = point(row.podName, row.podCode, row.podLatitude, row.podLongitude);
  const aisPosition = point(row.vesselName, row.imoNumber, row.aisLatitude, row.aisLongitude);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    contract: {
      reference: row.contractRef,
      status: row.currentStatus,
      phase: row.currentPhase,
      vesselName: row.vesselName,
      vesselImo: row.imoNumber,
      vesselMmsi: row.mmsi,
      cargoName: row.cargoName,
      cargoQuantityMt: row.cargoQuantityMt,
      laydaysStartAt: row.laydaysStartAt,
      cancellingAt: row.cancellingAt,
      previousPort,
      pol,
      pod,
      commercial,
    },
    live: {
      phase: row.currentPhase,
      status: row.currentStatus,
      position: aisPosition,
      aisUpdatedAt: row.aisUpdatedAt,
      remainingDistanceNm: row.remainingDistanceNm,
      averageSpeedKnots: row.averageSpeedKnots,
      eta: row.dynamicEtaAt,
      progressPct: row.routeProgressPct,
      demurrageUsd: row.demurrageUsd,
    },
    route: {
      ports: { ballast: previousPort, pol, pod },
      ballast: asArray(row.ballastRoute),
      laden: asArray(row.ladenRoute),
    },
    alerts: asArray(row.alerts),
    milestones: storedMilestones.length === 6 ? storedMilestones : defaultMilestones(row),
    timeline: asArray(row.assetTrail),
  };
}

export default async (request: Request, context: Context) => {
  if (request.method !== "GET") {
    return errorResponse(405, "Método no permitido.");
  }

  const contractRef = getContractRef(request, context);
  if (!contractRef || !/^[A-Z0-9][A-Z0-9/_-]{2,79}$/.test(contractRef)) {
    return errorResponse(400, "La referencia contractual no es válida.");
  }

  try {
    const rows = await db
      .select()
      .from(voyagesTracking)
      .where(sql`upper(${voyagesTracking.contractRef}) = ${contractRef}`)
      .limit(1);

    if (!rows[0]) return errorResponse(404, NOT_FOUND_ERROR);
    return Response.json(buildPayload(rows[0]));
  } catch (error: any) {
    console.error("[voyage-tracking] Database query failed:", {
      requestId: context.requestId,
      contractRef,
      errorMessage: error?.message,
      errorStack: error?.stack,
    });
    return errorResponse(500, `Error de base de datos: ${error?.message || "No fue posible recuperar el seguimiento operativo."}`);
  }
};

export const config: Config = {
  path: "/api/v1/voyage/tracking/*",
};
