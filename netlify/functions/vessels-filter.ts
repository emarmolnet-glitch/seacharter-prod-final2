import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { missingAisGeofenceResponse, parseAisGeofence } from "./_shared/ais-geofence.js";
import { createResponseCacheHeaders, getOrSetCachedJson } from "./_shared/response-cache.js";

type AisCandidateRow = QueryResultRow & {
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
  distance_nm: number;
};

type MasterProfileRow = QueryResultRow & {
  imo_number: number | string | null;
  mmsi: string | null;
  vessel_type: string | null;
  dwt: number | string | null;
  draft_meters: number | string | null;
  gross_tonnage: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
  flag: string | null;
  year_built: number | string | null;
  status: string | null;
  audit_status: string | null;
  process_status: string | null;
};

const DISCARDED_STATES = new Set(["DISCARDED", "REJECTED", "DESCARTADO", "INVALID", "INVALIDO", "INVÁLIDO"]);

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

function normalizeImo(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

function normalizeMmsi(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function toIsoString(value: Date | string): string {
  return new Date(value).toISOString();
}

function optionalNumber(value: number | string | null): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function isDiscarded(row: MasterProfileRow): boolean {
  return [row.status, row.audit_status, row.process_status]
    .some((value) => DISCARDED_STATES.has(String(value ?? "").trim().toUpperCase()));
}

function matchesRequestedType(value: unknown, requestedType: string): boolean {
  return String(value ?? "").toLocaleLowerCase().includes(requestedType.toLocaleLowerCase());
}

function mapAisVessel(row: AisCandidateRow, master: MasterProfileRow | null) {
  const effectiveVesselType = master?.vessel_type?.trim() || row.vessel_type;
  return {
    ...asRecord(row.raw_data),
    storageKey: row.storage_key,
    imoNumber: row.imo_number,
    IMO: row.imo_number,
    mmsi: row.mmsi,
    MMSI: row.mmsi,
    vesselName: row.vessel_name,
    vessel_type: effectiveVesselType,
    vesselType: effectiveVesselType,
    vesselClass: effectiveVesselType,
    shipType: effectiveVesselType,
    dwt: optionalNumber(master?.dwt ?? null) ?? asRecord(row.raw_data).dwt,
    draft_meters: optionalNumber(master?.draft_meters ?? null),
    draftMeters: optionalNumber(master?.draft_meters ?? null),
    gross_tonnage: optionalNumber(master?.gross_tonnage ?? null),
    grossTonnage: optionalNumber(master?.gross_tonnage ?? null),
    loa_meters: optionalNumber(master?.loa_meters ?? null),
    loaMeters: optionalNumber(master?.loa_meters ?? null),
    beam_meters: optionalNumber(master?.beam_meters ?? null),
    beamMeters: optionalNumber(master?.beam_meters ?? null),
    flag: master?.flag || undefined,
    year_built: optionalNumber(master?.year_built ?? null),
    yearBuilt: optionalNumber(master?.year_built ?? null),
    master_status: master?.status || undefined,
    masterStatus: master?.status || undefined,
    portfolio_status: master?.status || undefined,
    portfolioStatus: master?.status || undefined,
    master_audit_status: master?.audit_status || undefined,
    masterAuditStatus: master?.audit_status || undefined,
    master_process_status: master?.process_status || undefined,
    masterProcessStatus: master?.process_status || undefined,
    vesselTechnicalProfileVerified: Boolean(master),
    vesselClassSource: master ? "VESSELS_MASTER" : "AIS_FEED",
    latitude: row.latitude,
    longitude: row.longitude,
    source: row.source,
    audit_status: row.audit_status,
    auditStatus: row.audit_status,
    firstSeenAt: toIsoString(row.first_seen_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    distanceToPolNm: Number(row.distance_nm),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadFreshVesselsFilter(req: Request) {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const vesselType = decodeFilterValue(url.searchParams.get("vesselType") || "");
    const geofence = parseAisGeofence(url);
    if (!vesselType) {
      return Response.json({ success: false, error: "El parámetro vesselType es obligatorio." }, { status: 400 });
    }
    if (!geofence) return missingAisGeofenceResponse();

    const candidateLimit = Math.min(5000, Math.max(geofence.limit, geofence.limit * 4));
    const pool = getPool();
    const aisResult = await pool.query<AisCandidateRow>(
      `
        WITH candidates AS (
          SELECT
            av.*,
            3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(av.latitude - $1) / 2), 2) +
              COS(RADIANS($1)) * COS(RADIANS(av.latitude)) *
              POWER(SIN(RADIANS(av.longitude - $2) / 2), 2)
            ))) AS distance_nm
          FROM ais_vessels av
          WHERE av.latitude BETWEEN $3 AND $4
            AND (($7 = FALSE AND av.longitude BETWEEN $5 AND $6)
              OR ($7 = TRUE AND (av.longitude >= $5 OR av.longitude <= $6)))
            AND av.audit_status = 'VALIDATED'
        )
        SELECT *
        FROM candidates
        WHERE distance_nm <= $8
        ORDER BY distance_nm ASC, last_seen_at DESC
        LIMIT $9
      `,
      [
        geofence.latitude,
        geofence.longitude,
        geofence.minLatitude,
        geofence.maxLatitude,
        geofence.minLongitude,
        geofence.maxLongitude,
        geofence.crossesAntimeridian,
        geofence.radiusNm,
        candidateLimit,
      ],
    );

    const rawRows = aisResult.rows;
    const imoNumbers = Array.from(new Set(rawRows.map((row) => normalizeImo(row.imo_number)).filter(Boolean))).map(Number);
    const mmsiNumbers = Array.from(new Set(rawRows.map((row) => normalizeMmsi(row.mmsi)).filter(Boolean)));
    let masterRows: MasterProfileRow[] = [];
    let degraded = false;
    let warning = "";

    if (imoNumbers.length > 0 || mmsiNumbers.length > 0) {
      try {
        const masterResult = await pool.query<MasterProfileRow>(
          `
            SELECT
              imo_number, mmsi, vessel_type, dwt, draft_meters, gross_tonnage, loa_meters,
              beam_meters, flag, year_built, status, audit_status, process_status
            FROM vessels_master
            WHERE imo_number = ANY($1::integer[])
               OR (mmsi IS NOT NULL AND mmsi = ANY($2::text[]))
          `,
          [imoNumbers, mmsiNumbers],
        );
        masterRows = masterResult.rows;
      } catch (error) {
        degraded = true;
        warning = `vessels_master no disponible: ${getErrorMessage(error)}`;
        console.warn("[vessels-filter] Batch master lookup failed; returning raw AIS snapshot.", warning);
      }
    }

    const masterByImo = new Map<string, MasterProfileRow>();
    const masterByMmsi = new Map<string, MasterProfileRow>();
    masterRows.forEach((row) => {
      const imo = normalizeImo(row.imo_number);
      const mmsi = normalizeMmsi(row.mmsi);
      if (imo) masterByImo.set(imo, row);
      if (mmsi) masterByMmsi.set(mmsi, row);
    });

    const vessels = rawRows
      .flatMap((row) => {
        const master = masterByImo.get(normalizeImo(row.imo_number)) || masterByMmsi.get(normalizeMmsi(row.mmsi)) || null;
        if (!degraded && master && isDiscarded(master)) return [];
        if (!degraded && !matchesRequestedType(master?.vessel_type || row.vessel_type, vesselType)) return [];
        return [mapAisVessel(row, degraded ? null : master)];
      })
      .slice(0, geofence.limit);

    return Response.json({
      success: true,
      source: "ais_vessels",
      auditStatus: "VALIDATED",
      filterApplied: !degraded,
      degraded,
      warning: warning || undefined,
      batchLookup: {
        imoCount: imoNumbers.length,
        mmsiCount: mmsiNumbers.length,
        masterRows: masterRows.length,
        queryCount: imoNumbers.length > 0 || mmsiNumbers.length > 0 ? 1 : 0,
      },
      geofence: {
        polLat: geofence.latitude,
        polLon: geofence.longitude,
        radiusNm: geofence.radiusNm,
      },
      count: vessels.length,
      vessels,
    }, {
      status: degraded ? 206 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    console.error("[vessels-filter] Unable to load AIS candidate snapshot.", errorMessage);
    return Response.json(
      { success: false, error: errorMessage, message: "No se pudo cargar el snapshot AIS." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export default async (req: Request) => {
  if (req.method !== "GET") return loadFreshVesselsFilter(req);
  const url = new URL(req.url);
  const vesselType = decodeFilterValue(url.searchParams.get("vesselType") || "");
  const geofence = parseAisGeofence(url);
  const radarContext = String(url.searchParams.get("radarContext") || "default").trim().slice(0, 96);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  if (!vesselType || !geofence) return loadFreshVesselsFilter(req);
  try {
    const cached = await getOrSetCachedJson({
      namespace: "vessels-filter-v1",
      key: { vesselType, latitude: geofence.latitude, longitude: geofence.longitude, radiusNm: geofence.radiusNm, limit: geofence.limit, radarContext },
      ttlMs: 5 * 60 * 1000,
      bypassRead: forceRefresh,
      staleTtlMs: 30 * 60 * 1000,
      producer: async () => {
        const response = await loadFreshVesselsFilter(req);
        const body = await response.json();
        if (response.status >= 500) throw new Error("Vessel filter origin unavailable");
        return { body, status: response.status };
      },
    });
    return Response.json(cached.value.body, {
      status: cached.value.status,
      headers: createResponseCacheHeaders(cached, 300, 1_800),
    });
  } catch (error) {
    console.error("[vessels-filter] Cache and origin unavailable.", error instanceof Error ? error.message : String(error));
    return Response.json({ success: false, error: "Vessel snapshot temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
};

export const config: Config = {
  path: "/api/vessels-filter",
  method: "GET",
};
