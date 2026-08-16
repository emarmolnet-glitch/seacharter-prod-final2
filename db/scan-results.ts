import { ensureApplicationSchema, getPool } from "./index.js";

type ScanResultRow = {
  scan_id: string;
  result_created_at: Date;
  imo: number | null;
  lat: number | null;
  lon: number | null;
  speed: number | string | null;
  course: number | string | null;
  draft: number | string | null;
  destination: string | null;
  ais_eta: Date | null;
  eta: Date | null;
  distance_to_pol: number | string | null;
  route_duration_hours: number | string | null;
  is_ballast: boolean | null;
  pros_and_cons: unknown;
  status: string | null;
  vessel_master_id: number | null;
  vessel_name: string | null;
  vessel_type: string | null;
  dwt: number | null;
  mmsi: string | null;
  flag: string | null;
  draft_meters: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
  current_destination: string | null;
};

export type LatestScanResults = {
  scanId: string | null;
  createdAt: string | null;
  vessels: Record<string, unknown>[];
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function requiresUnitizedCargoExclusions(payload: Record<string, unknown> = {}) {
  const cargo = payload.cargo && typeof payload.cargo === "object" && !Array.isArray(payload.cargo)
    ? payload.cargo as Record<string, unknown>
    : {};
  const values = [
    cargo.cargoType,
    cargo.cargoTypeId,
    cargo.cargoTypeLabel,
    cargo.cargoDescription,
    cargo.specification,
    cargo.cargoProduct,
    payload.cargoType,
    payload.cargoProduct,
  ];
  const cargoText = values.map((value) => String(value ?? "")).join(" ");
  return /uniti[sz]ada|big\s*bags?|jumbo\s*bags?|paleti[sz]ada/i.test(cargoText);
}

export async function getLatestScanResults(payload: Record<string, unknown> = {}): Promise<LatestScanResults> {
  await ensureApplicationSchema();
  const excludePassengerTypes = requiresUnitizedCargoExclusions(payload);
  const result = await getPool().query<ScanResultRow>(
    `
      WITH latest_scan AS (
        SELECT scan_id, MAX(created_at) AS latest_created_at
        FROM scan_results
        WHERE NULLIF(BTRIM(scan_id), '') IS NOT NULL
        GROUP BY scan_id
        ORDER BY latest_created_at DESC, scan_id DESC
        LIMIT 1
      )
      SELECT
        scan.scan_id,
        scan.latest_created_at AS result_created_at,
        result.imo,
        result.lat,
        result.lon,
        result.speed,
        result.course,
        result.draft,
        result.destination,
        result.ais_eta,
        result.eta,
        result.distance_to_pol,
        result.route_duration_hours,
        result.is_ballast,
        result.pros_and_cons,
        result.status,
        vessel.id AS vessel_master_id,
        vessel.vessel_name,
        vessel.vessel_type,
        vessel.dwt,
        vessel.mmsi,
        vessel.flag,
        vessel.draft_meters,
        vessel.loa_meters,
        vessel.beam_meters,
        vessel.current_destination
      FROM latest_scan scan
      JOIN scan_results result ON result.scan_id = scan.scan_id
      LEFT JOIN vessels_master vessel ON vessel.id = result.vessel_master_id
      WHERE (
        $1::boolean = false
        OR COALESCE(vessel.vessel_type, '') !~* '(ro[ -]?ro|passenger|ferr(y|ies))'
      )
      ORDER BY result.id
    `,
    [excludePassengerTypes],
  );

  const scanId = result.rows[0]?.scan_id || null;
  const createdAt = result.rows[0]?.result_created_at?.toISOString?.() || null;
  const vessels = result.rows.map((row) => ({
    scanId: row.scan_id,
    vesselMasterId: row.vessel_master_id,
    imo: row.imo ? String(row.imo) : null,
    mmsi: row.mmsi,
    vesselName: row.vessel_name,
    vesselType: row.vessel_type,
    dwt: row.dwt,
    latitude: row.lat,
    longitude: row.lon,
    speed: numberOrNull(row.speed),
    course: numberOrNull(row.course),
    draft: numberOrNull(row.draft) ?? numberOrNull(row.draft_meters),
    loa: numberOrNull(row.loa_meters),
    beam: numberOrNull(row.beam_meters),
    flag: row.flag,
    destination: row.destination || row.current_destination,
    aisEta: row.ais_eta?.toISOString?.() || null,
    eta: row.eta?.toISOString?.() || null,
    distanceToPol: numberOrNull(row.distance_to_pol),
    routeDurationHours: numberOrNull(row.route_duration_hours),
    estimatedBallastStatus: row.is_ballast === true,
    prosAndCons: row.pros_and_cons,
    scanStatus: row.status,
    observedAt: createdAt,
    source: "NEON_SCAN_RESULTS",
    source_origin: "NEON_SCAN_RESULTS",
    source_origins: ["NEON_SCAN_RESULTS"],
    data_source: "scan_results",
  }));

  return { scanId, createdAt, vessels };
}
