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
    ?? toPositiveNumber(record.fuelConsumptionBallast ?? record.fuel_consumption_ballast ?? record.consBallast ?? record.cons_ballast)
    ?? fuelConsumptionLaden;
  const fuelConsumptionPort = mgoPortWorking
    ?? toPositiveNumber(record.fuelConsumptionPort ?? record.fuel_consumption_port ?? record.consPort ?? record.cons_port);
  const consAnchorage = mgoPortIdle
    ?? toPositiveNumber(record.consAnchorage ?? record.cons_anchorage ?? record.consumo_fondeo_td);

  const grainCubicM3 = isTanker
    ? 0
    : toPositiveNumber(h15Caps.grain_cubic_m3 ?? h15.grain_cubic_m3 ?? record.grainCubicM3 ?? record.grain_cubic_m3);
  const baleCubicM3 = isTanker
    ? 0
    : toPositiveNumber(h15Caps.bale_cubic_m3 ?? h15.bale_cubic_m3 ?? record.baleCubicM3 ?? record.bale_cubic_m3);

  const ownerManager = record.ownerManager ?? record.owner_manager ?? record.manager ?? null;
  const vesselClass = record.vesselClass ?? record.vessel_class ?? record.commercialClass ?? record.commercial_class ?? record.vesselType ?? record.vessel_type ?? null;
  const commercialClass = record.commercialClass ?? record.commercial_class ?? record.vesselClass ?? record.vessel_class ?? record.vesselType ?? record.vessel_type ?? null;
  const rawHasGears = h15.has_gears ?? record.hasGears ?? record.has_gears ?? null;
  const hasGears = isTanker ? false : rawHasGears;
  const hasScrubber = record.hasScrubber ?? record.has_scrubber ?? null;

  return {
    imo: record.imoNumber ?? record.imo_number ?? null,
    imo_number: record.imoNumber ?? record.imo_number ?? null,
    mmsi: record.mmsi,
    vessel_name: record.vesselName ?? record.vessel_name ?? null,
    vesselName: record.vesselName ?? record.vessel_name ?? null,
    dwt: toPositiveNumber(h15.dwt) ?? record.dwt,
    latitude: record.latitude,
    longitude: record.longitude,
    vessel_type: record.vesselType ?? record.vessel_type ?? null,
    vessel_type_normalized: vesselTypeNormalized,
    vessel_class: vesselClass,
    commercial_class: commercialClass,
    draft_meters: record.draftMeters ?? record.draft_meters ?? record.draft ?? null,
    draft: record.draftMeters ?? record.draft_meters ?? record.draft ?? null,
    flag: record.flag,
    call_sign: record.callSign ?? record.call_sign ?? null,
    year_built: record.yearBuilt ?? record.year_built ?? null,
    built_year: record.yearBuilt ?? record.year_built ?? null,
    gross_tonnage: record.grossTonnage ?? record.gross_tonnage ?? record.gt ?? null,
    gt: record.grossTonnage ?? record.gross_tonnage ?? record.gt ?? null,
    net_tonnage: record.netTonnage ?? record.net_tonnage ?? record.nt ?? null,
    loa_meters: record.loaMeters ?? record.loa_meters ?? record.loa ?? null,
    loa: record.loaMeters ?? record.loa_meters ?? record.loa ?? null,
    beam_meters: record.beamMeters ?? record.beam_meters ?? record.beam ?? null,
    beam: record.beamMeters ?? record.beam_meters ?? record.beam ?? null,
    last_port: record.lastPort ?? record.last_port ?? null,
    eta: record.eta instanceof Date ? record.eta.toISOString() : record.eta,
    service_speed_knots: serviceSpeed,
    serviceSpeedKnots: serviceSpeed,
    eco_speed_knots: ecoSpeed,
    spd_laden: speedLaden,
    speed_laden: speedLaden,
    spd_ballast: speedBallast,
    speed_ballast: speedBallast,
    vlsfo_sea_design_mt_day: vlsfoSeaDesign ?? fuelConsumptionLaden,
    vlsfo_sea_eco_mt_day: vlsfoSeaEco,
    vlsfo_sea_ballast_mt_day: vlsfoSeaBallast ?? fuelConsumptionBallast,
    mgo_port_working_mt_day: mgoPortWorking ?? fuelConsumptionPort,
    mgo_port_idle_mt_day: mgoPortIdle ?? consAnchorage,
    fuel_consumption_laden: fuelConsumptionLaden,
    fuel_consumption_ballast: fuelConsumptionBallast,
    fuel_consumption_port: fuelConsumptionPort,
    cons_sea: fuelConsumptionLaden,
    cons_port: fuelConsumptionPort,
    cons_ballast: fuelConsumptionBallast,
    cons_anchorage: consAnchorage,
    grain_cubic_m3: grainCubicM3,
    bale_cubic_m3: baleCubicM3,
    owner_manager: ownerManager,
    ownerManager,
    gestor: ownerManager,
    has_gears: hasGears,
    hasGears,
    has_scrubber: hasScrubber,
    hasScrubber,
    h15_technical_sheet: hasH15 ? h15 : null,
    audit_status: record.auditStatus ?? record.audit_status ?? null,
    data_source: record.dataSource ?? record.data_source ?? "vessels_master",
  };
}
