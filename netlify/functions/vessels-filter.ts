import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

const MAX_FILTERED_VESSELS = 5000;

type FilteredVesselRow = QueryResultRow & {
  storage_key: string;
  imo_number: string;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  source: string;
  audit_status: string;
  raw_data: unknown;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function decodeFilterValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim();
  } catch {
    return value.trim();
  }
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const rawVesselType = url.searchParams.get("vesselType") || "";
    const vesselType = decodeFilterValue(rawVesselType);

    if (!vesselType) {
      return Response.json(
        { success: false, error: "El parámetro vesselType es obligatorio." },
        { status: 400 },
      );
    }

    const result = await getPool().query<FilteredVesselRow>(
      `
        SELECT *
        FROM ais_vessels
        WHERE audit_status = 'VALIDATED'
          AND vessel_type ILIKE '%' || $1 || '%'
        ORDER BY last_seen_at DESC
        LIMIT $2
      `,
      [vesselType, MAX_FILTERED_VESSELS],
    );

    const vessels = result.rows.map((row) => ({
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
      audit_status: row.audit_status,
      auditStatus: row.audit_status,
      firstSeenAt: toIsoString(row.first_seen_at),
      lastSeenAt: toIsoString(row.last_seen_at),
    }));

    return Response.json({
      success: true,
      source: "ais_vessels",
      auditStatus: "VALIDATED",
      filterApplied: true,
      count: vessels.length,
      vessels,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("[vessels-filter] Unable to filter AIS vessels.", errorMessage);
    return Response.json(
      { success: false, error: errorMessage, message: "No se pudieron filtrar los buques." },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/vessels-filter",
  method: "GET",
};
