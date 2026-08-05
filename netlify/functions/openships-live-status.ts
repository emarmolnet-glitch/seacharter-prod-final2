import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { parseAisGeofence } from "./ais-geofence.js";

type OpenShipsStatusRow = QueryResultRow & {
  vessel: Record<string, unknown>;
};

type MasterVesselRow = QueryResultRow & {
  imo_number: number | null;
  mmsi: string | null;
  vessel_name: string | null;
  dwt: number | null;
  vessel_type: string | null;
  draft_meters: number | string | null;
  flag: string | null;
  call_sign: string | null;
  year_built: number | null;
  gross_tonnage: number | string | null;
  net_tonnage: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
  has_gears: boolean | null;
  status: string | null;
  audit_status: string | null;
  process_status: string | null;
  is_discarded: boolean;
  updated_at: string | Date | null;
};

function normalizeImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

function vesselImo(vessel: Record<string, unknown>) {
  const metadata = vessel.MetaData && typeof vessel.MetaData === "object"
    ? vessel.MetaData as Record<string, unknown>
    : {};
  return normalizeImo(
    vessel.imo
    ?? vessel.IMO
    ?? vessel.imo_number
    ?? vessel.imoNumber
    ?? metadata.imo
    ?? metadata.IMO,
  );
}

function normalizeMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function vesselMmsi(vessel: Record<string, unknown>) {
  const metadata = vessel.MetaData && typeof vessel.MetaData === "object"
    ? vessel.MetaData as Record<string, unknown>
    : {};
  return normalizeMmsi(vessel.mmsi ?? vessel.MMSI ?? metadata.mmsi ?? metadata.MMSI);
}

