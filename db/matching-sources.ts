import type { QueryResultRow } from "pg";
import { getPool } from "./index.js";
import type { VesselMasterRow } from "./vessels-master.js";
import {
  buildPortDestinationAliases,
  classifyCandidateMatch,
  estimateArrivalDate,
  estimateBallastStatus,
  isLaycanCompliant,
  sortCandidates,
  type MatchReason,
  type PortData,
} from "../netlify/functions/_shared/commercial-vessel-search.mjs";

export type AisMatchingRow = QueryResultRow & {
  storage_key: string;
  imo_number: string | null;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number;
  longitude: number;
  source: string | null;
  audit_status: string;
  raw_data: unknown;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  distance_nm: number;
};

export type MatchingSourceSystem = "DATABRIDGE" | "AIS_LIVE" | "OPENSHIPS";

export type PaginatedMatchingSourceRow = QueryResultRow & {
  source_system: MatchingSourceSystem;
  payload: Record<string, unknown>;
  total_count: string | number;
};

export type PaginatedMatchingSources = {
  rows: PaginatedMatchingSourceRow[];
  totalCount: number;
  limit: number;
  offset: number;
};

type CommercialPoolRow = QueryResultRow & {
  source_system: MatchingSourceSystem;
  payload: Record<string, unknown>;
  sort_at: Date | string | null;
  distance_nm: number | string | null;
  source_imo: string | null;
  source_mmsi: string | null;
  source_dwt: number | string | null;
  source_design_draft: number | string | null;
  destination_text: string | null;
};

type MatchingMasterProfileRow = QueryResultRow & {
  imo_number: number | string | null;
  mmsi: string | null;
  dwt: number | string | null;
  draft_meters: number | string | null;
};

type RankedCommercialCandidate = PaginatedMatchingSourceRow & {
  dwtDifference: number;
  estimatedBallastStatus: boolean;
  laycanCompliant: boolean;
  distanceNm: number | null;
};

export type FindMatchingVesselsRequest = {
  allowedSources: MatchingSourceSystem[];
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  cargoQuantity: number;
  targetDwt?: number | null;
  laycanStart?: string | null;
  laycanEnd?: string | null;
  polData: PortData;
  limit?: number;
  offset?: number;
};

const MATCHING_SOURCE_SYSTEMS = new Set<MatchingSourceSystem>(["DATABRIDGE", "AIS_LIVE", "OPENSHIPS"]);

