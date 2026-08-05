import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import { upsertVesselTechnicalRecord } from "../../db/vessel-technical-cache.js";
import { sanitizeVesselTechnicalRecord } from "../../db/vessel-technical-normalizer.mjs";

const NON_COMMERCIAL_VESSEL_PATTERN = /yacht|passenger|ferry|pleasure|cruise|military/i;

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
  return text || null;
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

type DiscardedVesselRow = {
  imo_number: number | null;
  mmsi: string | null;
  vessel_name: string | null;
  status: string;
};

const DISCARD_RETURNING_COLUMNS = "imo_number, mmsi, vessel_name, status";

async function updateDiscardedVesselByIdentity(
  imoNumber: string | null,
  mmsi: string | null,
  vesselName: string | null,
) {
  return getPool().query<DiscardedVesselRow>(
    `
      UPDATE vessels_master
      SET vessel_name = COALESCE($3::text, vessel_name),
          status = 'DISCARDED',
          audit_status = 'REJECTED',
          process_status = 'DISCARDED',
          updated_at = NOW(),
          fecha_ultima_actualizacion = NOW()
      WHERE ($1::integer IS NOT NULL AND imo_number = $1::integer)
         OR ($2::text IS NOT NULL AND mmsi = $2::text)
      RETURNING ${DISCARD_RETURNING_COLUMNS}
    `,
    [imoNumber ? Number(imoNumber) : null, mmsi, vesselName],
  );
}

async function upsertDiscardedVessel(
  imoNumber: string | null,
  mmsi: string | null,
  vesselName: string | null,
) {
  const updated = await updateDiscardedVesselByIdentity(imoNumber, mmsi, vesselName);
  if (updated.rows.length > 0) {
    return (imoNumber && updated.rows.find((row) => String(row.imo_number) === imoNumber)) || updated.rows[0];
  }

  try {
    const inserted = imoNumber
      ? await getPool().query<DiscardedVesselRow>(
          `
            INSERT INTO vessels_master (
              imo_number, mmsi, vessel_name, status, audit_status, process_status,
              updated_at, fecha_ultima_actualizacion
            )
            VALUES ($1::integer, $2::text, $3::text, 'DISCARDED', 'REJECTED', 'DISCARDED', NOW(), NOW())
            ON CONFLICT (imo_number) DO UPDATE SET
              vessel_name = COALESCE(EXCLUDED.vessel_name, vessels_master.vessel_name),
              status = EXCLUDED.status,
              audit_status = EXCLUDED.audit_status,
              process_status = EXCLUDED.process_status,
              updated_at = NOW(),
              fecha_ultima_actualizacion = NOW()
            RETURNING ${DISCARD_RETURNING_COLUMNS}
          `,
          [Number(imoNumber), mmsi, vesselName],
        )
      : await getPool().query<DiscardedVesselRow>(
          `
            INSERT INTO vessels_master (
              imo_number, mmsi, vessel_name, status, audit_status, process_status,
              updated_at, fecha_ultima_actualizacion
            )
            VALUES (NULL, $1::text, $2::text, 'DISCARDED', 'REJECTED', 'DISCARDED', NOW(), NOW())
            ON CONFLICT (mmsi) DO UPDATE SET
              vessel_name = COALESCE(EXCLUDED.vessel_name, vessels_master.vessel_name),
              status = EXCLUDED.status,
              audit_status = EXCLUDED.audit_status,
              process_status = EXCLUDED.process_status,
              updated_at = NOW(),
              fecha_ultima_actualizacion = NOW()
            RETURNING ${DISCARD_RETURNING_COLUMNS}
          `,
          [mmsi, vesselName],
        );
    return inserted.rows[0];
  } catch (error) {
    if ((error as { code?: string })?.code !== "23505") throw error;
    const retried = await updateDiscardedVesselByIdentity(imoNumber, mmsi, vesselName);
    if (retried.rows.length === 0) throw error;
    return (imoNumber && retried.rows.find((row) => String(row.imo_number) === imoNumber)) || retried.rows[0];
  }
}