function dbNumber(value: number | string | null) {
  if (value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mergeMasterTechnicalData(vessel: Record<string, unknown>, master: MasterVesselRow) {
  const metadata = vessel.MetaData && typeof vessel.MetaData === "object"
    ? { ...(vessel.MetaData as Record<string, unknown>) }
    : {};
  const imo = master.imo_number ? String(master.imo_number) : vesselImo(vessel);
  const mmsi = master.mmsi || vesselMmsi(vessel);
  const dwt = dbNumber(master.dwt);
  const draftMeters = dbNumber(master.draft_meters);
  const grossTonnage = dbNumber(master.gross_tonnage);
  const netTonnage = dbNumber(master.net_tonnage);
  const loaMeters = dbNumber(master.loa_meters);
  const beamMeters = dbNumber(master.beam_meters);
  const masterFields = Object.fromEntries(Object.entries({
    imo,
    IMO: imo,
    imo_number: imo,
    mmsi,
    MMSI: mmsi,
    vessel_name: master.vessel_name,
    vesselName: master.vessel_name,
    dwt,
    DWT: dwt,
    vessel_type: master.vessel_type,
    vesselType: master.vessel_type,
    shipType: master.vessel_type,
    draft_meters: draftMeters,
    draft: draftMeters,
    Draft: draftMeters,
    flag: master.flag,
    call_sign: master.call_sign,
    callSign: master.call_sign,
    year_built: master.year_built,
    yearBuilt: master.year_built,
    builtYear: master.year_built,
    gross_tonnage: grossTonnage,
    grossTonnage,
    gt: grossTonnage,
    net_tonnage: netTonnage,
    netTonnage,
    loa_meters: loaMeters,
    loaMeters,
    loa: loaMeters,
    beam_meters: beamMeters,
    beamMeters,
    beam: beamMeters,
    has_gears: master.has_gears,
    hasGears: master.has_gears,
    status: master.status,
    audit_status: master.audit_status,
    auditStatus: master.audit_status,
    process_status: master.process_status,
    processStatus: master.process_status,
    master_updated_at: master.updated_at instanceof Date ? master.updated_at.toISOString() : master.updated_at,
  }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
  Object.assign(metadata, Object.fromEntries(Object.entries({
    IMO: imo,
    MMSI: mmsi,
    DWT: dwt,
    vesselType: master.vessel_type,
    draft: draftMeters,
    flag: master.flag,
    yearBuilt: master.year_built,
    grossTonnage,
    loaMeters,
    beamMeters,
  }).filter(([, value]) => value !== null && value !== undefined && value !== "")));
  return {
    ...vessel,
    ...masterFields,
    MetaData: metadata,
    masterValidated: true,
    technicalDataSource: "VESSELS_MASTER",
  };
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const url = new URL(req.url);
    const geofence = parseAisGeofence(url);
    const result = geofence
      ? await getPool().query<OpenShipsStatusRow>(`
      WITH latest AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(mmsi::text, ''), vessel_key))
          vessel_key,
          mmsi,
          vessel_name,
          latitude,
          longitude,
          speed_over_ground,
          course_over_ground,
          heading,
          vessel_type,
          observed_at,
          fetched_at,
          raw_data
        FROM ais_telemetry_buffer
        WHERE fetched_at >= NOW() - INTERVAL '24 hours'
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        ORDER BY COALESCE(NULLIF(mmsi::text, ''), vessel_key),
          COALESCE(observed_at, fetched_at, updated_at) DESC NULLS LAST
      ), candidates AS (
        SELECT *,
          3440.065 * 2 * ASIN(SQRT(LEAST(1,
            POWER(SIN(RADIANS(latitude - $1) / 2), 2) +
            COS(RADIANS($1)) * COS(RADIANS(latitude)) *
            POWER(SIN(RADIANS(longitude - $2) / 2), 2)
          ))) AS distance_nm
        FROM latest
        WHERE latitude BETWEEN $3 AND $4
          AND (($7 = FALSE AND longitude BETWEEN $5 AND $6)
            OR ($7 = TRUE AND (longitude >= $5 OR longitude <= $6)))
      )
      SELECT COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
        'storage_key', vessel_key,
        'vessel_key', vessel_key,
        'mmsi', mmsi,
        'vessel_name', vessel_name,
        'latitude', latitude,
        'longitude', longitude,
        'speed_over_ground', speed_over_ground,
        'course_over_ground', course_over_ground,
        'heading', heading,
        'vessel_type', vessel_type,
        'observed_at', observed_at,
        'fetched_at', fetched_at,
        'distance_to_pol_nm', distance_nm,
        'source', 'OPENSHIPS',
        'source_origin', 'OPENSHIPS',
        'source_origins', jsonb_build_array('OPENSHIPS'),
        'data_source', 'OPENSHIPS'
      ) AS vessel
      FROM candidates
      WHERE distance_nm <= $8
      ORDER BY distance_nm ASC, COALESCE(observed_at, fetched_at) DESC NULLS LAST
      LIMIT $9;
    `, [
        geofence.latitude,
        geofence.longitude,
        geofence.minLatitude,
        geofence.maxLatitude,
        geofence.minLongitude,
        geofence.maxLongitude,
        geofence.crossesAntimeridian,
        geofence.radiusNm,
        geofence.limit,
      ])
      : await getPool().query<OpenShipsStatusRow>(`
      SELECT DISTINCT ON (COALESCE(NULLIF(mmsi::text, ''), vessel_key))
        COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object(
          'storage_key', vessel_key,
          'vessel_key', vessel_key,
          'mmsi', mmsi,
          'vessel_name', vessel_name,
          'latitude', latitude,
          'longitude', longitude,
          'speed_over_ground', speed_over_ground,
          'course_over_ground', course_over_ground,
          'heading', heading,
          'vessel_type', vessel_type,
          'observed_at', observed_at,
          'fetched_at', fetched_at,
          'source', 'OPENSHIPS',
          'source_origin', 'OPENSHIPS',
          'source_origins', jsonb_build_array('OPENSHIPS'),
          'data_source', 'OPENSHIPS'
        ) AS vessel
      FROM ais_telemetry_buffer
      WHERE fetched_at >= NOW() - INTERVAL '24 hours'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY COALESCE(NULLIF(mmsi::text, ''), vessel_key),
        COALESCE(observed_at, fetched_at, updated_at) DESC NULLS LAST;
    `);
    const rawVessels = result.rows
      .map((row) => row.vessel)
      .filter((vessel) => vessel && typeof vessel === "object");
    const imoNumbers = Array.from(new Set(rawVessels.map(vesselImo).filter(Boolean))).map(Number);
    const mmsiNumbers = Array.from(new Set(rawVessels.map(vesselMmsi).filter(Boolean)));
    const masterRows = imoNumbers.length > 0 || mmsiNumbers.length > 0
      ? (await getPool().query<MasterVesselRow>(`
          SELECT
            imo_number, mmsi, vessel_name, dwt, vessel_type, draft_meters, flag,
            call_sign, year_built, gross_tonnage, net_tonnage, loa_meters,
            beam_meters, has_gears, status, audit_status, process_status,
            (UPPER(COALESCE(status, '')) = 'DISCARDED'
              OR UPPER(COALESCE(process_status, '')) = 'DISCARDED'
              OR UPPER(COALESCE(audit_status, '')) IN ('REJECTED', 'DISCARDED')) AS is_discarded,
            updated_at
          FROM vessels_master
          WHERE imo_number = ANY($1::integer[])
             OR mmsi = ANY($2::text[])
        `, [imoNumbers, mmsiNumbers])).rows
      : [];
    const masterByImo = new Map<string, MasterVesselRow>();
    const masterByMmsi = new Map<string, MasterVesselRow>();
    masterRows.forEach((row) => {
      const imo = normalizeImo(row.imo_number);
      const mmsi = normalizeMmsi(row.mmsi);
      if (imo) masterByImo.set(imo, row);
      if (mmsi) masterByMmsi.set(mmsi, row);
    });
    const vessels = rawVessels.flatMap((vessel) => {
      const master = masterByImo.get(vesselImo(vessel)) || masterByMmsi.get(vesselMmsi(vessel));
      if (!master) return [vessel];
      if (master.is_discarded === true) return [];
      return [mergeMasterTechnicalData(vessel, master)];
    });

    return Response.json(
      {
        success: true,
        source: "OPENSHIPS",
        recent_vessels: vessels.length,
        count: vessels.length,
        openshipsCount: vessels.length,
        geofence: geofence
          ? { polLat: geofence.latitude, polLon: geofence.longitude, radiusNm: geofence.radiusNm }
          : null,
        vessels,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "[openships-live-status] Unable to load recent vessel count.",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { error: "Unable to load OpenShips live status." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};

export const config: Config = {
  path: "/api/openships/live-status",
  method: "GET",
};
