import type { PoolClient, QueryResultRow } from "pg";
import { getPool } from "./index.js";
import { prepareVesselTechnicalPersistence } from "./vessel-technical-normalizer.mjs";

export type VesselTechnicalRecord = {
  imoNumber: number | null;
  mmsi: string | null;
  vesselName: string | null;
  dwt: number | null;
  latitude: number | null;
  longitude: number | null;
  vesselType: string | null;
  vesselClass?: string | null;
  commercialClass?: string | null;
  draftMeters: number | null;
  flag: string | null;
  callSign: string | null;
  yearBuilt: number | null;
  grossTonnage: number | null;
  netTonnage: number | null;
  loaMeters: number | null;
  beamMeters: number | null;
  lastPort: string | null;
  eta: string | Date | null;
  serviceSpeedKnots?: number | null;
  speedLaden?: number | null;
  speedBallast?: number | null;
  fuelConsumptionLaden?: number | null;
  fuelConsumptionBallast?: number | null;
  fuelConsumptionPort?: number | null;
  consSea?: number | null;
  consPort?: number | null;
  consBallast?: number | null;
  ownerManager?: string | null;
  hasGears?: boolean | null;
  hasScrubber?: boolean | null;
  sourcePayload?: unknown;
  auditStatus?: string | null;
  validationStatus?: string | null;
  dataSource?: string | null;
};

type VesselTechnicalRow = QueryResultRow & {
  imo_number: number | null;
  mmsi: string | null;
  vessel_name: string | null;
  dwt: number | null;
  latitude: number | null;
  longitude: number | null;
  vessel_type: string | null;
  draft_meters: number | null;
  flag: string | null;
  call_sign: string | null;
  year_built: number | null;
  gross_tonnage: number | string | null;
  net_tonnage: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
  last_port: string | null;
  eta: string | Date | null;
  owner_manager?: string | null;
  has_gears?: boolean | null;
  service_speed_knots?: number | string | null;
  process_status?: string | null;
  status?: string | null;
  validation_status?: string | null;
  audit_status?: string | null;
  source_payload?: unknown;
};

const RETURNING_COLUMNS = `
  imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
  draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
  loa_meters, beam_meters, last_port, eta
`;

const EXTENDED_QUERY_COLUMNS = `
  imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
  draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
  loa_meters, beam_meters, last_port, eta, owner_manager, has_gears,
  service_speed_knots, process_status, status, validation_status, audit_status,
  source_payload
`;

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function parsePositiveNumber(val: unknown): number | null {
  const num = parseNumber(val);
  return num !== null && num > 0 ? num : null;
}

