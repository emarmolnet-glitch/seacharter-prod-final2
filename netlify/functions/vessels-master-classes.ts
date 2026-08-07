import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type VesselMasterProfileRow = QueryResultRow & {
  imo_number: number | string | null;
  mmsi: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  gross_tonnage: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
  flag: string | null;
  year_built: number | string | null;
  verified_at: Date | string | null;
};

const MAX_IDENTIFIERS = 500;
const MAX_ROWS = 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  return String(value ?? "").split(",");
}

function normalizeImos(value: unknown): number[] {
  const values = new Set<number>();
  toList(value).forEach((item) => {
    const digits = item.replace(/\D/g, "");
    if (digits.length === 7) values.add(Number(digits));
  });
  return Array.from(values).slice(0, MAX_IDENTIFIERS);
}

function normalizeMmsis(value: unknown): string[] {
  const values = new Set<string>();
  toList(value).forEach((item) => {
    const digits = item.replace(/\D/g, "");
    if (digits.length === 9) values.add(digits);
  });
  return Array.from(values).slice(0, MAX_IDENTIFIERS);
}

function positiveNumber(value: number | string | null): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function validYear(value: number | string | null): number | null {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric >= 1800 && numeric <= 2100 ? numeric : null;
}

function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapProfile(row: VesselMasterProfileRow) {
  const imo = String(row.imo_number ?? "").replace(/\D/g, "");
  const mmsi = String(row.mmsi ?? "").replace(/\D/g, "");
  const grossTonnage = positiveNumber(row.gross_tonnage);
  const loaMeters = positiveNumber(row.loa_meters);
  const beamMeters = positiveNumber(row.beam_meters);
  const yearBuilt = validYear(row.year_built);
  return {
    imo: imo.length === 7 ? imo : null,
    imo_number: imo.length === 7 ? imo : null,
    mmsi: mmsi.length === 9 ? mmsi : null,
    vesselName: row.vessel_name || null,
    vessel_name: row.vessel_name || null,
    vesselClass: row.vessel_type || null,
    vesselType: row.vessel_type || null,
    vessel_type: row.vessel_type || null,
    grossTonnage,
    gross_tonnage: grossTonnage,
    loaMeters,
    loa_meters: loaMeters,
    beamMeters,
    beam_meters: beamMeters,
    flag: row.flag || null,
    yearBuilt,
    year_built: yearBuilt,
    verifiedAt: isoDate(row.verified_at),
    source: "VESSELS_MASTER" as const,
  };
}

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  let imoNumbers: number[] = [];
  let mmsiNumbers: string[] = [];
  if (req.method === "GET") {
    const url = new URL(req.url);
    imoNumbers = normalizeImos(url.searchParams.getAll("imo"));
    mmsiNumbers = normalizeMmsis(url.searchParams.getAll("mmsi"));
  } else {
    const body = asRecord(await req.json().catch(() => ({})));
    imoNumbers = normalizeImos(body.imos ?? body.imo ?? body.imo_numbers);
    mmsiNumbers = normalizeMmsis(body.mmsis ?? body.mmsi);
  }

  if (imoNumbers.length === 0 && mmsiNumbers.length === 0) {
    return Response.json({ success: true, count: 0, classes: [], profiles: [] });
  }

  try {
    const result = await getPool().query<VesselMasterProfileRow>(
      `
        SELECT
          imo_number, mmsi, vessel_name, vessel_type, gross_tonnage,
          loa_meters, beam_meters, flag, year_built,
          fecha_ultima_actualizacion AS verified_at
        FROM vessels_master
        WHERE imo_number = ANY($1::integer[])
           OR (mmsi IS NOT NULL AND mmsi = ANY($2::text[]))
        ORDER BY fecha_ultima_actualizacion DESC NULLS LAST, imo_number ASC
        LIMIT $3::integer
      `,
      [imoNumbers, mmsiNumbers, MAX_ROWS],
    );
    const profiles = result.rows.map(mapProfile).filter((profile) => profile.imo || profile.mmsi);
    return Response.json({
      success: true,
      source: "vessels_master",
      count: profiles.length,
      profiles,
      classes: profiles,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    console.error("[vessels-master-classes] Lookup failed", message);
    return Response.json({ success: false, error: message, classes: [], profiles: [] }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/vessels-master-classes",
  method: ["GET", "POST"],
};
