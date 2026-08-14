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
  return {
    imo_number: record.imoNumber,
    mmsi: record.mmsi,
    vessel_name: record.vesselName,
    dwt: record.dwt,
    latitude: record.latitude,
    longitude: record.longitude,
    vessel_type: record.vesselType,
    draft_meters: record.draftMeters,
    flag: record.flag,
    call_sign: record.callSign,
    year_built: record.yearBuilt,
    gross_tonnage: record.grossTonnage,
    net_tonnage: record.netTonnage,
    loa_meters: record.loaMeters,
    beam_meters: record.beamMeters,
    last_port: record.lastPort,
    eta: record.eta instanceof Date ? record.eta.toISOString() : record.eta,
  };
}
