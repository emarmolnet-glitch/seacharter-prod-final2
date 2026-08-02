import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";

const NON_COMMERCIAL_VESSEL_PATTERN = /yacht|passenger|ferry|pleasure|cruise|military/i;
const FLAG_CODES: Record<string, string> = {
  antiguaandbarbuda: "ATG",
  bahamas: "BHS",
  barbados: "BRB",
  belize: "BLZ",
  china: "CHN",
  cyprus: "CYP",
  denmark: "DNK",
  germany: "DEU",
  greece: "GRC",
  hongkong: "HKG",
  italy: "ITA",
  liberia: "LBR",
  malta: "MLT",
  marshallislands: "MHL",
  netherlands: "NLD",
  norway: "NOR",
  panama: "PAN",
  portugal: "PRT",
  singapore: "SGP",
  spain: "ESP",
  türkiye: "TUR",
  turkey: "TUR",
  unitedkingdom: "GBR",
  unitedstates: "USA",
};

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

function cleanFlagCode(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const compact = text.toLowerCase().replace(/[^a-záéíóúüñç]/g, "");
  if (FLAG_CODES[compact]) return FLAG_CODES[compact];
  const letters = text.replace(/[^a-z]/gi, "").toUpperCase();
  return letters.length >= 2 ? letters.slice(0, 3) : null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanInteger(value: unknown) {
  const numeric = cleanNumber(value);
  return numeric === null ? null : Math.trunc(numeric);
}

function cleanCoordinate(value: unknown, minimum: number, maximum: number) {
  const numeric = cleanNumber(value);
  return numeric !== null && numeric >= minimum && numeric <= maximum ? numeric : null;
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
  const imoNumber = cleanImo(readFirst(vessel, ["imo", "IMO", "imo_number", "imoNumber"]));
  const vesselName = cleanText(readFirst(vessel, ["vesselName", "vessel_name", "name", "ShipName"]));
  if (!imoNumber || !vesselName) {
    return json({ success: false, error: "Se requieren IMO válido y nombre del buque para persistir Due Diligence." }, 400, headers);
  }

  const dwt = cleanInteger(readFirst(vessel, ["dwt", "DWT", "deadweight"]));
  const mmsi = cleanMmsi(readFirst(vessel, ["mmsi", "MMSI"]));
  const latitude = cleanCoordinate(readFirst(vessel, ["latitude", "lat"]), -90, 90);
  const longitude = cleanCoordinate(readFirst(vessel, ["longitude", "lon", "lng"]), -180, 180);
  const vesselType = cleanText(readFirst(vessel, ["vesselType", "vessel_type", "shipType", "ship_type"]));
  const draftMeters = cleanNumber(readFirst(vessel, ["draft", "Draft", "draft_meters", "calado"]));
  const flag = cleanFlagCode(readFirst(vessel, ["flag", "bandera"]));
  const yearBuilt = cleanInteger(readFirst(vessel, ["yearBuilt", "builtYear", "year_built", "built_year"]));
  if (vesselType && NON_COMMERCIAL_VESSEL_PATTERN.test(vesselType)) {
    return json({ success: false, error: `Buque no comercial detectado: ${vesselType}` }, 422, headers);
  }
  try {
    const pool = getPool();
    const result = await pool.query(
      `
        INSERT INTO vessels_master (
          imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
          draft_meters, flag, year_built
        )
        VALUES (
          $1::integer, $2, $3::integer, $4, $5, $6, $7,
          $8, $9, $10::integer
        )
        ON CONFLICT (imo_number) DO UPDATE SET
          vessel_name = EXCLUDED.vessel_name,
          dwt = COALESCE(EXCLUDED.dwt, vessels_master.dwt),
          mmsi = COALESCE(EXCLUDED.mmsi, vessels_master.mmsi),
          latitude = COALESCE(EXCLUDED.latitude, vessels_master.latitude),
          longitude = COALESCE(EXCLUDED.longitude, vessels_master.longitude),
          vessel_type = COALESCE(EXCLUDED.vessel_type, vessels_master.vessel_type),
          draft_meters = COALESCE(EXCLUDED.draft_meters, vessels_master.draft_meters),
          flag = COALESCE(EXCLUDED.flag, vessels_master.flag),
          year_built = COALESCE(EXCLUDED.year_built, vessels_master.year_built)
        RETURNING
          imo_number, vessel_name, dwt, mmsi, latitude, longitude, vessel_type,
          draft_meters, flag, year_built
      `,
      [
        imoNumber,
        vesselName,
        dwt,
        mmsi,
        latitude,
        longitude,
        vesselType,
        draftMeters,
        flag,
        yearBuilt,
      ],
    );
    const countResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM vessels_master`,
    );
    return json({
      success: true,
      vessel: result.rows[0],
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
