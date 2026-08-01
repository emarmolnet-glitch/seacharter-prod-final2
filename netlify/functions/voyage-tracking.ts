import type { Config, Context } from "@netlify/functions";
import { Pool } from "pg";

type TrackingRow = Record<string, unknown>;
type TrackingStatus = "complete" | "active" | "pending";

const ROUTE_PREFIX = "/api/v1/voyage/tracking/";
const QUERY_TEXT =
  "SELECT * FROM voyages_tracking WHERE contract_ref = $1 LIMIT 1";
const NOT_FOUND_ERROR = "No fue posible recuperar el seguimiento operativo.";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

function errorResponse(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

function getContractRef(request: Request, context: Context): string | null {
  const pathname = new URL(request.url).pathname;
  const params = context.params as Record<string, string> | undefined;
  const encodedParam = pathname.startsWith(ROUTE_PREFIX)
    ? pathname.slice(ROUTE_PREFIX.length)
    : params?.["*"] || params?.["0"] || "";

  if (!encodedParam) {
    return null;
  }

  try {
    return decodeURIComponent(encodedParam).trim() || null;
  } catch (error) {
    console.error("[voyage-tracking] Contract reference decoding failed.", {
      requestId: context.requestId,
      error,
    });
    return null;
  }
}

function asObject(value: unknown): TrackingRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TrackingRow)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function getTrackingPhase(status: unknown): number {
  const normalizedStatus = String(status || "").trim().toUpperCase();

  if (normalizedStatus.includes("DISCHARG") || normalizedStatus.includes("CLOSED")) {
    return 6;
  }
  if (normalizedStatus.includes("POD")) {
    return 5;
  }
  if (normalizedStatus.includes("SAIL") || normalizedStatus.includes("TRANSIT")) {
    return 4;
  }
  if (normalizedStatus.includes("LOAD")) {
    return 3;
  }
  if (normalizedStatus.includes("NOR") || normalizedStatus.includes("LAYTIME")) {
    return 2;
  }

  return 1;
}

function getMilestoneStatus(phase: number, currentPhase: number): TrackingStatus {
  if (phase < currentPhase) return "complete";
  if (phase === currentPhase) return "active";
  return "pending";
}

function buildMilestones(row: TrackingRow, currentPhase: number) {
  const totalMt = row.cargo_quantity_mt ?? row.cargo_total_mt;

  return [
    {
      phase: 1,
      title: "Aproximación al POL",
      status: getMilestoneStatus(1, currentPhase),
      metrics: {
        distanceNm: row.pol_distance_nm,
        eta: row.pol_eta_at,
        cancellingAt: row.laycan_end,
      },
    },
    {
      phase: 2,
      title: "NOR y plancha en POL",
      status: getMilestoneStatus(2, currentPhase),
      metrics: {
        tenderedAt: row.nor_pol_tendered_at,
        acceptedAt: row.nor_pol_accepted_at,
        laytimeStartedAt: row.laytime_started_at,
      },
    },
    {
      phase: 3,
      title: "Operación de carga",
      status: getMilestoneStatus(3, currentPhase),
      metrics: {
        loadedMt: row.loaded_quantity_mt ?? row.cargo_loaded_mt,
        totalMt,
        actualRateMtDay: row.actual_loading_rate_mt_day,
        agreedRateMtDay: row.loading_rate_mt_day ?? row.load_rate_mt_day,
        demurrageUsd: row.demurrage_usd,
      },
    },
    {
      phase: 4,
      title: "Travesía marítima",
      status: getMilestoneStatus(4, currentPhase),
      metrics: {
        remainingDistanceNm: row.remaining_distance_nm,
        averageSpeedKnots: row.average_speed_knots,
        eta: row.dynamic_eta_at ?? row.eta,
      },
    },
    {
      phase: 5,
      title: "Aproximación y NOR en POD",
      status: getMilestoneStatus(5, currentPhase),
      metrics: {
        distanceNm: row.pod_distance_nm,
        tenderedAt: row.nor_pod_tendered_at,
        acceptedAt: row.nor_pod_accepted_at,
      },
    },
    {
      phase: 6,
      title: "Descarga y cierre",
      status: getMilestoneStatus(6, currentPhase),
      metrics: {
        dischargedMt: row.discharged_quantity_mt ?? row.cargo_discharged_mt,
        totalMt,
        actualRateMtDay: row.actual_discharging_rate_mt_day,
        portCostsUsd: row.port_costs_usd,
        closedAt: row.closed_at,
      },
    },
  ];
}

function buildPayload(row: TrackingRow) {
  const storedContract = asObject(row.contract);
  const storedLive = asObject(row.live);
  const currentPhase = Number(storedLive.phase) || getTrackingPhase(row.current_status);
  const position =
    hasValue(row.lat) && hasValue(row.lon)
      ? { latitude: row.lat, longitude: row.lon }
      : storedLive.position;

  return {
    ...row,
    success: true,
    data: row,
    contract: {
      ...storedContract,
      reference: storedContract.reference ?? row.contract_ref,
      vesselName: storedContract.vesselName ?? row.vessel_name,
      vesselMmsi: storedContract.vesselMmsi ?? row.vessel_mmsi,
      cargoName:
        storedContract.cargoName ?? row.cargo_type ?? row.cargo_name,
      pol:
        storedContract.pol ??
        ({ id: row.pol_port, name: row.pol_port } as TrackingRow),
      pod:
        storedContract.pod ??
        ({ id: row.pod_port, name: row.pod_port } as TrackingRow),
    },
    live: {
      ...storedLive,
      phase: currentPhase,
      status: storedLive.status ?? row.current_status,
      position,
      remainingDistanceNm:
        storedLive.remainingDistanceNm ?? row.remaining_distance_nm,
      averageSpeedKnots:
        storedLive.averageSpeedKnots ?? row.average_speed_knots,
      eta: storedLive.eta ?? row.dynamic_eta_at ?? row.eta,
    },
    alerts: asArray(row.alerts),
    milestones:
      asArray(row.milestones).length > 0
        ? asArray(row.milestones)
        : buildMilestones(row, currentPhase),
    timeline: asArray(row.timeline),
    generatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export default async function voyageTracking(
  request: Request,
  context: Context,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const contractRef = getContractRef(request, context);

  if (!contractRef) {
    return errorResponse(400, "Contract reference is required");
  }

  if (!process.env.DATABASE_URL) {
    return errorResponse(500, "Configuration error: DATABASE_URL missing");
  }

  try {
    const result = await getPool().query<TrackingRow>(QUERY_TEXT, [contractRef]);
    const row = result.rows[0];

    if (!row) {
      return errorResponse(404, NOT_FOUND_ERROR);
    }

    return Response.json(buildPayload(row));
  } catch (error) {
    console.error("[voyage-tracking] Database execution error:", error);
    return errorResponse(500, "Error interno en la base de datos.");
  }
}

export const config: Config = {
  path: "/api/v1/voyage/tracking/*",
};