export default async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "PUT" && req.method !== "PATCH") {
    return json({ success: false, error: "Method not allowed" }, 405, headers);
  }

  const body = await req.json().catch(() => null);
  const bodyRecord = asRecord(body);
  const vessel = asRecord(bodyRecord.vessel || bodyRecord);
  const action = cleanText(bodyRecord.action)?.toLowerCase() || "save";
  const imoNumber = cleanImo(readFirst(vessel, ["imo", "IMO", "imo_number", "imoNumber"]));
  const vesselName = cleanText(readFirst(vessel, ["vesselName", "vessel_name", "name", "ShipName"]));
  const mmsi = cleanMmsi(readFirst(vessel, ["mmsi", "MMSI"]));
  if (action === "discard") {
    if (!imoNumber && !mmsi) {
      return json({ success: false, error: "Se requiere un IMO o MMSI válido para descartar el buque." }, 400, headers);
    }
    try {
      const discardedVessel = await upsertDiscardedVessel(imoNumber || null, mmsi, vesselName);
      return json({ success: true, discarded: true, vessel: discardedVessel }, 200, headers);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown database error";
      console.error("[vessel-due-diligence-save] Vessel discard failed", error);
      return json({ success: false, error: errorMessage }, 500, headers);
    }
  }
  if (!imoNumber && !mmsi) {
    return json({ success: false, error: "Se requiere IMO o MMSI válido para persistir Due Diligence." }, 400, headers);
  }

  const dwt = cleanInteger(readFirst(vessel, ["dwt", "DWT", "deadweight"]));
  const latitude = cleanCoordinate(readFirst(vessel, ["latitude", "lat"]), -90, 90);
  const longitude = cleanCoordinate(readFirst(vessel, ["longitude", "lon", "lng"]), -180, 180);
  const vesselType = cleanText(readFirst(vessel, ["vesselType", "vessel_type", "shipType", "ship_type"]));
  const draftMeters = cleanNumber(readFirst(vessel, ["draft", "Draft", "draft_meters", "calado"]));
  const flag = readFirst(vessel, ["flag", "bandera"]);
  const callSign = cleanText(readFirst(vessel, ["callSign", "call_sign", "call sign", "indicativo"]));
  const yearBuilt = cleanInteger(readFirst(vessel, ["yearBuilt", "builtYear", "year_built", "built_year"]));
  const grossTonnage = cleanPositiveNumber(readFirst(vessel, ["gross_tonnage", "grossTonnage", "gt", "GT"]));
  const netTonnage = cleanPositiveNumber(readFirst(vessel, ["net_tonnage", "netTonnage", "nt", "NT"]));
  const loaMeters = cleanPositiveNumber(readFirst(vessel, [
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
    "beam_meters",
    "beamMeters",
    "beam",
    "Beam",
    "manga",
  ]));
  const lastPort = readFirst(vessel, ["last_port", "lastPort", "lastPortOfCall", "ultimo_puerto"]);
  const eta = readFirst(vessel, ["eta", "ETA", "estimatedTimeOfArrival"]);
  if (vesselType && NON_COMMERCIAL_VESSEL_PATTERN.test(vesselType)) {
    return json({ success: false, error: `Buque no comercial detectado: ${vesselType}` }, 422, headers);
  }
  try {
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
    const savedVessel = await upsertVesselTechnicalRecord(sanitizedVessel);
    const pool = getPool();
    const countResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM vessels_master`,
    );
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
      },
      masterVesselCount: Number(countResult.rows[0]?.total || 0),
    }, 200, headers);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown database error";
    console.error("[vessel-due-diligence-save] PostgreSQL persistence failed", error);
    return json({ success: false, error: errorMessage }, 500, headers);
  }
};

export const config: Config = {
  path: "/api/vessel-due-diligence-save",
  method: ["PUT", "PATCH", "OPTIONS"],
};
