import { getPool } from "../../../db/index.js";

type AnyRecord = Record<string, unknown>;

type VerifiedVesselProfile = {
  imo: string | null;
  mmsi: string | null;
  vesselClass: string;
  grossTonnage: number | null;
  loaMeters: number | null;
  beamMeters: number | null;
  flag: string | null;
  yearBuilt: number | null;
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function readScopes(value: unknown): AnyRecord[] {
  const root = asRecord(value);
  const scopes = [root];
  for (const key of ["MetaData", "metadata", "source_payload", "sourcePayload", "rawData", "raw_data", "Message"]) {
    const nested = root[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) scopes.push(nested as AnyRecord);
  }
  scopes.slice().forEach((scope) => {
    for (const key of ["MetaData", "metadata", "ShipStaticData", "shipStaticData"]) {
      const nested = scope[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested) && !scopes.includes(nested as AnyRecord)) {
        scopes.push(nested as AnyRecord);
      }
    }
  });
  return scopes;
}

function readText(value: unknown, keys: string[]): string {
  for (const scope of readScopes(value)) {
    for (const key of keys) {
      const candidate = scope[key];
      if (candidate !== null && candidate !== undefined && String(candidate).trim()) return String(candidate).trim();
    }
  }
  return "";
}

function readImo(value: unknown): string {
  const digits = readText(value, ["imo", "IMO", "imoNumber", "imo_number", "ImoNumber"]).replace(/\D/g, "");
  return digits.length === 7 ? digits : "";
}

function readMmsi(value: unknown): string {
  const digits = readText(value, ["mmsi", "MMSI", "mmsiNumber", "mmsi_number", "UserID"]).replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function applyProfile(vessel: unknown, profile: VerifiedVesselProfile): AnyRecord {
  const source = asRecord(vessel);
  const metadata = { ...asRecord(source.MetaData) };
  const fields: AnyRecord = {
    vesselTechnicalProfileVerified: true,
    vesselClassSource: "VESSELS_MASTER",
  };
  if (profile.vesselClass) {
    Object.assign(fields, {
      vesselClass: profile.vesselClass,
      vessel_type: profile.vesselClass,
      vesselType: profile.vesselClass,
      shipType: profile.vesselClass,
      ShipType: profile.vesselClass,
    });
    metadata.ShipType = profile.vesselClass;
  }
  if (profile.grossTonnage) Object.assign(fields, { grossTonnage: profile.grossTonnage, gross_tonnage: profile.grossTonnage, gt: profile.grossTonnage });
  if (profile.loaMeters) Object.assign(fields, { loaMeters: profile.loaMeters, loa_meters: profile.loaMeters, loa: profile.loaMeters });
  if (profile.beamMeters) Object.assign(fields, { beamMeters: profile.beamMeters, beam_meters: profile.beamMeters, beam: profile.beamMeters });
  if (profile.flag) Object.assign(fields, { flag: profile.flag, bandera: profile.flag });
  if (profile.yearBuilt) Object.assign(fields, { yearBuilt: profile.yearBuilt, year_built: profile.yearBuilt, builtYear: profile.yearBuilt });
  return { ...source, ...fields, MetaData: metadata };
}

export async function overrideVesselClassesFromMaster(vessels: unknown[]) {
  const list = Array.isArray(vessels) ? vessels : [];
  const imos = Array.from(new Set(list.map(readImo).filter(Boolean))).map(Number).slice(0, 500);
  const mmsis = Array.from(new Set(list.map(readMmsi).filter(Boolean))).slice(0, 500);
  if (imos.length === 0 && mmsis.length === 0) return { vessels: list, matched: 0, degraded: false, warning: "" };

  try {
    const result = await getPool().query<{
      imo_number: number | string | null;
      mmsi: string | null;
      vessel_type: string | null;
      gross_tonnage: number | string | null;
      loa_meters: number | string | null;
      beam_meters: number | string | null;
      flag: string | null;
      year_built: number | string | null;
    }>(
      `
        SELECT imo_number, mmsi, vessel_type, gross_tonnage, loa_meters, beam_meters, flag, year_built
        FROM vessels_master
        WHERE imo_number = ANY($1::integer[])
           OR (mmsi IS NOT NULL AND mmsi = ANY($2::text[]))
      `,
      [imos, mmsis],
    );
    const profiles = new Map<string, VerifiedVesselProfile>();
    result.rows.forEach((row) => {
      const imo = String(row.imo_number ?? "").replace(/\D/g, "");
      const mmsi = String(row.mmsi ?? "").replace(/\D/g, "");
      const profile: VerifiedVesselProfile = {
        imo: imo.length === 7 ? imo : null,
        mmsi: mmsi.length === 9 ? mmsi : null,
        vesselClass: String(row.vessel_type ?? "").trim(),
        grossTonnage: numberOrNull(row.gross_tonnage),
        loaMeters: numberOrNull(row.loa_meters),
        beamMeters: numberOrNull(row.beam_meters),
        flag: row.flag || null,
        yearBuilt: numberOrNull(row.year_built),
      };
      if (profile.imo) profiles.set(`imo:${profile.imo}`, profile);
      if (profile.mmsi) profiles.set(`mmsi:${profile.mmsi}`, profile);
    });
    let matched = 0;
    const overridden = list.map((vessel) => {
      const profile = profiles.get(`imo:${readImo(vessel)}`) || profiles.get(`mmsi:${readMmsi(vessel)}`);
      if (!profile) return vessel;
      matched += 1;
      return applyProfile(vessel, profile);
    });
    return { vessels: overridden, matched, degraded: false, warning: "" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    console.warn("[verified-vessel-classes] batch lookup failed; raw snapshot preserved", warning);
    return { vessels: list, matched: 0, degraded: true, warning };
  }
}
