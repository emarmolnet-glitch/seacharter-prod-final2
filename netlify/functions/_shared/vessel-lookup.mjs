import { sanitizeVesselTechnicalRecord } from "../../../db/vessel-technical-normalizer.mjs";

export function normalizeImo(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? Number(digits) : null;
}

export function normalizeDatalasticParticulars(payload, requestedImo) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const vessel = sanitizeVesselTechnicalRecord({
    imoNumber: normalizeImo(source.imoNumber ?? source.imo_number ?? source.imo) ?? requestedImo,
    mmsi: source.mmsi,
    vesselName: source.vesselName ?? source.vessel_name ?? source.name,
    dwt: source.dwt ?? source.deadweight,
    latitude: source.latitude ?? source.lat,
    longitude: source.longitude ?? source.lon ?? source.lng,
    vesselType: source.vesselType ?? source.vessel_type ?? source.type,
    draftMeters: source.draftMeters ?? source.draft_meters ?? source.draft ?? source.draught,
    flag: source.flag,
    callSign: source.callSign ?? source.call_sign,
    yearBuilt: source.yearBuilt ?? source.year_built,
    grossTonnage: source.grossTonnage ?? source.gross_tonnage ?? source.gt,
    netTonnage: source.netTonnage ?? source.net_tonnage ?? source.nt,
    loaMeters: source.loaMeters ?? source.loa_meters ?? source.loa ?? source.length,
    beamMeters: source.beamMeters ?? source.beam_meters ?? source.beam ?? source.breadth,
    lastPort: source.lastPort ?? source.last_port,
    eta: source.eta,
  });

  if (vessel.imoNumber !== requestedImo) {
    throw new Error("Datalastic returned a different IMO number.");
  }
  return vessel;
}

export async function resolveVesselByImo({ imoNumber, findInDatabase, fetchFromDatalastic, saveRecord }) {
  const cached = await findInDatabase(imoNumber);
  if (cached) return { cache: "hit", vessel: cached, providerMeta: null };

  const providerResult = await fetchFromDatalastic(imoNumber);
  const normalized = normalizeDatalasticParticulars(providerResult?.data, imoNumber);
  const saved = await saveRecord(normalized);
  return { cache: "miss", vessel: saved, providerMeta: providerResult?.meta ?? null };
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function toPositiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const raw = String(value).trim().replace(",", ".");
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = raw.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function serializeVesselRecord(record) {
  const sourcePayload = parseJsonObject(record.sourcePayload ?? record.source_payload);
  const h15Raw = record.h15TechnicalSheet
    ?? record.h15_technical_sheet
    ?? sourcePayload.h15_technical_sheet
    ?? sourcePayload.h15TechnicalSheet
    ?? null;
  const h15 = parseJsonObject(h15Raw);
  const hasH15 = Object.keys(h15).length > 0;
  const h15Caps = parseJsonObject(h15.capacities);

  const vesselTypeNormalized = h15.vessel_type_normalized
    ?? record.vesselTypeNormalized
    ?? record.vessel_type_normalized
    ?? null;
  const isTanker = String(vesselTypeNormalized || "").toLowerCase() === "tanker";

  const serviceSpeed = toPositiveNumber(
    h15.service_speed_knots ?? record.serviceSpeedKnots ?? record.service_speed_knots
  );
  const ecoSpeed = toPositiveNumber(
    h15.eco_speed_knots ?? record.ecoSpeedKnots ?? record.eco_speed_knots
  );
  const speedLaden = toPositiveNumber(record.speedLaden ?? record.spd_laden ?? serviceSpeed);
  const speedBallast = toPositiveNumber(record.speedBallast ?? record.spd_ballast ?? serviceSpeed);

  const vlsfoSeaDesign = toPositiveNumber(h15.vlsfo_sea_design_mt_day ?? record.vlsfo_sea_design_mt_day);
  const vlsfoSeaEco = toPositiveNumber(h15.vlsfo_sea_eco_mt_day ?? record.vlsfo_sea_eco_mt_day);
  const vlsfoSeaBallast = toPositiveNumber(h15.vlsfo_sea_ballast_mt_day ?? record.vlsfo_sea_ballast_mt_day);
  const mgoPortWorking = toPositiveNumber(h15.mgo_port_working_mt_day ?? record.mgo_port_working_mt_day);
  const mgoPortIdle = toPositiveNumber(h15.mgo_port_idle_mt_day ?? record.mgo_port_idle_mt_day);

  const fuelConsumptionLaden = vlsfoSeaDesign
    ?? vlsfoSeaEco
    ?? toPositiveNumber(record.fuelConsumptionLaden ?? record.fuel_consumption_laden ?? record.consSea ?? record.cons_sea);
  const fuelConsumptionBallast = vlsfoSeaBallast
    ?? toPositiveNumber(record.fuelConsumptionBallast ?? record.fuel_consumption_ballast ?? record.consBallast ??
