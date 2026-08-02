import type { Config } from "@netlify/functions";
import { getPool } from "../../db/index.js";
import { upsertVesselTechnicalRecord } from "../../db/vessel-technical-cache.js";

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
  const mmsi = cleanMmsi(readFirst(vessel, ["mmsi", "MMSI"]));
  if (!imoNumber && !mmsi) {
    return json({ success: false, error: "Se requiere IMO o MMSI válido para persistir Due Diligence." }, 400, headers);
  }

  const dwt = cleanInteger(readFirst(vessel, ["dwt", "DWT", "deadweight"]));
  const latitude = cleanCoordinate(readFirst(vessel, ["latitude", "lat"]), -90, 90);
  const longitude = cleanCoordinate(readFirst(vessel, ["longitude", "lon", "lng"]), -180, 180);
  const vesselType = cleanText(readFirst(vessel, ["vesselType", "vessel_type", "shipType", "ship_type"]));
  const draftMeters = cleanNumber(readFirst(vessel, ["draft", "Draft", "draft_meters", "calado"]));
  const flag = cleanFlagCode(readFirst(vessel, ["flag", "bandera"]));
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
  if (vesselType && NON_COMMERCIAL_VESSEL_PATTERN.test(vesselType)) {
    return json({ success: false, error: `Buque no comercial detectado: ${vesselType}` }, 422, headers);
  }
  try {
    const savedVessel = await upsertVesselTechnicalRecord({
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
    });
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
