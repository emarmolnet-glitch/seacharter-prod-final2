import type { QueryResultRow } from "pg";
import { getPool } from "./index.js";

export type VesselMasterRow = QueryResultRow & {
  imo_number: string;
  vessel_name: string;
  dwt: number | null;
  mmsi: string | null;
  latitude: number | null;
  longitude: number | null;
  vessel_type: string | null;
  draft_meters: number | null;
  flag: string | null;
  eta: string | null;
  last_port: string | null;
  current_destination: string | null;
  year_built: string | null;
  owner_manager: string | null;
  has_gears: boolean;
  process_status: string | null;
  source_payload: unknown;
  updated_at: Date | string;
};

export type VesselMasterAuditRow = QueryResultRow & {
  id: unknown;
  vessel_name: string | null;
  imo_number: string | null;
  vessel_type: string | null;
  dwt: number | null;
  status: string | null;
  audit_status: string | null;
  origen: string | null;
  fecha_ultima_actualizacion: Date | string | null;
};

const VESSEL_MASTER_COLUMNS = `
  imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
  draft_meters, flag, eta, last_port, current_destination, year_built,
  owner_manager, has_gears, process_status, source_payload, updated_at
`;

export async function findExactVesselsMasterRows(
  imoNumbers: string[],
  mmsiNumbers: string[],
  vesselNames: string[],
) {
  if (imoNumbers.length === 0 && mmsiNumbers.length === 0 && vesselNames.length === 0) return [];
  const result = await getPool().query<VesselMasterRow>(
    `
      SELECT ${VESSEL_MASTER_COLUMNS}
      FROM vessels_master
      WHERE imo_number = ANY($1::text[])
        OR mmsi = ANY($2::text[])
        OR LOWER(REGEXP_REPLACE(vessel_name, '[^a-zA-Z0-9]+', ' ', 'g')) = ANY($3::text[])
    `,
    [imoNumbers, mmsiNumbers, vesselNames],
  );
  return result.rows;
}

export async function listLocalVesselsMaster(limit = 2000) {
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query<VesselMasterRow>(
    `
      SELECT ${VESSEL_MASTER_COLUMNS}
      FROM vessels_master
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}

export async function listVesselsMasterPendingAudit(limit = 5000) {
  const safeLimit = Math.min(5000, Math.max(1, Math.trunc(limit)));
  const result = await getPool().query<VesselMasterAuditRow>(
    `
      SELECT
        id,
        vessel_name,
        imo_number,
        vessel_type,
        dwt,
        status,
        audit_status,
        origen,
        fecha_ultima_actualizacion
      FROM vessels_master
      WHERE audit_status = 'PENDING'
        OR status = 'PENDING'
        OR audit_status IS NULL
      ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
      LIMIT $1
    `,
    [safeLimit],
  );
  return result.rows;
}