export function normalizeAllowedMatchingSources(value: unknown): MatchingSourceSystem[] {
  if (!Array.isArray(value)) return ["DATABRIDGE", "AIS_LIVE", "OPENSHIPS"];
  const normalized = [...new Set(value
    .map((source) => String(source || "").trim().toUpperCase())
    .filter((source): source is MatchingSourceSystem => MATCHING_SOURCE_SYSTEMS.has(source as MatchingSourceSystem)))];
  return normalized.length > 0 ? normalized : ["DATABRIDGE", "AIS_LIVE", "OPENSHIPS"];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstValue(record: Record<string, unknown>, paths: string[][]) {
  for (const path of paths) {
    let value: unknown = record;
    for (const key of path) value = asRecord(value)[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function finiteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function candidateDestination(payload: Record<string, unknown>) {
  return firstValue(payload, [
    ["destination"], ["Destination"], ["current_destination"], ["currentDestination"],
    ["MetaData", "Destination"], ["metadata", "Destination"],
    ["Message", "ShipStaticData", "Destination"], ["ShipStaticData", "Destination"],
    ["Message", "ShipStaticData", "PortOfDestination"], ["ShipStaticData", "PortOfDestination"],
  ]);
}

function candidateEta(payload: Record<string, unknown>) {
  return firstValue(payload, [
    ["eta"], ["ETA"], ["declaredEta"], ["estimatedEta"],
    ["MetaData", "ETA"], ["Message", "ShipStaticData", "ETA"], ["ShipStaticData", "ETA"],
  ]);
}

function candidateSpeed(payload: Record<string, unknown>) {
  return firstValue(payload, [
    ["speed_over_ground"], ["speed"], ["sog"], ["SOG"],
    ["MetaData", "SOG"], ["Message", "PositionReport", "Sog"], ["PositionReport", "Sog"],
  ]);
}

function candidateDraft(payload: Record<string, unknown>) {
  return firstValue(payload, [
    ["draught"], ["Draught"], ["draft"], ["Draft"],
    ["MetaData", "Draught"], ["Message", "ShipStaticData", "MaximumStaticDraught"],
    ["ShipStaticData", "MaximumStaticDraught"],
  ]);
}

export async function findMatchingVessels(request: FindMatchingVesselsRequest): Promise<PaginatedMatchingSources> {
  const safeSources = normalizeAllowedMatchingSources(request.allowedSources);
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(request.limit ?? 50)));
  const safeOffset = Math.min(100000, Math.max(0, Math.trunc(request.offset ?? 0)));
  const safeRadius = Math.min(5000, Math.max(1, request.radiusNm));
  const safeLatitude = Number.isFinite(request.latitude) ? request.latitude : null;
  const safeLongitude = Number.isFinite(request.longitude) ? request.longitude : null;
  const cargoQuantity = Math.max(0, Number(request.cargoQuantity) || 0);
  const minDwt = cargoQuantity * 1.05;
  const targetDwt = Math.max(minDwt, Number(request.targetDwt) || minDwt);
  const candidateLimit = Math.min(5000, Math.max(1000, (safeOffset + safeLimit) * 20));
  const destinationAliases = buildPortDestinationAliases(request.polData)
    .map((alias) => alias.replace(/[^A-Z0-9]+/g, ""))
    .filter((alias) => alias.length >= 3);

  if (safeLatitude === null || safeLongitude === null || minDwt <= 0) {
    return { rows: [], totalCount: 0, limit: safeLimit, offset: safeOffset };
  }

  const pool = getPool();
  const result = await pool.query<CommercialPoolRow>(
    `
      WITH openships_latest AS (
        SELECT DISTINCT ON (COALESCE(NULLIF(os.mmsi::text, ''), os.vessel_key)) os.*
        FROM ais_telemetry_buffer os
        WHERE os.fetched_at >= NOW() - INTERVAL '24 hours'
          AND os.latitude IS NOT NULL
          AND os.longitude IS NOT NULL
        ORDER BY COALESCE(NULLIF(os.mmsi::text, ''), os.vessel_key),
          COALESCE(os.observed_at, os.fetched_at, os.updated_at) DESC NULLS LAST
      ), source_rows AS (
        SELECT
          'DATABRIDGE'::text AS source_system,
          to_jsonb(vm) || jsonb_build_object(
            'distance_nm', 3440.065 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
              POWER(SIN(RADIANS(vm.latitude - $2) / 2), 2) +
              COS(RADIANS($2)) * COS(RADIANS(vm.latitude)) *
              POWER(SIN(RADIANS(vm.longitude - $3) / 2), 2)
            ))))
          ) AS payload,
          vm.fecha_ultima_actualizacion AS sort_at,
          3440.065 * 2 * ASIN(SQRT(LEAST(1, GREATEST(0,
            POWER(SIN(RADIANS(vm.latitude - $2) / 2), 2) +
            COS(RADIANS($2)) * COS(RADIANS(vm.latitude)) *
            POWER(SIN(RADIANS(vm.longitude - $3) / 2), 2)
          )))) AS distance_nm,
          REGEXP_REPLACE(COALESCE(vm.imo_number::text, ''), '[^0-9]', '', 'g') AS source_imo,
          COALESCE(vm.mmsi::text, '') AS source_mmsi,
          vm.dwt::double precision AS source_dwt,
          vm.draft_meters::double precision AS source_design_draft,
          COALESCE(vm.current_destination, vm.source_payload->>'destination', vm.source_payload->>'Destination') AS destination_text
        FROM vessels_master vm
        WHERE (vm.status = 'EN_CARTERA'
          OR vm.validation_status = 'VALIDADO')
          AND UPPER(COALESCE(vm.status, '')) NOT IN ('PENDING', 'PENDING_AUDIT')
          AND UPPER(COALESCE(vm.audit_status, '')) NOT IN ('PENDING', 'IN_DUE_DILIGENCE', 'REJECTED')
          AND UPPER(COALESCE(vm.process_status, '')) NOT IN ('PENDING_REVIEW', 'DUE_DILIGENCE')
          AND vm.latitude IS NOT NULL
          AND vm.longitude IS NOT NULL

        UNION ALL

        SELECT
          'AIS_LIVE'::text AS source_system,
          to_jsonb(av) || jsonb_build_object(
            'distance_nm', CASE
              WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
              ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
                POWER(SIN(RADIANS(av.latitude - $2) / 2), 2) +
                COS(RADIANS($2)) * COS(RADIANS(av.latitude)) *
                POWER(SIN(RADIANS(av.longitude - $3) / 2), 2)
              )))
            END
          ) AS payload,
          av.last_seen_at AS sort_at,
          CASE
            WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
            ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(av.latitude - $2) / 2), 2) +
              COS(RADIANS($2)) * COS(RADIANS(av.latitude)) *
              POWER(SIN(RADIANS(av.longitude - $3) / 2), 2)
            )))
          END AS distance_nm,
          REGEXP_REPLACE(COALESCE(av.imo_number::text, av.raw_data->>'imo', av.raw_data->>'IMO', ''), '[^0-9]', '', 'g') AS source_imo,
          COALESCE(av.mmsi::text, av.raw_data->>'mmsi', av.raw_data->>'MMSI', '') AS source_mmsi,
          NULL::double precision AS source_dwt,
          NULL::double precision AS source_design_draft,
          COALESCE(
            av.raw_data->>'destination',
            av.raw_data->>'Destination',
            av.raw_data->>'current_destination',
            av.raw_data#>>'{MetaData,Destination}',
            av.raw_data#>>'{Message,ShipStaticData,Destination}',
            av.raw_data#>>'{ShipStaticData,Destination}'
          ) AS destination_text
        FROM ais_vessels av
        WHERE av.audit_status = 'VALIDATED'

        UNION ALL

        SELECT
          'OPENSHIPS'::text AS source_system,
          COALESCE(os.raw_data, '{}'::jsonb) || jsonb_build_object(
            'storage_key', os.vessel_key,
            'vessel_key', os.vessel_key,
            'mmsi', os.mmsi,
            'vessel_name', os.vessel_name,
            'latitude', os.latitude,
            'longitude', os.longitude,
            'speed_over_ground', os.speed_over_ground,
            'course_over_ground', os.course_over_ground,
            'heading', os.heading,
            'vessel_type', os.vessel_type,
            'observed_at', os.observed_at,
            'fetched_at', os.fetched_at,
            'distance_nm', CASE
              WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
              ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
                POWER(SIN(RADIANS(os.latitude::double precision - $2) / 2), 2) +
                COS(RADIANS($2)) * COS(RADIANS(os.latitude::double precision)) *
                POWER(SIN(RADIANS(os.longitude::double precision - $3) / 2), 2)
              )))
            END
          ) AS payload,
          COALESCE(os.observed_at, os.fetched_at, os.updated_at) AS sort_at,
          CASE
            WHEN $2::double precision IS NULL OR $3::double precision IS NULL THEN 0
            ELSE 3440.065 * 2 * ASIN(SQRT(LEAST(1,
              POWER(SIN(RADIANS(os.latitude::double precision - $2) / 2), 2) +
              COS(RADIANS($2)) * COS(RADIANS(os.latitude::double precision)) *
                POWER(SIN(RADIANS(os.longitude::double precision - $3) / 2), 2)
              )))
          END AS distance_nm,
          REGEXP_REPLACE(COALESCE(
            os.raw_data->>'imo',
            os.raw_data->>'IMO',
            os.raw_data#>>'{MetaData,IMO}',
            os.raw_data#>>'{Message,ShipStaticData,ImoNumber}',
            ''
          ), '[^0-9]', '', 'g') AS source_imo,
          COALESCE(os.mmsi::text, os.raw_data->>'mmsi', os.raw_data->>'MMSI', '') AS source_mmsi,
          NULL::double precision AS source_dwt,
          NULL::double precision AS source_design_draft,
          COALESCE(
            os.raw_data->>'destination',
            os.raw_data->>'Destination',
            os.raw_data->>'current_destination',
            os.raw_data#>>'{MetaData,Destination}',
            os.raw_data#>>'{Message,ShipStaticData,Destination}',
            os.raw_data#>>'{ShipStaticData,Destination}'
          ) AS destination_text
        FROM openships_latest os
      )
      SELECT source_system, payload, sort_at, distance_nm, source_imo, source_mmsi, source_dwt, source_design_draft, destination_text
      FROM source_rows
      WHERE source_system = ANY($1::text[])
        AND (
          distance_nm <= $5
          OR EXISTS (
            SELECT 1
            FROM unnest($6::text[]) AS destination_alias
            WHERE REGEXP_REPLACE(
              TRANSLATE(
                UPPER(COALESCE(destination_text, '')),
                'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
                'AAAAAAEEEEIIIIOOOOOUUUUCN'
              ),
              '[^A-Z0-9]', '', 'g'
            ) LIKE '%' || destination_alias || '%'
          )
        )
      ORDER BY sort_at DESC NULLS LAST
      LIMIT $4
    `,
    [safeSources, safeLatitude, safeLongitude, candidateLimit, safeRadius, destinationAliases],
  );

  const imoNumbers = Array.from(new Set(result.rows
    .map((row) => String(row.source_imo || "").replace(/\D/g, ""))
    .filter((imo) => imo.length === 7))).map(Number);
  const mmsiNumbers = Array.from(new Set(result.rows
    .map((row) => String(row.source_mmsi || "").replace(/\D/g, ""))
    .filter((mmsi) => mmsi.length === 9)));
  let masterRows: MatchingMasterProfileRow[] = [];
  let masterLookupDegraded = false;
  if (imoNumbers.length > 0 || mmsiNumbers.length > 0) {
    try {
      masterRows = (await pool.query<MatchingMasterProfileRow>(
        `
          SELECT imo_number, mmsi, dwt, draft_meters
          FROM vessels_master
          WHERE imo_number = ANY($1::integer[])
             OR (mmsi IS NOT NULL AND mmsi = ANY($2::text[]))
          ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
        `,
        [imoNumbers, mmsiNumbers],
      )).rows;
    } catch (error) {
      masterLookupDegraded = true;
      console.warn("[matching-sources] Batch master lookup failed; raw source rows preserved.", error instanceof Error ? error.message : String(error));
    }
  }
  const masterByImo = new Map<string, MatchingMasterProfileRow>();
  const masterByMmsi = new Map<string, MatchingMasterProfileRow>();
  masterRows.forEach((row) => {
    const imo = String(row.imo_number || "").replace(/\D/g, "");
    const mmsi = String(row.mmsi || "").replace(/\D/g, "");
    if (imo && !masterByImo.has(imo)) masterByImo.set(imo, row);
    if (mmsi && !masterByMmsi.has(mmsi)) masterByMmsi.set(mmsi, row);
  });

  const commercialCandidates = result.rows.flatMap((row): RankedCommercialCandidate[] => {
    const payload = asRecord(row.payload);
    const sourceImo = String(row.source_imo || "").replace(/\D/g, "");
    const sourceMmsi = String(row.source_mmsi || "").replace(/\D/g, "");
    const master = masterByImo.get(sourceImo) || masterByMmsi.get(sourceMmsi) || null;
    const verifiedDwt = finiteNumber(master?.dwt ?? row.source_dwt ?? firstValue(payload, [["dwt"], ["DWT"]]));
    const designDraft = finiteNumber(master?.draft_meters ?? row.source_design_draft);
    if (!masterLookupDegraded && (verifiedDwt === null || verifiedDwt < minDwt)) return [];
    const distanceNm = finiteNumber(row.distance_nm);
    const eta = candidateEta(payload);
    const speedKnots = candidateSpeed(payload);
    const matchReason = classifyCandidateMatch({
      distanceNm,
      radiusNm: safeRadius,
      destination: candidateDestination(payload),
      polData: request.polData,
      eta,
      speedKnots,
      laycanEnd: request.laycanEnd,
    });
    if (!matchReason) return [];

    const scoringDwt = verifiedDwt ?? 0;
    const dwtDifference = Math.abs(scoringDwt - targetDwt);
    const estimatedArrival = estimateArrivalDate({ eta, distanceNm, speedKnots });
    const estimatedBallastStatus = estimateBallastStatus(candidateDraft(payload), designDraft);
    const laycanCompliant = isLaycanCompliant(estimatedArrival, request.laycanStart, request.laycanEnd);
    const enrichedPayload = {
      ...payload,
      dwt: verifiedDwt ?? firstValue(payload, [["dwt"], ["DWT"]]),
      DWT: verifiedDwt ?? firstValue(payload, [["DWT"], ["dwt"]]),
      verifiedDwt: Boolean(master && verifiedDwt !== null),
      dwtStatus: master && verifiedDwt !== null ? "VERIFIED_VESSELS_MASTER" : "SOURCE_FALLBACK",
      masterLookupDegraded,
      dwtDifference,
      dwtDifferenceMt: dwtDifference,
      estimatedBallastStatus,
      laycanCompliant,
      matchReason: matchReason as MatchReason,
      longDistanceTransitToPol: matchReason === "INBOUND_TO_POL",
      commercialTransitCandidate: matchReason === "INBOUND_TO_POL",
      inboundToPol: matchReason === "INBOUND_TO_POL",
      predictiveMatch: matchReason === "INBOUND_TO_POL",
      operationalLabel: matchReason === "INBOUND_TO_POL" ? "Inbound to POL" : null,
      searchVector: matchReason === "INBOUND_TO_POL" ? "DESTINATION_GLOBAL" : "RADIAL",
      estimatedArrivalAt: estimatedArrival?.toISOString() ?? null,
      distance_nm: distanceNm,
      verified_design_draft: designDraft,
    };
    return [{
      source_system: row.source_system,
      payload: enrichedPayload,
      total_count: 0,
      dwtDifference,
      estimatedBallastStatus,
      laycanCompliant,
      distanceNm,
    }];
  });

  const rankedCandidates = sortCandidates(commercialCandidates);
  const totalCount = rankedCandidates.length;
  const rows = rankedCandidates.slice(safeOffset, safeOffset + safeLimit).map((candidate) => ({
    source_system: candidate.source_system,
    payload: candidate.payload,
    total_count: totalCount,
  }));

  return {
    rows,
    totalCount,
    limit: safeLimit,
    offset: safeOffset,
  };
}

const DATA_BRIDGE_COLUMNS = `
  imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
  draft_meters, flag, eta, last_port, current_destination, year_built,
  gross_tonnage, loa_meters,
  owner_manager, has_gears, process_status, source_payload,
  status, validation_status, origen, fecha_ultima_actualizacion AS updated_at
`;

export async function listDataBridgePortfolioVessels(limit = 2000) {
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query<VesselMasterRow>(
    `
      SELECT ${DATA_BRIDGE_COLUMNS}
      FROM vessels_master
      WHERE (status = 'EN_CARTERA'
        OR validation_status = 'VALIDADO')
        AND UPPER(COALESCE(status, '')) NOT IN ('PENDING', 'PENDING_AUDIT')
        AND UPPER(COALESCE(audit_status, '')) NOT IN ('PENDING', 'IN_DUE_DILIGENCE', 'REJECTED')
        AND UPPER(COALESCE(process_status, '')) NOT IN ('PENDING_REVIEW', 'DUE_DILIGENCE')
      ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

export async function listValidatedAisVesselsNearPol(
  latitude: number,
  longitude: number,
  radiusNm: number,
  limit = 2000,
) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const safeRadius = Math.min(5000, Math.max(1, radiusNm));
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const latitudeDelta = safeRadius / 60;
  const longitudeScale = Math.max(Math.cos(latitude * Math.PI / 180), 0.01);
  const longitudeDelta = Math.min(180, safeRadius / (60 * longitudeScale));
  const minLatitude = Math.max(-90, latitude - latitudeDelta);
  const maxLatitude = Math.min(90, latitude + latitudeDelta);
  const rawMinLongitude = longitude - longitudeDelta;
  const rawMaxLongitude = longitude + longitudeDelta;
  const crossesAntimeridian = rawMinLongitude < -180 || rawMaxLongitude > 180;
  const minLongitude = rawMinLongitude < -180 ? rawMinLongitude + 360 : rawMinLongitude;
  const maxLongitude = rawMaxLongitude > 180 ? rawMaxLongitude - 360 : rawMaxLongitude;

  const result = await getPool().query<AisMatchingRow>(
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
          AND audit_status = 'VALIDATED'
      )
      SELECT *
      FROM candidates
      WHERE distance_nm <= $8
      ORDER BY distance_nm ASC, last_seen_at DESC
      LIMIT $9
    `,
    [
      latitude,
      longitude,
      minLatitude,
      maxLatitude,
      minLongitude,
      maxLongitude,
      crossesAntimeridian,
      safeRadius,
      safeLimit,
    ],
  );
  return result.rows;
}