function toRecord(row: VesselTechnicalRow): VesselTechnicalRecord {
  const sourcePayload = asRecord(row.source_payload);
  const metadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);

  const ownerManager = row.owner_manager
    || (sourcePayload.owner_manager as string)
    || (sourcePayload.owner as string)
    || (sourcePayload.manager as string)
    || (metadata.Owner as string)
    || (metadata.Manager as string)
    || (metadata.CommercialManager as string)
    || null;

  const serviceSpeed = parsePositiveNumber(
    row.service_speed_knots
    ?? sourcePayload.service_speed_knots
    ?? sourcePayload.serviceSpeedKnots
    ?? metadata.Speed
    ?? metadata.speed_knots
  );

  const speedLaden = parsePositiveNumber(
    sourcePayload.spd_laden
    ?? sourcePayload.speed_laden
    ?? sourcePayload.speedLaden
    ?? row.service_speed_knots
    ?? serviceSpeed
  );

  const speedBallast = parsePositiveNumber(
    sourcePayload.spd_ballast
    ?? sourcePayload.speed_ballast
    ?? sourcePayload.speedBallast
    ?? row.service_speed_knots
    ?? serviceSpeed
  );

  const fuelConsumptionLaden = parsePositiveNumber(
    sourcePayload.fuel_consumption_laden
    ?? sourcePayload.cons_sea
    ?? sourcePayload.consSea
    ?? metadata.FuelConsumption
    ?? metadata.Daily_Consumption
  );

  const fuelConsumptionPort = parsePositiveNumber(
    sourcePayload.fuel_consumption_port
    ?? sourcePayload.cons_port
    ?? sourcePayload.consPort
    ?? metadata.PortConsumption
    ?? metadata.Daily_Port_Consumption
  );

  const fuelConsumptionBallast = parsePositiveNumber(
    sourcePayload.fuel_consumption_ballast
    ?? sourcePayload.cons_ballast
    ?? sourcePayload.consBallast
    ?? fuelConsumptionLaden
  );

  const vesselClass = (sourcePayload.vessel_class as string)
    || (sourcePayload.commercial_class as string)
    || row.vessel_type
    || (sourcePayload.vessel_type as string)
    || null;

  const hasScrubber = sourcePayload.has_scrubber !== undefined
    ? Boolean(sourcePayload.has_scrubber)
    : sourcePayload.hasScrubber !== undefined
    ? Boolean(sourcePayload.hasScrubber)
    : metadata.HasScrubber !== undefined
    ? Boolean(metadata.HasScrubber)
    : null;

  return {
    imoNumber: row.imo_number,
    mmsi: row.mmsi,
    vesselName: row.vessel_name,
    dwt: row.dwt,
    latitude: row.latitude,
    longitude: row.longitude,
    vesselType: row.vessel_type,
    vesselClass,
    commercialClass: vesselClass,
    draftMeters: row.draft_meters,
    flag: row.flag,
    callSign: row.call_sign,
    yearBuilt: row.year_built,
    grossTonnage: row.gross_tonnage === null ? null : Number(row.gross_tonnage),
    netTonnage: row.net_tonnage === null ? null : Number(row.net_tonnage),
    loaMeters: row.loa_meters === null ? null : Number(row.loa_meters),
    beamMeters: row.beam_meters === null ? null : Number(row.beam_meters),
    lastPort: row.last_port,
    eta: row.eta instanceof Date ? row.eta.toISOString() : row.eta,
    serviceSpeedKnots: serviceSpeed,
    speedLaden,
    speedBallast,
    fuelConsumptionLaden,
    fuelConsumptionBallast,
    fuelConsumptionPort,
    consSea: fuelConsumptionLaden,
    consPort: fuelConsumptionPort,
    consBallast: fuelConsumptionBallast,
    ownerManager,
    hasGears: row.has_gears ?? (sourcePayload.has_gears as boolean | null) ?? null,
    hasScrubber,
    sourcePayload: row.source_payload,
    auditStatus: row.audit_status || null,
    validationStatus: row.validation_status || null,
    dataSource: "vessels_master",
  };
}

export function hasCachedMandatoryTechnicalData(record: VesselTechnicalRecord | null) {
  return Boolean(
    record
    && Number(record.grossTonnage) > 0
    && Number(record.loaMeters) > 0,
  );
}

