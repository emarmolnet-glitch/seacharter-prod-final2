import type { QueryResultRow } from "pg";
import { getPool } from "./index.js";

export type VesselTechnicalRecord = {
  imoNumber: number | null;
  mmsi: string | null;
  vesselName: string | null;
  dwt: number | null;
  latitude: number | null;
  longitude: number | null;
  vesselType: string | null;
  draftMeters: number | null;
  flag: string | null;
  yearBuilt: number | null;
  grossTonnage: number | null;
  loaMeters: number | null;
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
  year_built: number | null;
  gross_tonnage: number | string | null;
  loa_meters: number | string | null;
};

const RETURNING_COLUMNS = `
  imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
  draft_meters, flag, year_built, gross_tonnage, loa_meters
`;

function toRecord(row: VesselTechnicalRow): VesselTechnicalRecord {
  return {
    imoNumber: row.imo_number,
    mmsi: row.mmsi,
    vesselName: row.vessel_name,
    dwt: row.dwt,
    latitude: row.latitude,
    longitude: row.longitude,
    vesselType: row.vessel_type,
    draftMeters: row.draft_meters,
    flag: row.flag,
    yearBuilt: row.year_built,
    grossTonnage: row.gross_tonnage === null ? null : Number(row.gross_tonnage),
    loaMeters: row.loa_meters === null ? null : Number(row.loa_meters),
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
  const result = await getPool().query<VesselTechnicalRow>(
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
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

export async function upsertVesselTechnicalRecord(record: VesselTechnicalRecord) {
  if (!record.imoNumber && !record.mmsi) {
    throw new Error("Se requiere IMO o MMSI válido para persistir los datos técnicos.");
  }

  const result = await getPool().query<VesselTechnicalRow>(
    `
      WITH matched_vessel AS (
        SELECT id
        FROM vessels_master
        WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
           OR ($2::text IS NOT NULL AND mmsi = $2::text)
        ORDER BY CASE WHEN imo_number = $1::integer THEN 0 ELSE 1 END
        LIMIT 1
      ),
      updated_vessel AS (
        UPDATE vessels_master
        SET
          imo_number = COALESCE($1::integer, vessels_master.imo_number),
          mmsi = COALESCE($2::text, vessels_master.mmsi),
          vessel_name = COALESCE($3::text, vessels_master.vessel_name),
          dwt = COALESCE($4::integer, vessels_master.dwt),
          latitude = COALESCE($5::double precision, vessels_master.latitude),
          longitude = COALESCE($6::double precision, vessels_master.longitude),
          vessel_type = COALESCE($7::text, vessels_master.vessel_type),
          draft_meters = COALESCE($8::double precision, vessels_master.draft_meters),
          flag = COALESCE($9::text, vessels_master.flag),
          year_built = COALESCE($10::integer, vessels_master.year_built),
          gross_tonnage = COALESCE($11::double precision, vessels_master.gross_tonnage),
          loa_meters = COALESCE($12::double precision, vessels_master.loa_meters),
          updated_at = NOW(),
          fecha_ultima_actualizacion = NOW()
        WHERE id = (SELECT id FROM matched_vessel)
        RETURNING ${RETURNING_COLUMNS}
      ),
      inserted_vessel AS (
        INSERT INTO vessels_master (
          imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
          draft_meters, flag, year_built, gross_tonnage, loa_meters,
          updated_at, fecha_ultima_actualizacion
        )
        SELECT
          $1::integer, $2::text, $3::text, $4::integer, $5::double precision,
          $6::double precision, $7::text, $8::double precision, $9::text,
          $10::integer, $11::double precision, $12::double precision, NOW(), NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated_vessel)
        ON CONFLICT (imo_number) DO UPDATE SET
          mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
          vessel_name = COALESCE(EXCLUDED.vessel_name, vessels_master.vessel_name),
          dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
          latitude = COALESCE(EXCLUDED.latitude, vessels_master.latitude),
          longitude = COALESCE(EXCLUDED.longitude, vessels_master.longitude),
          vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
          draft_meters = COALESCE(EXCLUDED.draft_meters, vessels_master.draft_meters),
          flag = COALESCE(EXCLUDED.flag, vessels_master.flag),
          year_built = COALESCE(EXCLUDED.year_built, vessels_master.year_built),
          gross_tonnage = COALESCE(EXCLUDED.gross_tonnage, vessels_master.gross_tonnage),
          loa_meters = COALESCE(EXCLUDED.loa_meters, vessels_master.loa_meters),
          updated_at = NOW(),
          fecha_ultima_actualizacion = NOW()
        RETURNING ${RETURNING_COLUMNS}
      )
      SELECT * FROM updated_vessel
      UNION ALL
      SELECT * FROM inserted_vessel
      LIMIT 1
    `,
    [
      record.imoNumber,
      record.mmsi,
      record.vesselName,
      record.dwt,
      record.latitude,
      record.longitude,
      record.vesselType,
      record.draftMeters,
      record.flag,
      record.yearBuilt,
      record.grossTonnage,
      record.loaMeters,
    ],
  );

  if (!result.rows[0]) throw new Error("No se pudo consolidar el buque en vessels_master.");
  return toRecord(result.rows[0]);
}
