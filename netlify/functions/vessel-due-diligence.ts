import type { Config } from "@netlify/functions";
import {
  findVesselTechnicalRecord,
  upsertVesselTechnicalRecord,
  type VesselTechnicalRecord,
} from "../../db/vessel-technical-cache.js";
import { AisCoordinatorError, getVesselParticulars } from "./_shared/aisCoordinator.js";

type LookupIdentity = {
  imo: string;
  mmsi: string;
  vesselName: string;
};

const RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function textValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "";
}

function normalizeImo(value: unknown) {
  const digits = textValue(value).replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function normalizeMmsi(value: unknown) {
  const digits = textValue(value).replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildIdentity(body: Record<string, unknown>): LookupIdentity | null {
  const imo = normalizeImo(body.imo ?? body.imo_number ?? body.IMO);
  const mmsi = normalizeMmsi(body.mmsi ?? body.MMSI);
  const vesselName = textValue(body.vesselName ?? body.vessel_name ?? body.name);
  return imo || mmsi || vesselName ? { imo, mmsi, vesselName } : null;
}

function normalizeEta(value: VesselTechnicalRecord["eta"]) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function responseData(record: VesselTechnicalRecord) {
  return {
    imo_number: record.imoNumber ? String(record.imoNumber) : null,
    vessel_name: record.vesselName || null,
    mmsi: record.mmsi || null,
    flag: record.flag || null,
    call_sign: record.callSign || null,
    vessel_type: record.vesselType || null,
    year_built: record.yearBuilt || null,
    loa_meters: Number(record.loaMeters) > 0 ? Number(record.loaMeters) : null,
    beam_meters: Number(record.beamMeters) > 0 ? Number(record.beamMeters) : null,
    gross_tonnage: Number(record.grossTonnage) > 0 ? Number(record.grossTonnage) : null,
    net_tonnage: Number(record.netTonnage) > 0 ? Number(record.netTonnage) : null,
    dwt: Number(record.dwt) > 0 ? Number(record.dwt) : null,
    draft_meters: Number(record.draftMeters) > 0 ? Number(record.draftMeters) : null,
    last_port: record.lastPort || null,
    eta: normalizeEta(record.eta),
  };
}

function verificationLog(record: VesselTechnicalRecord, provider: string) {
  const data = responseData(record);
  return Object.entries(data).map(([field, value]) => ({
    field,
    provider,
    verified: value !== null && value !== "",
  }));
}

function json(body: unknown, status = 200, request?: Request) {
  const origin = request?.headers.get("origin") || "*";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept",
      vary: "Origin",
    },
  });
}

export default async (request: Request) => {
  if (request.method === "OPTIONS") return json({}, 204, request);
  if (request.method !== "POST") {
    return json({ success: false, error: "Método no permitido." }, 405, request);
  }

  let body: Record<string, unknown>;
  try {
    body = asRecord(await request.json());
  } catch {
    return json({ success: false, error: "El cuerpo debe ser JSON válido." }, 400, request);
  }

  const identity = buildIdentity(body);
  if (!identity) {
    return json({ success: false, error: "Se requiere IMO válido, MMSI o nombre del buque." }, 400, request);
  }

  try {
    const cachedRecord = await findVesselTechnicalRecord(
      identity.imo ? Number(identity.imo) : null,
      identity.imo ? null : identity.mmsi || null,
      identity.imo ? null : identity.vesselName || null,
    );

    if (cachedRecord) {
      return json({
        success: true,
        ok: true,
        extracted: true,
        data: responseData(cachedRecord),
        verificationLog: verificationLog(cachedRecord, "vessels_master"),
        metadata: {
          source: "vessels_master",
          provider: "vessels_master",
          cacheStatus: "HIT",
          persisted: true,
          partial: Object.values(responseData(cachedRecord)).some((value) => value === null),
          requiresAcceptance: false,
        },
      }, 200, request);
    }

    if (!identity.imo) {
      return json({
        success: false,
        error: "Datalastic Vessel Particulars requiere un IMO válido cuando el buque no existe en Neon.",
      }, 422, request);
    }

    const datalasticResult = await getVesselParticulars(identity.imo);
    const particulars = asRecord(datalasticResult.data);
    const persistedRecord = await upsertVesselTechnicalRecord({
      imoNumber: Number(normalizeImo(particulars.imoNumber) || identity.imo),
      mmsi: normalizeMmsi(particulars.mmsi) || identity.mmsi || null,
      vesselName: textValue(particulars.vesselName) || identity.vesselName || null,
      dwt: Number(particulars.dwt) || null,
      latitude: Number.isFinite(Number(particulars.latitude)) ? Number(particulars.latitude) : null,
      longitude: Number.isFinite(Number(particulars.longitude)) ? Number(particulars.longitude) : null,
      vesselType: textValue(particulars.vesselType) || null,
      draftMeters: Number(particulars.draftMeters) || null,
      flag: textValue(particulars.flag) || null,
      callSign: textValue(particulars.callSign) || null,
      yearBuilt: Number(particulars.yearBuilt) || null,
      grossTonnage: Number(particulars.grossTonnage) || null,
      netTonnage: Number(particulars.netTonnage) || null,
      loaMeters: Number(particulars.loaMeters) || null,
      beamMeters: Number(particulars.beamMeters) || null,
      lastPort: textValue(particulars.lastPort) || null,
      eta: textValue(particulars.eta) || null,
    });

    return json({
      success: true,
      ok: true,
      extracted: true,
      data: responseData(persistedRecord),
      verificationLog: verificationLog(persistedRecord, "Datalastic"),
      metadata: {
        source: "datalastic",
        provider: "Datalastic",
        cacheStatus: datalasticResult.meta?.cacheStatus || "MISS",
        persisted: true,
        partial: Object.values(responseData(persistedRecord)).some((value) => value === null),
        requiresAcceptance: false,
      },
    }, 200, request);
  } catch (error) {
    const status = error instanceof AisCoordinatorError ? error.status : 500;
    const message = error instanceof AisCoordinatorError
      ? error.message
      : "No fue posible consultar Datalastic ni consolidar el buque en Neon.";
    console.error("[vessel-due-diligence] Database-first lookup failed.", {
      code: error instanceof AisCoordinatorError ? error.code : "VESSEL_DUE_DILIGENCE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ success: false, error: message }, status, request);
  }
};

export const config: Config = {
  path: "/api/vessel-due-diligence",
  method: ["POST", "OPTIONS"],
};
