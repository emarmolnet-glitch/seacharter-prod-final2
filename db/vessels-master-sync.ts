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

function safeJsonSerialize(value: unknown): string {
  if (value === null || value === undefined) return "{}";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch {
      return JSON.stringify({ rawText: value });
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
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
    safeJsonSerialize(vessel.rawData),
    vessel.identity,
    vessel.flag || null,
    Number.isFinite(vessel.yearBuilt) ? Math.trunc(Number(vessel.yearBuilt)) : null,
    vessel.ownerManager || null,
    typeof vessel.hasGears === "boolean" ? vessel.hasGears : null,
    vessel.processStatus || "SYNCED",
  ];
}

const UPDATE_MASTER_FIELDS = `
  vessel_name = $2::text,
  dwt = COALESCE($3::integer, dwt),
  mmsi = COALESCE($4::text, mmsi),
  latitude = $5::double precision,
  longitude = $6::double precision,
  vessel_type = COALESCE($7::text, vessel_type),
  draft_meters = COALESCE($8::double precision, draft_meters),
  eta = COALESCE($9::text, eta),
  last_port = COALESCE($10::text, last_port),
  current_destination = COALESCE($11::text, current_destination),
  origen = $12::text,
  audit_source = $12::text,
  source_payload = $13::jsonb,
  system_identity = COALESCE(system_identity, $14::text),
  flag = COALESCE($15::text, flag),
  year_built = COALESCE($16::integer, year_built),
  owner_manager = COALESCE($17::text, owner_manager),
  has_gears = COALESCE($18::boolean, has_gears),
  process_status = $19::text,
  fecha_ultima_actualizacion = NOW()
`;

async function persistMasterVessel(client: PoolClient, vessel: NormalizedMasterVessel) {
  const values = queryValues(vessel);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [vessel.identity]);

  if (vessel.imoValue) {
    await client.query(
      `
        INSERT INTO vessels_master (
          imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
          draft_meters, eta, last_port, current_destination, origen, audit_source,
          source_payload, system_identity, flag, year_built, owner_manager,
          has_gears, process_status, fecha_ultima_actualizacion
        )
        VALUES (
          $1::integer, $2::text, $3::integer, $4::text, $5::double precision, $6::double precision, $7::text,
          $8::double precision, $9::text, $10::text, $11::text, $12::text, $12::text,
          $13::jsonb, $14::text, $15::text, $16::integer, $17::text,
          $18::boolean, $19::text, NOW()
        )
        ON CONFLICT (imo_number) DO UPDATE SET
          vessel_name = EXCLUDED.vessel_name,
          dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
          mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
          draft_meters = COALESCE(EXCLUDED.draft_meters, vessels_master.draft_meters),
          flag = COALESCE(EXCLUDED.flag, vessels_master.flag),
          eta = COALESCE(EXCLUDED.eta, vessels_master.eta),
          last_port = COALESCE(EXCLUDED.last_port, vessels_master.last_port),
          current_destination = COALESCE(EXCLUDED.current_destination, vessels_master.current_destination),
          origen = EXCLUDED.origen,
          audit_source = EXCLUDED.audit_source,
          source_payload = EXCLUDED.source_payload,
          system_identity = COALESCE(vessels_master.system_identity, EXCLUDED.system_identity),
          year_built = COALESCE(EXCLUDED.year_built, vessels_master.year_built),
          owner_manager = COALESCE(EXCLUDED.owner_manager, vessels_master.owner_manager),
          has_gears = COALESCE(EXCLUDED.has_gears, vessels_master.has_gears),
          process_status = EXCLUDED.process_status,
          fecha_ultima_actualizacion = NOW()
      `,
      values,
    );
    return;
  }

  if (vessel.mmsiValue) {
    const byMmsi = await client.query(
      `UPDATE vessels_master SET imo_number = COALESCE($1::integer, imo_number), ${UPDATE_MASTER_FIELDS} WHERE mmsi = $4::text RETURNING id`,
      values,
    );
    if (byMmsi.rowCount) return;
  }

  if (vessel.identity) {
    const bySystemIdentity = await client.query(
      `UPDATE vessels_master SET imo_number = COALESCE($1::integer, imo_number), ${UPDATE_MASTER_FIELDS} WHERE system_identity = $14::text RETURNING id`,
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
        $1::integer, $2::text, $3::integer, $4::text, $5::double precision, $6::double precision, $7::text,
        $8::double precision, $9::text, $10::text, $11::text, $12::text, $12::text,
        $13::jsonb, $14::text, $15::text, $16::integer, $17::text,
        $18::boolean, $19::text, NOW()
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
    for (const vessel of vessels) {
      try {
        await persistMasterVessel(client, vessel);
      } catch (itemErr) {
        console.error(`[vessels-master-sync] Error al persistir buque ${vessel.vesselNameValue} (IMO: ${vessel.imoValue}, identity: ${vessel.identity}):`, itemErr);
        throw itemErr;
      }
    }
    await client.query("COMMIT");
    return vessels.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[vessels-master-sync] Error durante el ROLLBACK:", rollbackErr);
    }
    console.error("[vessels-master-sync] Transacción abortada y revertida. Causa raíz:", error);
    throw error;
  } finally {
    client.release();
  }
}