export async function findVesselTechnicalRecord(
  imoNumber: number | null,
  mmsi: string | null,
  vesselName: string | null = null,
) {
  if (!imoNumber && !mmsi && !vesselName) return null;
  const pool = getPool();

  try {
    const result = await pool.query<VesselTechnicalRow>(
      `
        SELECT ${EXTENDED_QUERY_COLUMNS}
        FROM vessels_master
        WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
           OR ($2::text IS NOT NULL AND mmsi = $2::text)
           OR ($3::text IS NOT NULL AND LOWER(BTRIM(vessel_name)) = LOWER(BTRIM($3::text)))
        ORDER BY
          CASE
            WHEN imo_number = $1::integer THEN 0
            WHEN mmsi = $2::text THEN 1
            ELSE 2
          END,
          fecha_ultima_actualizacion DESC NULLS LAST
        LIMIT 1
      `,
      [imoNumber, mmsi, vesselName],
    );

    if (result.rows[0]) {
      return toRecord(result.rows[0]);
    }
  } catch (err) {
    // If extended query fails due to missing optional columns, fallback to standard columns
    const fallbackResult = await pool.query<VesselTechnicalRow>(
      `
        SELECT ${RETURNING_COLUMNS}
        FROM vessels_master
        WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
           OR ($2::text IS NOT NULL AND mmsi = $2::text)
           OR ($3::text IS NOT NULL AND LOWER(BTRIM(vessel_name)) = LOWER(BTRIM($3::text)))
        ORDER BY
          CASE
            WHEN imo_number = $1::integer THEN 0
            WHEN mmsi = $2::text THEN 1
            ELSE 2
          END
        LIMIT 1
      `,
      [imoNumber, mmsi, vesselName],
    );
    if (fallbackResult.rows[0]) {
      return toRecord(fallbackResult.rows[0]);
    }
  }

  // Fallback: Check ais_vessels if not found in vessels_master
  try {
    const aisResult = await pool.query<{
      imo_number: string;
      mmsi: string | null;
      vessel_name: string | null;
      vessel_type: string | null;
      latitude: number | null;
      longitude: number | null;
      source: string | null;
      audit_status: string | null;
      raw_data: unknown;
    }>(
      `
        SELECT
          imo_number,
          mmsi,
          vessel_name,
          vessel_type,
          latitude,
          longitude,
          source,
          audit_status,
          raw_data
        FROM ais_vessels
        WHERE ($1::text IS NOT NULL AND regexp_replace(imo_number, '\\D', '', 'g') = $1::text)
           OR ($2::text IS NOT NULL AND mmsi = $2::text)
           OR ($3::text IS NOT NULL AND LOWER(BTRIM(vessel_name)) = LOWER(BTRIM($3::text)))
        ORDER BY
          CASE
            WHEN regexp_replace(imo_number, '\\D', '', 'g') = $1::text THEN 0
            WHEN mmsi = $2::text THEN 1
            ELSE 2
          END
        LIMIT 1
      `,
      [imoNumber ? String(imoNumber) : null, mmsi, vesselName],
    );

    if (aisResult.rows[0]) {
      const row = aisResult.rows[0];
      const rawData = asRecord(row.raw_data);
      const meta = asRecord(rawData.MetaData || rawData.metadata);
      const parsedImo = parseNumber(row.imo_number) || parseNumber(rawData.imo) || imoNumber;
      return {
        imoNumber: parsedImo,
        mmsi: row.mmsi || (rawData.mmsi as string) || null,
        vesselName: row.vessel_name || (rawData.vessel_name as string) || (rawData.name as string) || null,
        dwt: parseNumber(rawData.dwt ?? meta.DWT),
        latitude: row.latitude ?? parseNumber(rawData.latitude),
        longitude: row.longitude ?? parseNumber(rawData.longitude),
        vesselType: row.vessel_type || (rawData.vessel_type as string) || null,
        vesselClass: (rawData.vessel_class as string) || (rawData.commercial_class as string) || row.vessel_type || null,
        commercialClass: (rawData.commercial_class as string) || (rawData.vessel_class as string) || row.vessel_type || null,
        draftMeters: parseNumber(rawData.draft_meters ?? rawData.draft),
        flag: (rawData.flag as string) || (meta.Flag as string) || null,
        callSign: (rawData.call_sign as string) || null,
        yearBuilt: parseNumber(rawData.year_built ?? rawData.built_year ?? meta.Year_Built),
        grossTonnage: parseNumber(rawData.gross_tonnage ?? rawData.gt ?? meta.GT),
        netTonnage: parseNumber(rawData.net_tonnage ?? rawData.nt ?? meta.NT),
        loaMeters: parseNumber(rawData.loa_meters ?? rawData.loa ?? meta.LOA),
        beamMeters: parseNumber(rawData.beam_meters ?? rawData.beam ?? meta.Beam),
        lastPort: (rawData.last_port as string) || null,
        eta: (rawData.eta as string) || null,
        serviceSpeedKnots: parseNumber(rawData.service_speed_knots ?? meta.Speed),
        speedLaden: parseNumber(rawData.spd_laden ?? rawData.speed_laden ?? rawData.service_speed_knots),
        speedBallast: parseNumber(rawData.spd_ballast ?? rawData.speed_ballast ?? rawData.service_speed_knots),
        fuelConsumptionLaden: parseNumber(rawData.fuel_consumption_laden ?? rawData.cons_sea),
        fuelConsumptionBallast: parseNumber(rawData.fuel_consumption_ballast ?? rawData.cons_ballast),
        fuelConsumptionPort: parseNumber(rawData.fuel_consumption_port ?? rawData.cons_port),
        consSea: parseNumber(rawData.fuel_consumption_laden ?? rawData.cons_sea),
        consPort: parseNumber(rawData.fuel_consumption_port ?? rawData.cons_port),
        consBallast: parseNumber(rawData.fuel_consumption_ballast ?? rawData.cons_ballast),
        ownerManager: (rawData.owner_manager as string) || (rawData.manager as string) || (meta.Owner as string) || (meta.Manager as string) || null,
        hasGears: (rawData.has_gears as boolean | null) ?? null,
        hasScrubber: (rawData.has_scrubber as boolean | null) ?? null,
        sourcePayload: rawData,
        auditStatus: row.audit_status || null,
        dataSource: "ais_vessels",
      };
    }
  } catch (_) {
    // If ais_vessels query fails, continue
  }

  return null;
}

