import { getDatabase } from "netlify-database-client";

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textValue(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function connectionString() {
  return Netlify.env.get("DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DATABASE_URL")
    ?? Netlify.env.get("NETLIFY_DB_URL");
}

export function radarIdentity(vessel) {
  const imo = digits(vessel?.imo ?? vessel?.IMO ?? vessel?.imoNumber ?? vessel?.imo_number);
  const mmsi = digits(vessel?.mmsi ?? vessel?.MMSI);
  return {
    imo: imo.length === 7 ? imo : "",
    mmsi: mmsi.length === 9 ? mmsi : "",
  };
}

export function mergeRadarTechnicalData(vessels, masterRows = []) {
  const byImo = new Map();
  const byMmsi = new Map();
  for (const row of masterRows) {
    const identity = radarIdentity(row);
    if (identity.imo) byImo.set(identity.imo, row);
    if (identity.mmsi) byMmsi.set(identity.mmsi, row);
  }

  let technicalMatches = 0;
  const enriched = vessels.map((vessel) => {
    const identity = radarIdentity(vessel);
    const master = (identity.imo && byImo.get(identity.imo)) || (identity.mmsi && byMmsi.get(identity.mmsi)) || null;
    if (master) technicalMatches += 1;
    const dwt = finiteNumber(master?.dwt);
    const draftMeters = finiteNumber(master?.draft_meters);
    const vesselType = textValue(master?.vessel_type, vessel?.vesselType, vessel?.vessel_type);
    const vesselName = textValue(vessel?.name, vessel?.vesselName, master?.vessel_name, "Unknown vessel");

    return {
      ...vessel,
      name: vesselName,
      vesselName,
      imo: identity.imo || textValue(vessel?.imo),
      mmsi: identity.mmsi || textValue(vessel?.mmsi),
      vesselType,
      vessel_type: vesselType,
      dwt,
      DWT: dwt,
      dwtStatus: dwt === null ? "UNKNOWN" : "VERIFIED_NEON",
      draftMeters,
      draft_meters: draftMeters,
      flag: textValue(master?.flag, vessel?.flag),
      callSign: textValue(master?.call_sign, vessel?.callSign),
      yearBuilt: finiteNumber(master?.year_built),
      grossTonnage: finiteNumber(master?.gross_tonnage),
      loaMeters: finiteNumber(master?.loa_meters),
      beamMeters: finiteNumber(master?.beam_meters),
      technicalMatch: Boolean(master),
      technicalSource: master ? "NEON_VESSELS_MASTER" : null,
      source: "DATALASTIC",
      source_origin: "DATALASTIC",
      source_origins: ["DATALASTIC"],
      data_source: "radar_live",
    };
  });

  return {
    vessels: enriched,
    counts: {
      liveRadar: enriched.length,
      technicalMatches,
    },
  };
}

export async function enrichDatalasticRadarVessels(vessels) {
  const snapshot = Array.isArray(vessels) ? vessels : [];
  if (snapshot.length === 0) return mergeRadarTechnicalData([]);

  const imoNumbers = [...new Set(snapshot.map(radarIdentity).map(({ imo }) => imo).filter(Boolean))].map(Number);
  const mmsiNumbers = [...new Set(snapshot.map(radarIdentity).map(({ mmsi }) => mmsi).filter(Boolean))];
  const databaseUrl = connectionString();
  if (!databaseUrl || (imoNumbers.length === 0 && mmsiNumbers.length === 0)) {
    return mergeRadarTechnicalData(snapshot);
  }

  const database = getDatabase({ connectionString: databaseUrl });
  const result = await database.pool.query(
    `SELECT imo_number, mmsi, vessel_name, dwt, vessel_type, draft_meters, flag,
            call_sign, year_built, gross_tonnage, loa_meters, beam_meters
       FROM vessels_master
      WHERE imo_number = ANY($1::integer[])
         OR REGEXP_REPLACE(COALESCE(mmsi, ''), '[^0-9]', '', 'g') = ANY($2::text[])`,
    [imoNumbers, mmsiNumbers],
  );
  return mergeRadarTechnicalData(snapshot, result.rows);
}
