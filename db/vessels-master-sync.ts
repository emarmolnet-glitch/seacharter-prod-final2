import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./index.js";

export type RadarVesselMasterInput = {
  imoNumber: string | null;
  mmsi: string | null;
  vesselName: string | null;
  shipType: string | null;
  draught: number | null;
  dwt?: number | null;
  latitude: number;
  longitude: number;
  destination: string | null;
  lastPortOfCall: string | null;
  eta: string | null;
  source: string;
  rawData: unknown;
  flag?: string | null;
  yearBuilt?: number | null;
  ownerManager?: string | null;
  hasGears?: boolean | null;
  processStatus?: string | null;
  systemIdentity?: string | null;
};

type NormalizedMasterVessel = RadarVesselMasterInput & {
  imoValue: number | null;
  mmsiValue: string | null;
  vesselNameValue: string;
  identity: string;
};

function validRadarImo(value: string | null) {
  const normalized = String(value || "").trim();
  return /^\d{7}$/.test(normalized) ? Number(normalized) : null;
}

function validRadarMmsi(value: string | null) {
  const normalized = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(normalized) ? normalized : null;
}

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

function validIsoDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeMasterVessel(row: RadarVesselMasterInput): NormalizedMasterVessel | null {
  const imoValue = validRadarImo(row.imoNumber);
  const mmsiValue = validRadarMmsi(row.mmsi);
  const suppliedSystemIdentity = String(row.systemIdentity || "").trim();
  if ((!imoValue && !mmsiValue && !suppliedSystemIdentity) || !validCoordinate(row.latitude, row.longitude)) return null;

  const identity = imoValue
    ? `AIS:IMO:${imoValue}`
    : mmsiValue
      ? `AIS:MMSI:${mmsiValue}`
      : `COREPRO:${createHash("sha256").update(suppliedSystemIdentity).digest("hex")}`;
  const vesselNameValue = String(row.vesselName || "").trim()
    || (mmsiValue ? `MMSI ${mmsiValue}` : imoValue ? `IMO ${imoValue}` : "Core PRO Vessel");
  return { ...row, imoValue, mmsiValue, vesselNameValue, identity };
}

function queryValues(vessel: NormalizedMasterVessel) {
  return [
    vessel.imoValue,
    vessel.vesselNameValue,
    Number.isFinite(vessel.dwt) ? Math.trunc(Number(vessel.dwt)) : null,
    vessel.mmsiValue,
    vessel.latitude,
    vessel.longitude,
    vessel.shipType,
    Number.isFinite(vessel.draught) ? vessel.draught : null,
    validIsoDate(vessel.eta),
    vessel.lastPortOfCall,
    vessel.destination,
    vessel.source || "AISStream",
    JSON.stringify(vessel.rawData && typeof vessel.rawData === "object" ? vessel.rawData : {}),
    vessel.identity,
    vessel.flag || null,
    Number.isFinite(vessel.yearBuilt) ? Math.trunc(Number(vessel.yearBuilt)) : null,
    vessel.ownerManager || null,
    typeof vessel.hasGears === "boolean" ? vessel.hasGears : null,
    vessel.processStatus || "SYNCED",
  ];
}

const UPDATE_MASTER_FIELDS = `
  vessel_name = $2,
  dwt = COALESCE($3, dwt),
  mmsi = COALESCE($4, mmsi),
  latitude = $5,
  longitude = $6,
  vessel_type = COALESCE($7, vessel_type),
  draft_meters = COALESCE($8, draft_meters),
  eta = COALESCE($9, eta),
  last_port = COALESCE($10, last_port),
  current_destination = COALESCE($11, current_destination),
  origen = $12,
  audit_source = $12,
  source_payload = $13::jsonb,
  system_identity = COALESCE(system_identity, $14),
  flag = COALESCE($15, flag),
  year_built = COALESCE($16, year_built),
  owner_manager = COALESCE($17, owner_manager),
  has_gears = COALESCE($18, has_gears),
  process_status = $19,
  fecha_ultima_actualizacion = NOW()
`;

async function persistMasterVessel(client: PoolClient, vessel: NormalizedMasterVessel) {
  const values = queryValues(vessel);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [vessel.identity]);

  if (vessel.imoValue) {
    const byImo = await client.query(
      `UPDATE vessels_master SET ${UPDATE_MASTER_FIELDS} WHERE imo_number = $1 RETURNING id`,
      values,
    );
    if (byImo.rowCount) return;

    if (vessel.mmsiValue) {
      const byMmsi = await client.query(
        `UPDATE vessels_master SET imo_number = $1, ${UPDATE_MASTER_FIELDS} WHERE mmsi = $4 AND (imo_number IS NULL OR imo_number = 0) RETURNING id`,
        values,
      );
      if (byMmsi.rowCount) return;
    }
  } else if (vessel.mmsiValue) {
    const byMmsi = await client.query(
      `UPDATE vessels_master SET imo_number = COALESCE($1::integer, imo_number), ${UPDATE_MASTER_FIELDS} WHERE mmsi = $4 RETURNING id`,
      values,
    );
    if (byMmsi.rowCount) return;
  } else {
    const bySystemIdentity = await client.query(
      `UPDATE vessels_master SET imo_number = COALESCE($1::integer, imo_number), ${UPDATE_MASTER_FIELDS} WHERE system_identity = $14 RETURNING id`,
      values,
    );
    if (bySystemIdentity.rowCount) return;
  }

  await client.query(
    `
      INSERT INTO vessels_master (
        imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
        draft_meters, eta, last_port, current_destination, origen, audit_source,
        source_payload, system_identity, flag, year_built, owner_manager,
        has_gears, process_status, fecha_ultima_actualizacion
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $12,
        $13::jsonb, $14, $15, $16, $17,
        $18, $19, NOW()
      )
    `,
    values,
  );
}

export async function upsertRadarVesselsMaster(rows: RadarVesselMasterInput[]) {
  const vessels = rows.map(normalizeMasterVessel).filter((row): row is NormalizedMasterVessel => row !== null);
  if (vessels.length === 0) return 0;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const vessel of vessels) await persistMasterVessel(client, vessel);
    await client.query("COMMIT");
    return vessels.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