export async function upsertVesselTechnicalRecord(
  record: VesselTechnicalRecord,
  queryClient: Pick<PoolClient, "query"> = getPool(),
  status: string | null = null,
) {
  const { vessel, parameters } = prepareVesselTechnicalPersistence(record);
  const normalizedStatus = status?.trim() || null;
  const queryParameters = normalizedStatus ? [...parameters, normalizedStatus] : parameters;
  const statusColumnSql = normalizedStatus ? ", status" : "";
  const statusValueSql = normalizedStatus ? ", $18::text" : "";
  const statusUpdateSql = normalizedStatus ? "status = EXCLUDED.status," : "";
  const directStatusUpdateSql = normalizedStatus ? "status = $18::text," : "";
  if (!vessel.imoNumber && !vessel.mmsi) {
    throw new Error("Se requiere IMO o MMSI válido para persistir los datos técnicos.");
  }

  const conflictColumn = vessel.mmsi ? "mmsi" : "imo_number";
  const consolidatedUpsertSql = `
      WITH matched_vessel AS (
        SELECT id
        FROM vessels_master
        WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
           OR ($2::text IS NOT NULL AND mmsi = $2::text)
        ORDER BY CASE WHEN mmsi = $2::text THEN 0 ELSE 1 END
        LIMIT 1
      ),
      updated_vessel AS (
        UPDATE vessels_master
        SET
          imo_number = CASE
            WHEN $1::integer IS NULL OR vessels_master.imo_number = $1::integer
              THEN COALESCE($1::integer, vessels_master.imo_number)
            WHEN EXISTS (
              SELECT 1
              FROM vessels_master AS imo_conflict
              WHERE imo_conflict.imo_number = $1::integer
                AND imo_conflict.id <> vessels_master.id
            ) THEN vessels_master.imo_number
            ELSE $1::integer
          END,
          mmsi = COALESCE($2::text, vessels_master.mmsi),
          vessel_name = COALESCE($3::text, vessels_master.vessel_name),
          dwt = COALESCE($4::integer, vessels_master.dwt),
          latitude = COALESCE($5::double precision, vessels_master.latitude),
          longitude = COALESCE($6::double precision, vessels_master.longitude),
          vessel_type = COALESCE($7::text, vessels_master.vessel_type),
          draft_meters = COALESCE($8::double precision, vessels_master.draft_meters),
          flag = COALESCE($9::text, vessels_master.flag),
          call_sign = COALESCE($10::text, vessels_master.call_sign),
          year_built = COALESCE($11::integer, vessels_master.year_built),
          gross_tonnage = COALESCE($12::double precision, vessels_master.gross_tonnage),
          net_tonnage = COALESCE($13::double precision, vessels_master.net_tonnage),
          loa_meters = COALESCE($14::double precision, vessels_master.loa_meters),
          beam_meters = COALESCE($15::double precision, vessels_master.beam_meters),
          last_port = COALESCE($16::text, vessels_master.last_port),
          eta = COALESCE(NULLIF($17::text, '')::timestamptz, vessels_master.eta),
          ${directStatusUpdateSql}
          updated_at = NOW(),
          fecha_ultima_actualizacion = NOW()
        WHERE id = (SELECT id FROM matched_vessel)
        RETURNING ${RETURNING_COLUMNS}
      ),
      inserted_vessel AS (
        INSERT INTO vessels_master (
          imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
          draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
          loa_meters, beam_meters, last_port, eta${statusColumnSql},
          updated_at, fecha_ultima_actualizacion
        )
        SELECT
          $1::integer, $2::text, $3::text, $4::integer, $5::double precision,
          $6::double precision, $7::text, $8::double precision, $9::text,
          $10::text, $11::integer, $12::double precision, $13::double precision,
          $14::double precision, $15::double precision, $16::text,
          NULLIF($17::text, '')::timestamptz${statusValueSql}, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated_vessel)
        ON CONFLICT (${conflictColumn}) DO UPDATE SET
          imo_number = CASE
            WHEN EXCLUDED.imo_number IS NULL OR vessels_master.imo_number = EXCLUDED.imo_number
              THEN COALESCE(EXCLUDED.imo_number, vessels_master.imo_number)
            WHEN EXISTS (
              SELECT 1
              FROM vessels_master AS imo_conflict
              WHERE imo_conflict.imo_number = EXCLUDED.imo_number
                AND imo_conflict.id <> vessels_master.id
            ) THEN vessels_master.imo_number
            ELSE EXCLUDED.imo_number
          END,
          mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
          vessel_name = COALESCE(EXCLUDED.vessel_name, vessels_master.vessel_name),
          dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
          latitude = COALESCE(EXCLUDED.latitude, vessels_master.latitude),
          longitude = COALESCE(EXCLUDED.longitude, vessels_master.longitude),
          vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
          draft_meters = COALESCE(EXCLUDED.draft_meters, vessels_master.draft_meters),
          flag = COALESCE(EXCLUDED.flag, vessels_master.flag),
          call_sign = COALESCE(EXCLUDED.call_sign, vessels_master.call_sign),
          year_built = COALESCE(EXCLUDED.year_built, vessels_master.year_built),
          gross_tonnage = COALESCE(EXCLUDED.gross_tonnage, vessels_master.gross_tonnage),
          net_tonnage = COALESCE(EXCLUDED.net_tonnage, vessels_master.net_tonnage),
          loa_meters = COALESCE(EXCLUDED.loa_meters, vessels_master.loa_meters),
          beam_meters = COALESCE(EXCLUDED.beam_meters, vessels_master.beam_meters),
          last_port = COALESCE(EXCLUDED.last_port, vessels_master.last_port),
          eta = COALESCE(EXCLUDED.eta, vessels_master.eta),
          ${statusUpdateSql}
          updated_at = NOW(),
          fecha_ultima_actualizacion = NOW()
        RETURNING ${RETURNING_COLUMNS}
      )
      SELECT * FROM updated_vessel
      UNION ALL
      SELECT * FROM inserted_vessel
      LIMIT 1
  `;

  const result = await queryClient.query<VesselTechnicalRow>(
    consolidatedUpsertSql,
    queryParameters,
  );

  if (!result.rows[0]) throw new Error("No se pudo consolidar el buque en vessels_master.");
  return toRecord(result.rows[0]);
}
