import type { Config } from "@netlify/functions";
import type { PoolClient } from "pg";
import { getPool } from "../../db/index.js";
import {
  upsertVesselTechnicalRecord,
  type VesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import {
  prepareVesselTechnicalPersistence,
  sanitizeVesselTechnicalRecord,
} from "../../db/vessel-technical-normalizer.mjs";

const NON_COMMERCIAL_VESSEL_PATTERN = /yacht|passenger|ferry|pleasure|cruise|military/i;
const EMPTY_TECHNICAL_VALUES = new Set(["", "n/a", "na", "n/d", "nd", "unknown", "desconocido", "null", "undefined", "-", "--"]);

function corsHeaders(req: Request) {
  return {
    "access-control-allow-origin": req.headers.get("origin") || "*",
    "access-control-allow-methods": "PUT, PATCH, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, Accept",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readFirst(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return EMPTY_TECHNICAL_VALUES.has(text.toLowerCase()) ? null : text || null;
}

function cleanImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function cleanMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanPositiveNumber(value: unknown) {
  const numeric = cleanNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function cleanInteger(value: unknown) {
  const numeric = cleanNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function cleanCoordinate(value: unknown, minimum: number, maximum: number) {
  const numeric = cleanNumber(value);
  return numeric !== null && numeric >= minimum && numeric <= maximum ? numeric : null;
}

function cleanBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "si", "sí", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function buildSupplementalTechnicalPatch(vessel: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const numericFields: Array<[string, string[]]> = [
    ["spd_ballast", ["spd_ballast", "speed_ballast"]],
    ["spd_laden", ["spd_laden", "speed_laden"]],
    ["cons_sea", ["cons_sea", "consumption_sea"]],
    ["cons_port", ["cons_port", "consumption_port"]],
  ];
  numericFields.forEach(([target, aliases]) => {
    const value = cleanPositiveNumber(readFirst(vessel, aliases));
    if (value !== null) patch[target] = value;
  });
  const vesselClass = cleanText(readFirst(vessel, ["vessel_class", "vesselClass", "specialty_type", "specialtyType"]));
  const specialtyType = cleanText(readFirst(vessel, ["specialty_type", "specialtyType", "vessel_class", "vesselClass"]));
  const hasScrubber = cleanBoolean(readFirst(vessel, ["has_scrubber", "hasScrubber", "scrubber"]));
  if (vesselClass) patch.vessel_class = vesselClass;
  if (specialtyType) patch.specialty_type = specialtyType;
  if (hasScrubber !== null) {
    patch.has_scrubber = hasScrubber;
    patch.hasScrubber = hasScrubber;
  }
  return patch;
}

function getTechnicalProfileCompleteness(vessel: VesselTechnicalRecord) {
  const fields = {
    vesselName: cleanText(vessel.vesselName),
    identity: vessel.imoNumber || cleanMmsi(vessel.mmsi),
    dwt: cleanPositiveNumber(vessel.dwt),
    grossTonnage: cleanPositiveNumber(vessel.grossTonnage),
    loaMeters: cleanPositiveNumber(vessel.loaMeters),
    beamMeters: cleanPositiveNumber(vessel.beamMeters),
    flag: cleanText(vessel.flag),
    yearBuilt: vessel.yearBuilt && vessel.yearBuilt >= 1800 ? vessel.yearBuilt : null,
  };
  const missingFields = Object.entries(fields).filter(([, value]) => value === null).map(([field]) => field);
  return {
    complete: missingFields.length === 0,
    completedFields: Object.keys(fields).length - missingFields.length,
    totalFields: Object.keys(fields).length,
    missingFields,
  };
}

type DiscardedVesselRow = {
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
  eta: string | null;
  status: string;
  audit_status: string;
  process_status: string;
};

type ValidatedVesselStateRow = {
  status: string;
  audit_status: string;
  process_status: string;
};

const DISCARD_RETURNING_COLUMNS = `
  imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
  draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
  loa_meters, beam_meters, last_port, eta, status, audit_status, process_status
`;

async function upsertDiscardedVessel(record: VesselTechnicalRecord, client: PoolClient) {
  const { vessel, parameters } = prepareVesselTechnicalPersistence(record);
  const result = vessel.imoNumber
    ? await client.query<DiscardedVesselRow>(
        `
          INSERT INTO vessels_master (
            imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
            draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
            loa_meters, beam_meters, last_port, eta,
            status, audit_status, process_status, updated_at, fecha_ultima_actualizacion
          )
          VALUES (
            $1::integer, $2::text, $3::text, $4::integer, $5::double precision,
            $6::double precision, $7::text, $8::double precision, $9::text,
            $10::text, $11::integer, $12::double precision, $13::double precision,
            $14::double precision, $15::double precision, $16::text,
            NULLIF($17::text, '')::timestamptz,
            'DISCARDED', 'REJECTED', 'DISCARDED', NOW(), NOW()
          )
          ON CONFLICT (imo_number) DO UPDATE SET
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
            status = 'DISCARDED',
            audit_status = 'REJECTED',
            process_status = 'DISCARDED',
            updated_at = NOW(),
            fecha_ultima_actualizacion = NOW()
          RETURNING ${DISCARD_RETURNING_COLUMNS}
        `,
        parameters,
      )
    : await client.query<DiscardedVesselRow>(
        `
          WITH updated_vessel AS (
            UPDATE vessels_master
            SET vessel_name = COALESCE($3::text, vessel_name),
                dwt = COALESCE($4::integer, dwt),
                latitude = COALESCE($5::double precision, latitude),
                longitude = COALESCE($6::double precision, longitude),
                vessel_type = COALESCE($7::text, vessel_type),
                draft_meters = COALESCE($8::double precision, draft_meters),
                flag = COALESCE($9::text, flag),
                call_sign = COALESCE($10::text, call_sign),
                year_built = COALESCE($11::integer, year_built),
                gross_tonnage = COALESCE($12::double precision, gross_tonnage),
                net_tonnage = COALESCE($13::double precision, net_tonnage),
                loa_meters = COALESCE($14::double precision, loa_meters),
                beam_meters = COALESCE($15::double precision, beam_meters),
                last_port = COALESCE($16::text, last_port),
                eta = COALESCE(NULLIF($17::text, '')::timestamptz, eta),
                status = 'DISCARDED', audit_status = 'REJECTED', process_status = 'DISCARDED',
                updated_at = NOW(), fecha_ultima_actualizacion = NOW()
            WHERE mmsi = $2::text
            RETURNING ${DISCARD_RETURNING_COLUMNS}
          ), inserted_vessel AS (
            INSERT INTO vessels_master (
              imo_number, mmsi, vessel_name, dwt, latitude, longitude, vessel_type,
              draft_meters, flag, call_sign, year_built, gross_tonnage, net_tonnage,
              loa_meters, beam_meters, last_port, eta,
              status, audit_status, process_status, updated_at, fecha_ultima_actualizacion
            )
            SELECT
              $1::integer, $2::text, $3::text, $4::integer, $5::double precision,
              $6::double precision, $7::text, $8::double precision, $9::text,
              $10::text, $11::integer, $12::double precision, $13::double precision,
              $14::double precision, $15::double precision, $16::text,
              NULLIF($17::text, '')::timestamptz,
              'DISCARDED', 'REJECTED', 'DISCARDED', NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM updated_vessel)
            RETURNING ${DISCARD_RETURNING_COLUMNS}
          )
          SELECT * FROM updated_vessel
          UNION ALL
          SELECT * FROM inserted_vessel
          LIMIT 1
        `,
        parameters,
      );

  if (!result.rows[0]) throw new Error("No se pudo persistir el descarte del buque.");
  return result.rows[0];
}

export default async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "PUT" && req.method !== "PATCH") {
    return json({ success: false, error: "Method not allowed" }, 405, headers);
  }

  const body = await req.json().catch(() => null);
  const bodyRecord = asRecord(body);
  const vessel = {
    ...bodyRecord,
    ...asRecord(bodyRecord.data),
    ...asRecord(bodyRecord.technical),
    ...asRecord(bodyRecord.technicalData),
    ...asRecord(bodyRecord.dueDiligence),
    ...asRecord(bodyRecord.vessel),
  };
  const requestedStatus = cleanText(readFirst(vessel, ["status", "auditStatus", "audit_status"]))?.toLowerCase();
  const requestedAction = cleanText(bodyRecord.action)?.toLowerCase() || "save";
  const action = requestedAction === "discard" || requestedStatus === "discarded" ? "discard" : "save";
  const imoNumber = cleanImo(readFirst(vessel, ["imo", "IMO", "imo_number", "imoNumber"]));
  const vesselName = cleanText(readFirst(vessel, ["vesselName", "vessel_name", "name", "ShipName"]));
  const mmsi = cleanMmsi(readFirst(vessel, ["mmsi", "MMSI"]));
  if (!imoNumber && !mmsi) {
    const message = action === "discard"
      ? "Se requiere un IMO o MMSI válido para descartar el buque."
      : "Se requiere IMO o MMSI válido para persistir Due Diligence.";
    return json({ success: false, error: message }, 400, headers);
  }

  const dwt = cleanInteger(readFirst(vessel, ["dwt", "DWT", "deadweight"]));
  const latitude = cleanCoordinate(readFirst(vessel, ["latitude", "lat"]), -90, 90);
  const longitude = cleanCoordinate(readFirst(vessel, ["longitude", "lon", "lng"]), -180, 180);
  const vesselType = cleanText(readFirst(vessel, ["vesselType", "vessel_type", "shipType", "ship_type", "vessel_class", "specialty_type"]));
  const draftMeters = cleanNumber(readFirst(vessel, ["draft", "Draft", "draft_meters", "calado"]));
  const flag = cleanText(readFirst(vessel, ["flag", "bandera"]));
  const callSign = cleanText(readFirst(vessel, ["callSign", "call_sign", "call sign", "indicativo"]));
  const yearBuilt = cleanInteger(readFirst(vessel, ["yearBuilt", "builtYear", "year_built", "built_year"]));
  const grossTonnage = cleanPositiveNumber(readFirst(vessel, ["GROSS_TONNAGE", "gross_tonnage", "grossTonnage", "gt", "GT"]));
  const netTonnage = cleanPositiveNumber(readFirst(vessel, ["net_tonnage", "netTonnage", "nt", "NT"]));
  const loaMeters = cleanPositiveNumber(readFirst(vessel, [
    "LOA_METERS",
    "loa_meters",
    "loaMeters",
    "loa",
    "LOA",
    "length",
    "Length",
    "LENGTH",
    "length_overall",
    "lengthOverall",
  ]));
  const beamMeters = cleanPositiveNumber(readFirst(vessel, [
    "BEAM_METERS",
    "beam_meters",
    "beamMeters",
    "beam",
    "Beam",
    "manga",
  ]));
  const lastPort = readFirst(vessel, ["last_port", "lastPort", "lastPortOfCall", "ultimo_puerto"]);
  const eta = readFirst(vessel, ["eta", "ETA", "estimatedTimeOfArrival"]);
  const sanitizedVessel = sanitizeVesselTechnicalRecord({
    imoNumber: imoNumber ? Number(imoNumber) : null,
    mmsi,
    vesselName,
    dwt,
    latitude,
    longitude,
    vesselType,
    draftMeters,
    flag,
    callSign,
    yearBuilt,
    grossTonnage,
    netTonnage,
    loaMeters,
    beamMeters,
    lastPort,
    eta,
  });
  if (action !== "discard" && vesselType && NON_COMMERCIAL_VESSEL_PATTERN.test(vesselType)) {
    return json({ success: false, error: `Buque no comercial detectado: ${vesselType}` }, 422, headers);
  }

  let client: PoolClient | null = null;
  let transactionOpen = false;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;

    if (action === "discard") {
      const discardedVessel = await upsertDiscardedVessel(sanitizedVessel, client);
      await client.query("COMMIT");
      transactionOpen = false;
      return json({ success: true, discarded: true, vessel: discardedVessel }, 200, headers);
    }

    const savedVesselStatus = action === "save" ? "EN_CARTERA" : null;
    const savedVessel = await upsertVesselTechnicalRecord(sanitizedVessel, client, savedVesselStatus);
    const profileCompleteness = getTechnicalProfileCompleteness(savedVessel);
    const supplementalPatch = buildSupplementalTechnicalPatch(vessel);
    const validatedStateResult = await client.query<ValidatedVesselStateRow>(
      `
        UPDATE vessels_master
        SET status = 'EN_CARTERA',
            audit_status = $3::text,
            process_status = 'COMPLETED',
            source_payload = COALESCE(source_payload, '{}'::jsonb) || $4::jsonb,
            updated_at = NOW(),
            fecha_ultima_actualizacion = NOW()
        WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
           OR ($1::integer IS NULL AND $2::text IS NOT NULL AND mmsi = $2::text)
        RETURNING status, audit_status, process_status
      `,
      [savedVessel.imoNumber, savedVessel.mmsi, profileCompleteness.complete ? "VALIDATED" : "PARTIAL", JSON.stringify(supplementalPatch)],
    );
    const validatedState = validatedStateResult.rows[0];
    if (!validatedState) throw new Error("No se pudo validar el estado final del buque guardado.");
    const countResult = await client.query<{ total: string }>(
      `SELECT COUNT(*)::integer AS total FROM vessels_master`,
    );
    await client.query("COMMIT");
    transactionOpen = false;

    return json({
      success: true,
      vessel: {
        imo_number: savedVessel.imoNumber,
        mmsi: savedVessel.mmsi,
        vessel_name: savedVessel.vesselName,
        dwt: savedVessel.dwt,
        latitude: savedVessel.latitude,
        longitude: savedVessel.longitude,
        vessel_type: savedVessel.vesselType,
        draft_meters: savedVessel.draftMeters,
        flag: savedVessel.flag,
        call_sign: savedVessel.callSign,
        year_built: savedVessel.yearBuilt,
        gross_tonnage: savedVessel.grossTonnage,
        net_tonnage: savedVessel.netTonnage,
        loa_meters: savedVessel.loaMeters,
        beam_meters: savedVessel.beamMeters,
        last_port: savedVessel.lastPort,
        eta: savedVessel.eta,
        status: validatedState.status,
        audit_status: validatedState.audit_status,
        process_status: validatedState.process_status,
        profile_status: profileCompleteness.complete ? "COMPLETE" : "PARTIAL",
        profile_completeness: profileCompleteness,
      },
      partial: !profileCompleteness.complete,
      profileCompleteness,
      masterVesselCount: Number(countResult.rows[0]?.total || 0),
    }, 200, headers);
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[vessel-due-diligence-save] PostgreSQL rollback failed", rollbackError);
      }
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";
    console.error("[vessel-due-diligence-save] PostgreSQL persistence failed", error);
    return json({ success: false, error: errorMessage }, 500, headers);
  } finally {
    if (client) client.release();
  }
};

export const config: Config = {
  path: "/api/vessel-due-diligence-save",
  method: ["PUT", "PATCH", "OPTIONS"],
};
