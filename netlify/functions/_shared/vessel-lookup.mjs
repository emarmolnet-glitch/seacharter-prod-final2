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

export function serializeVesselRecord(record) {
  const serviceSpeed = record.serviceSpeedKnots ?? record.service_speed_knots ?? null;
  const speedLaden = record.speedLaden ?? record.spd_laden ?? serviceSpeed ?? null;
  const speedBallast = record.speedBallast ?? record.spd_ballast ?? serviceSpeed ?? null;
  const fuelConsumptionLaden = record.fuelConsumptionLaden ?? record.fuel_consumption_laden ?? record.consSea ?? record.cons_sea ?? null;
  const fuelConsumptionBallast = record.fuelConsumptionBallast ?? record.fuel_consumption_ballast ?? record.consBallast ?? record.cons_ballast ?? fuelConsumptionLaden ?? null;
  const fuelConsumptionPort = record.fuelConsumptionPort ?? record.fuel_consumption_port ?? record.consPort ?? record.cons_port ?? null;
  const ownerManager = record.ownerManager ?? record.owner_manager ?? record.manager ?? null;
  const vesselClass = record.vesselClass ?? record.vessel_class ?? record.commercialClass ?? record.commercial_class ?? record.vesselType ?? record.vessel_type ?? null;
  const commercialClass = record.commercialClass ?? record.commercial_class ?? record.vesselClass ?? record.vessel_class ?? record.vesselType ?? record.vessel_type ?? null;
  const hasGears = record.hasGears ?? record.has_gears ?? null;
  const hasScrubber = record.hasScrubber ?? record.has_scrubber ?? null;

  return {
    imo: record.imoNumber ?? record.imo_number ?? null,
    imo_number: record.imoNumber ?? record.imo_number ?? null,
    mmsi: record.mmsi,
    vessel_name: record.vesselName ?? record.vessel_name ?? null,
    vesselName: record.vesselName ?? record.vessel_name ?? null,
    dwt: record.dwt,
    latitude: record.latitude,
    longitude: record.longitude,
    vessel_type: record.vesselType ?? record.vessel_type ?? null,
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
    spd_laden: speedLaden,
    speed_laden: speedLaden,
    spd_ballast: speedBallast,
    speed_ballast: speedBallast,
    fuel_consumption_laden: fuelConsumptionLaden,
    fuel_consumption_ballast: fuelConsumptionBallast,
    fuel_consumption_port: fuelConsumptionPort,
    cons_sea: fuelConsumptionLaden,
    cons_port: fuelConsumptionPort,
    cons_ballast: fuelConsumptionBallast,
    owner_manager: ownerManager,
    ownerManager,
    gestor: ownerManager,
    has_gears: hasGears,
    hasGears,
    has_scrubber: hasScrubber,
    hasScrubber,
    audit_status: record.auditStatus ?? record.audit_status ?? null,
    data_source: record.dataSource ?? record.data_source ?? "vessels_master",
  };
}
