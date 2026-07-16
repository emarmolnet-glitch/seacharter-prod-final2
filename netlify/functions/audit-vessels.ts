import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { missingAisGeofenceResponse, parseAisGeofence, type AisGeofence } from "./ais-geofence.js";

const VALIDATED_AUDIT_STATUS = "VALIDATED";

type AuditVesselRow = QueryResultRow & {
  storage_key: string;
  imo_number: string;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  source: string;
  audit_status?: string | null;
  raw_data: unknown;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  distance_nm: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingAuditStatusColumn(error: unknown): boolean {
  const record = asRecord(error);
  return record.code === "42703"
    && getErrorMessage(error).toLowerCase().includes("audit_status");
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

async function selectAuditVessels(geofence: AisGeofence) {
  const parameters = [
    geofence.latitude,
    geofence.longitude,
    geofence.minLatitude,
    geofence.maxLatitude,
    geofence.minLongitude,
    geofence.maxLongitude,
    geofence.crossesAntimeridian,
    geofence.radiusNm,
    VALIDATED_AUDIT_STATUS,
    geofence.limit,
  ];
  try {
    const result = await getPool().query<AuditVesselRow>(
      `
        WITH candidates AS (
          SELECT *,
            3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(latitude - $1) / 2), 2) +
              COS(RADIANS($1)) * COS(RADIANS(latitude)) *
              POWER(SIN(RADIANS(longitude - $2) / 2), 2)
            ))) AS distance_nm
          FROM ais_vessels
          WHERE latitude BETWEEN $3 AND $4
            AND (($7 = FALSE AND longitude BETWEEN $5 AND $6)
              OR ($7 = TRUE AND (longitude >= $5 OR longitude <= $6)))
            AND audit_status = $9
        )
        SELECT *
        FROM candidates
        WHERE distance_nm <= $8
        ORDER BY distance_nm ASC, last_seen_at DESC
        LIMIT $10
      `,
      parameters,
    );
    return { rows: result.rows, filterApplied: true };
  } catch (error) {
    if (!isMissingAuditStatusColumn(error)) throw error;

    console.warn("[audit-vessels] audit_status is unavailable; using read-only schema fallback.");
    const result = await getPool().query<AuditVesselRow>(
      `
        WITH candidates AS (
          SELECT *,
            3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(latitude - $1) / 2), 2) +
              COS(RADIANS($1)) * COS(RADIANS(latitude)) *
              POWER(SIN(RADIANS(longitude - $2) / 2), 2)
            ))) AS distance_nm
          FROM ais_vessels
          WHERE latitude BETWEEN $3 AND $4
            AND (($7 = FALSE AND longitude BETWEEN $5 AND $6)
              OR ($7 = TRUE AND (longitude >= $5 OR longitude <= $6)))
        )
        SELECT *
        FROM candidates
        WHERE distance_nm <= $8
        ORDER BY distance_nm ASC, last_seen_at DESC
        LIMIT $10
      `,
      parameters,
    );
    return { rows: result.rows, filterApplied: false };
  }
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const geofence = parseAisGeofence(url);
    if (!geofence) return missingAisGeofenceResponse();
    const { rows, filterApplied } = await selectAuditVessels(geofence);

    const vessels = rows.map((row) => ({
      ...asRecord(row.raw_data),
      storageKey: row.storage_key,
      imoNumber: row.imo_number,
      IMO: row.imo_number,
      mmsi: row.mmsi,
      MMSI: row.mmsi,
      vesselName: row.vessel_name,
      vessel_type: row.vessel_type,
      vesselType: row.vessel_type,
      latitude: row.latitude,
      longitude: row.longitude,
      source: row.source,
      audit_status: row.audit_status || null,
      auditStatus: row.audit_status || null,
      firstSeenAt: toIsoString(row.first_seen_at),
      lastSeenAt: toIsoString(row.last_seen_at),
      distanceToPolNm: Number(row.distance_nm),
    }));

    return Response.json({
      success: true,
      source: "ais_vessels",
      auditStatus: filterApplied ? VALIDATED_AUDIT_STATUS : null,
      filterApplied,
      geofence: {
        polLat: geofence.latitude,
        polLon: geofence.longitude,
        radiusNm: geofence.radiusNm,
      },
      count: vessels.length,
      vessels,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("[audit-vessels] Unable to load validated AIS vessels.", errorMessage);
    return Response.json(
      {
        success: false,
        error: errorMessage,
        message: "No se pudieron cargar los buques auditados.",
      },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/audit-vessels",
  method: "GET",
};
