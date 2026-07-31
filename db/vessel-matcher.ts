import type { PoolClient, QueryResultRow } from "pg";
import { getPool } from "./index.js";

const DEFAULT_TELEMETRY_TTL_HOURS = 24;

export interface MatchRequest {
  minDwt: number;
  maxDwt: number;
  targetLat?: number;
  targetLon?: number;
  telemetryTtlHours?: number;
}

export interface MatchedVessel extends QueryResultRow {
  id: number;
  imo_number: number | null;
  vessel_name: string | null;
  dwt: number;
  mmsi: string | null;
  vessel_type: string | null;
  draft_meters: number | null;
  flag: string | null;
  year_built: number | null;
  owner_manager: string | null;
  has_gears: boolean | null;
  telemetry_mmsi: string | null;
  latitude: number | null;
  longitude: number | null;
  telemetry_updated_at: Date | string | null;
  approximate_distance_nm: number | null;
}

interface NormalizedMatchRequest {
  minDwt: number;
  maxDwt: number;
  targetLat: number | null;
  targetLon: number | null;
  telemetryTtlHours: number;
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${field} debe ser un número finito.`);
  }
}

function normalizeRequest(request: MatchRequest): NormalizedMatchRequest {
  assertFiniteNumber(request.minDwt, "minDwt");
  assertFiniteNumber(request.maxDwt, "maxDwt");

  if (
    !Number.isInteger(request.minDwt)
    || !Number.isInteger(request.maxDwt)
    || request.minDwt < 0
    || request.maxDwt < 0
    || request.minDwt > request.maxDwt
  ) {
    throw new RangeError("El rango DWT debe usar enteros positivos y minDwt no puede superar maxDwt.");
  }

  const hasTargetLat = request.targetLat !== undefined;
  const hasTargetLon = request.targetLon !== undefined;
  if (hasTargetLat !== hasTargetLon) {
    throw new TypeError("targetLat y targetLon deben suministrarse juntos.");
  }

  if (hasTargetLat && hasTargetLon) {
    assertFiniteNumber(request.targetLat as number, "targetLat");
    assertFiniteNumber(request.targetLon as number, "targetLon");
    if ((request.targetLat as number) < -90 || (request.targetLat as number) > 90) {
      throw new RangeError("targetLat debe estar entre -90 y 90.");
    }
    if ((request.targetLon as number) < -180 || (request.targetLon as number) > 180) {
      throw new RangeError("targetLon debe estar entre -180 y 180.");
    }
  }

  const telemetryTtlHours = request.telemetryTtlHours ?? DEFAULT_TELEMETRY_TTL_HOURS;
  assertFiniteNumber(telemetryTtlHours, "telemetryTtlHours");
  if (!Number.isInteger(telemetryTtlHours) || telemetryTtlHours <= 0) {
    throw new RangeError("telemetryTtlHours debe ser un entero positivo.");
  }

  return {
    minDwt: request.minDwt,
    maxDwt: request.maxDwt,
    targetLat: request.targetLat ?? null,
    targetLon: request.targetLon ?? null,
    telemetryTtlHours,
  };
}

function traceMatcherError(error: unknown, request: MatchRequest): void {
  console.error("[vessel-matcher] Error al cruzar flota y telemetría.", {
    minDwt: request.minDwt,
    maxDwt: request.maxDwt,
    hasTargetCoordinates: request.targetLat !== undefined && request.targetLon !== undefined,
    telemetryTtlHours: request.telemetryTtlHours ?? DEFAULT_TELEMETRY_TTL_HOURS,
    error,
  });
}

export async function matchVessels(request: MatchRequest): Promise<MatchedVessel[]> {
  let client: PoolClient | undefined;

  try {
    const normalized = normalizeRequest(request);
    client = await getPool().connect();

    const result = await client.query<MatchedVessel>(
      `
        WITH master_candidates AS (
          SELECT
            id,
            imo_number AS imo,
            vessel_name,
            dwt,
            mmsi,
            vessel_type,
            draft_meters,
            flag,
            year_built,
            owner_manager,
            has_gears
          FROM vessels_master
          WHERE dwt BETWEEN $1 AND $2
        )
        SELECT
          vm.id,
          vm.imo AS imo_number,
          vm.vessel_name,
          vm.dwt,
          vm.mmsi,
          vm.vessel_type,
          vm.draft_meters,
          vm.flag,
          vm.year_built,
          vm.owner_manager,
          vm.has_gears,
          tb.mmsi AS telemetry_mmsi,
          tb.latitude,
          tb.longitude,
          tb.updated_at AS telemetry_updated_at,
          CASE
            WHEN $3::double precision IS NULL
              OR $4::double precision IS NULL
              OR tb.latitude IS NULL
              OR tb.longitude IS NULL
            THEN NULL
            ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
              POWER(SIN(RADIANS(tb.latitude - $3::double precision) / 2), 2) +
              COS(RADIANS($3::double precision)) * COS(RADIANS(tb.latitude)) *
              POWER(SIN(RADIANS(tb.longitude - $4::double precision) / 2), 2)
            ))))
          END AS approximate_distance_nm
        FROM master_candidates vm
        LEFT JOIN ais_telemetry_buffer tb
          ON (vm.mmsi = tb.mmsi OR vm.imo::text = tb.mmsi::text)
          AND tb.updated_at >= NOW() - make_interval(hours => $5)
        ORDER BY approximate_distance_nm ASC NULLS LAST, tb.updated_at DESC
      `,
      [
        normalized.minDwt,
        normalized.maxDwt,
        normalized.targetLat,
        normalized.targetLon,
        normalized.telemetryTtlHours,
      ],
    );

    return result.rows;
  } catch (error) {
    traceMatcherError(error, request);
    throw new Error("No fue posible completar el cruce analítico de buques.", { cause: error });
  } finally {
    if (client) client.release();
  }
}
