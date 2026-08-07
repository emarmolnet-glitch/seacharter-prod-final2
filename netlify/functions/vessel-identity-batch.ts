import type { Config, Context } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { createCorsHeaders } from "./_shared/cors.js";

type VesselIdentityRow = QueryResultRow & {
  imo_number: number | string | null;
  vessel_name: string | null;
  mmsi: string | null;
  vessel_type: string | null;
  flag: string | null;
  dwt: number | null;
  year_built: number | null;
  gross_tonnage: number | string | null;
  loa_meters: number | string | null;
  beam_meters: number | string | null;
};

function normalizeMmsi(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function normalizeImo(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? digits : null;
}

function numericValue(value: number | string | null) {
  if (value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export default async function handler(req: Request, _context: Context) {
  const corsHeaders = createCorsHeaders(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "method_not_allowed" }, {
      status: 405,
      headers: { ...corsHeaders, Allow: "POST, OPTIONS", "cache-control": "no-store" },
    });
  }

  let payload: { mmsis?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return Response.json({ success: false, error: "invalid_json" }, {
      status: 400,
      headers: { ...corsHeaders, "cache-control": "no-store" },
    });
  }

  const mmsis = Array.from(new Set(
    (Array.isArray(payload.mmsis) ? payload.mmsis : []).map(normalizeMmsi).filter(Boolean),
  )).slice(0, 100);
  if (mmsis.length === 0) {
    return Response.json({ success: true, vessels: [] }, {
      headers: { ...corsHeaders, "cache-control": "private, max-age=300" },
    });
  }

  const result = await getPool().query<VesselIdentityRow>(
    `
      SELECT DISTINCT ON (regexp_replace(mmsi, '\\D', '', 'g'))
        imo_number,
        vessel_name,
        mmsi,
        vessel_type,
        flag,
        dwt,
        year_built,
        gross_tonnage,
        loa_meters,
        beam_meters
      FROM vessels_master
      WHERE regexp_replace(mmsi, '\\D', '', 'g') = ANY($1::text[])
      ORDER BY
        regexp_replace(mmsi, '\\D', '', 'g'),
        CASE WHEN audit_status = 'VALIDATED' THEN 0 ELSE 1 END,
        fecha_ultima_actualizacion DESC NULLS LAST
    `,
    [mmsis],
  );

  const vessels = result.rows.map((row) => {
    const mmsi = normalizeMmsi(row.mmsi);
    const imo = normalizeImo(row.imo_number);
    const vesselName = String(row.vessel_name || "").trim() || null;
    return {
      mmsi,
      MMSI: mmsi,
      imo,
      IMO: imo,
      imoNumber: imo,
      imo_number: imo,
      name: vesselName,
      vesselName,
      vessel_name: vesselName,
      ShipName: vesselName,
      SHIPNAME: vesselName,
      vesselType: row.vessel_type,
      vessel_type: row.vessel_type,
      flag: row.flag,
      dwt: numericValue(row.dwt),
      DWT: numericValue(row.dwt),
      yearBuilt: row.year_built,
      year_built: row.year_built,
      grossTonnage: numericValue(row.gross_tonnage),
      gross_tonnage: numericValue(row.gross_tonnage),
      loaMeters: numericValue(row.loa_meters),
      loa_meters: numericValue(row.loa_meters),
      beamMeters: numericValue(row.beam_meters),
      beam_meters: numericValue(row.beam_meters),
    };
  });

  return Response.json({ success: true, vessels }, {
    headers: { ...corsHeaders, "cache-control": "private, max-age=300" },
  });
}

export const config: Config = {
  path: "/api/vessel-identity-batch",
};
