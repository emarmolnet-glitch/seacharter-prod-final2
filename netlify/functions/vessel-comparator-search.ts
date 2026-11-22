import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";
import { createCorsHeaders } from "./_shared/cors.js";

type VesselMasterRow = QueryResultRow & {
  imo_number?: string | number | null;
  vessel_name?: string | null;
  dwt?: number | null;
  vessel_type?: string | null;
  draft_meters?: number | null;
  year_built?: string | number | null;
  gross_tonnage?: number | null;
  loa_meters?: number | null;
  beam_meters?: number | null;
  service_speed_knots?: number | string | null;
  source_payload?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function parseFirstNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const match = String(value).match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return 0;
  const parsed = parseFloat(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getVesselTypeFamilyFilters(vesselType: string): { includeRegex: string; excludeRegex: string } {
  const norm = cleanString(vesselType).toUpperCase();
  const baseExclude = "BARGE|PONTOON|HOPPER|DREDGER|LANDING|DECK|OFFSHORE|SUPPLY|WORK|CRANE|FLOATING|CABLE|RESEARCH|FISHING|YACHT|PLEASURE";

  if (!norm) {
    return { includeRegex: "", excludeRegex: `(${baseExclude})` };
  }

  if (/BULK|HANDY|SUPRA|PANA|MINI-BULKER|GENERAL CARGO|CARGO|COASTER|CEMENT/.test(norm)) {
    return {
      includeRegex: "(BULK|GENERAL CARGO|CARGO|CEMENT|HANDY|COASTER|MULTI)",
      excludeRegex: `(TANKER|CHEMICAL|OIL|LPG|LNG|GAS|CONTAINER|PASSENGER|CRUISE|TUG|${baseExclude})`
    };
  }

  if (/REEFER|REFRIG/.test(norm)) {
    return {
      includeRegex: "(REEFER|REFRIG)",
      excludeRegex: `(TANKER|CHEMICAL|OIL|LPG|LNG|GAS|CONTAINER|PASSENGER|CRUISE|TUG|${baseExclude})`
    };
  }

  if (/TANKER|CHEMICAL|OIL|LPG|LNG|GAS/.test(norm)) {
    return {
      includeRegex: "(TANKER|CHEMICAL|OIL|LPG|LNG|GAS)",
      excludeRegex: `(BULK|GENERAL CARGO|CONTAINER|PASSENGER|CRUISE|TUG|CEMENT|${baseExclude})`
    };
  }

  if (/CONTAINER/.test(norm)) {
    return {
      includeRegex: "CONTAINER",
      excludeRegex: `(TANKER|CHEMICAL|OIL|LPG|LNG|GAS|PASSENGER|CRUISE|TUG|BULK|${baseExclude})`
    };
  }

  return { includeRegex: "", excludeRegex: `(${baseExclude})` };
}

function formatVesselResponse(row: VesselMasterRow) {
  const sourcePayload = asRecord(row.source_payload);
  const h15 = asRecord(sourcePayload.h15_technical_sheet);
  const metadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);

  const imo = row.imo_number ?? h15.imo ?? metadata.IMO ?? null;
  const vesselName = row.vessel_name || h15.vessel_name || metadata.ShipName || "Buque";
  const vesselType = row.vessel_type || h15.vessel_type_normalized || sourcePayload.vessel_type || "General Cargo";
  const dwt = parseFirstNumber(h15.dwt) || parseFirstNumber(row.dwt) || parseFirstNumber(metadata.DWT) || 0;
  const yearBuilt = parseFirstNumber(h15.year_built) || parseFirstNumber(row.year_built) || parseFirstNumber(metadata.Year_Built) || 0;
  const gt = parseFirstNumber(h15.gross_tonnage) || parseFirstNumber(row.gross_tonnage) || parseFirstNumber(metadata.GT) || 0;
  const loa = parseFirstNumber(h15.loa_meters) || parseFirstNumber(row.loa_meters) || parseFirstNumber(metadata.LOA) || 0;
  const beam = parseFirstNumber(h15.beam_meters) || parseFirstNumber(row.beam_meters) || parseFirstNumber(metadata.Beam) || 0;
  const draft = parseFirstNumber(h15.draft_meters) || parseFirstNumber(row.draft_meters) || parseFirstNumber(metadata.Draft) || 0;

  const spdService =
    parseFirstNumber(h15.service_speed_knots) ||
    parseFirstNumber(row.service_speed_knots) ||
    parseFirstNumber(sourcePayload.spd_laden) ||
    parseFirstNumber(sourcePayload.service_speed) ||
    parseFirstNumber(metadata.Speed) ||
    12.0;

  const spdBallast =
    parseFirstNumber(h15.service_speed_knots) ||
    parseFirstNumber(sourcePayload.spd_ballast) ||
    parseFirstNumber(row.service_speed_knots) ||
    spdService ||
    12.5;

  const spdLaden =
    parseFirstNumber(h15.service_speed_knots) ||
    parseFirstNumber(sourcePayload.spd_laden) ||
    parseFirstNumber(row.service_speed_knots) ||
    spdService ||
    11.5;

  const consSea =
    parseFirstNumber(h15.vlsfo_sea_design_mt_day) ||
    parseFirstNumber(h15.vlsfo_sea_eco_mt_day) ||
    parseFirstNumber(h15.sea_consumption) ||
    parseFirstNumber(sourcePayload.cons_sea) ||
    parseFirstNumber(sourcePayload.fuel_consumption_laden) ||
    parseFirstNumber(sourcePayload.sea_consumption) ||
    parseFirstNumber(metadata.FuelConsumption) ||
    12.0;

  const consBallast =
    parseFirstNumber(h15.vlsfo_sea_ballast_mt_day) ||
    parseFirstNumber(sourcePayload.cons_ballast) ||
    consSea;

  const consPort =
    parseFirstNumber(h15.mgo_port_working_mt_day) ||
    parseFirstNumber(h15.port_consumption) ||
    parseFirstNumber(sourcePayload.port_consumption) ||
    parseFirstNumber(sourcePayload.cons_port) ||
    parseFirstNumber(sourcePayload.fuel_consumption_port) ||
    parseFirstNumber(metadata.PortConsumption) ||
    1.5;

  return {
    imo_number: imo,
    imo: imo,
    vessel_name: vesselName,
    vesselName: vesselName,
    vessel_type: vesselType,
    vesselType: vesselType,
    dwt: dwt > 0 ? dwt : null,
    year_built: yearBuilt > 1800 ? yearBuilt : null,
    built_year: yearBuilt > 1800 ? yearBuilt : null,
    gt: gt > 0 ? gt : null,
    gross_tonnage: gt > 0 ? gt : null,
    loa: loa > 0 ? loa : null,
    loa_meters: loa > 0 ? loa : null,
    beam: beam > 0 ? beam : null,
    beam_meters: beam > 0 ? beam : null,
    draft: draft > 0 ? draft : null,
    draft_meters: draft > 0 ? draft : null,
    service_speed_knots: spdService,
    spd_ballast: spdBallast,
    spd_laden: spdLaden,
    cons_sea: consSea,
    cons_ballast: consBallast,
    cons_port: consPort,
    has_h15: Boolean(sourcePayload.h15_technical_sheet && Object.keys(h15).length > 0),
    data_source: "vessels_master"
  };
}

export default async (req: Request) => {
  const corsHeaders = createCorsHeaders(req, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const url = new URL(req.url);
    let payload: Record<string, unknown> = {};
    if (req.method === "POST") {
      payload = asRecord(await req.json().catch(() => ({})));
    }

    const isSimilarMode = Boolean(
      url.searchParams.get("similarTo") ||
      payload.similarTo ||
      url.searchParams.get("mode") === "similar" ||
      payload.mode === "similar" ||
      (parseFirstNumber(url.searchParams.get("dwt") || payload.dwt) > 0 && !(url.searchParams.get("q") || payload.q))
    );

    const pool = getPool();

    if (isSimilarMode) {
      const rawDwt = parseFirstNumber(url.searchParams.get("dwt") || payload.dwt) || 15000;
      const vesselType = cleanString(url.searchParams.get("vesselType") || payload.vesselType);
      const minYear = parseFirstNumber(url.searchParams.get("minYear") ?? payload.minYear) || 2019;
      const excludeImo = cleanString(url.searchParams.get("excludeImo") || payload.excludeImo).replace(/\D/g, "");
      const tolerancePct = parseFirstNumber(url.searchParams.get("tolerancePct") ?? payload.tolerancePct) || 0.20;

      const minDwt = Math.max(100, Math.round(rawDwt * (1 - tolerancePct)));
      const maxDwt = Math.round(rawDwt * (1 + tolerancePct));
      const { includeRegex, excludeRegex } = getVesselTypeFamilyFilters(vesselType);

      const queryResult = await pool.query<VesselMasterRow>(
        `
          SELECT
            imo_number,
            vessel_name,
            vessel_type,
            dwt,
            year_built,
            gross_tonnage,
            loa_meters,
            beam_meters,
            draft_meters,
            service_speed_knots,
            source_payload
          FROM vessels_master
          WHERE dwt IS NOT NULL AND dwt > 0
            AND dwt BETWEEN $1 AND $2
            AND ($3 = 0 OR year_built >= $3)
            AND ($4 = '' OR imo_number::text != $4)
            AND ($5 = '' OR UPPER(COALESCE(vessel_type, '')) ~ $5)
            AND ($6 = '' OR UPPER(COALESCE(vessel_type, '')) !~ $6)
            AND UPPER(COALESCE(vessel_name, '')) !~ '(BARGE|PONTOON|HOPPER|DREDGER|CRANE|TUG|SUPPLY)'
          ORDER BY
            CASE
              WHEN COALESCE(service_speed_knots, 0) > 0
                OR (source_payload->'h15_technical_sheet'->>'service_speed_knots') IS NOT NULL
              THEN 0
              ELSE 1
            END ASC,
            (source_payload ? 'h15_technical_sheet') DESC,
            year_built DESC NULLS LAST,
            ABS(dwt - $7) ASC
          LIMIT 8
        `,
        [minDwt, maxDwt, minYear, excludeImo, includeRegex, excludeRegex, rawDwt]
      );

      let rows = queryResult.rows || [];

      // If strict minYear returned fewer than 8 vessels, widen to find additional candidate vessels
      if (rows.length < 8) {
        const existingImos = rows.map((r) => String(r.imo_number || "")).filter(Boolean);
        const fallbackResult = await pool.query<VesselMasterRow>(
          `
            SELECT
              imo_number,
              vessel_name,
              vessel_type,
              dwt,
              year_built,
              gross_tonnage,
              loa_meters,
              beam_meters,
              draft_meters,
              service_speed_knots,
              source_payload
            FROM vessels_master
            WHERE dwt IS NOT NULL AND dwt > 0
              AND dwt BETWEEN $1 AND $2
              AND ($3 = '' OR imo_number::text != $3)
              AND NOT (imo_number::text = ANY($4::text[]))
              AND ($5 = '' OR UPPER(COALESCE(vessel_type, '')) ~ $5)
              AND ($6 = '' OR UPPER(COALESCE(vessel_type, '')) !~ $6)
              AND UPPER(COALESCE(vessel_name, '')) !~ '(BARGE|PONTOON|HOPPER|DREDGER|CRANE|TUG|SUPPLY)'
            ORDER BY
              CASE
                WHEN COALESCE(service_speed_knots, 0) > 0
                  OR (source_payload->'h15_technical_sheet'->>'service_speed_knots') IS NOT NULL
                THEN 0
                ELSE 1
              END ASC,
              (source_payload ? 'h15_technical_sheet') DESC,
              year_built DESC NULLS LAST,
              ABS(dwt - $7) ASC
            LIMIT $8
          `,
          [
            Math.max(100, Math.round(rawDwt * 0.70)),
            Math.round(rawDwt * 1.30),
            excludeImo,
            existingImos,
            includeRegex,
            excludeRegex,
            rawDwt,
            8 - rows.length
          ]
        ).catch(() => ({ rows: [] as VesselMasterRow[] }));

        rows = rows.concat(fallbackResult.rows || []);
      }

      const vessels = rows.map(formatVesselResponse);

      return Response.json(
        {
          success: true,
          mode: "similar",
          targetDwt: rawDwt,
          minYear,
          count: vessels.length,
          vessels
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Modo búsqueda libre (q)
    let searchTerm = cleanString(url.searchParams.get("q") || payload.q || url.searchParams.get("query") || payload.query);
    const parenIndex = searchTerm.indexOf("(");
    if (parenIndex !== -1) {
      searchTerm = searchTerm.substring(0, parenIndex).trim();
    }
    const imoDigits = searchTerm.replace(/\D/g, "");

    const queryResult = await pool.query<VesselMasterRow>(
      `
        SELECT
          imo_number,
          vessel_name,
          vessel_type,
          dwt,
          year_built,
          gross_tonnage,
          loa_meters,
          beam_meters,
          draft_meters,
          service_speed_knots,
          source_payload
        FROM vessels_master
        WHERE (
          imo_number::text = $1
          OR ($2 != '' AND imo_number::text = $2)
          OR vessel_name ILIKE $3
        )
        ORDER BY
          (source_payload ? 'h15_technical_sheet') DESC,
          CASE
            WHEN imo_number::text = $1 OR ($2 != '' AND imo_number::text = $2) THEN 0
            WHEN LOWER(vessel_name) = LOWER($1) THEN 1
            ELSE 2
          END,
          year_built DESC NULLS LAST,
          fecha_ultima_actualizacion DESC NULLS LAST
        LIMIT 10
      `,
      [searchTerm, imoDigits, `%${searchTerm}%`]
    );

    const vessels = (queryResult.rows || []).map(formatVesselResponse);

    return Response.json(
      {
        success: true,
        mode: "search",
        searchTerm,
        count: vessels.length,
        vessels
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("[vessel-comparator-search] Error querying vessels_master:", error);
    return Response.json(
      {
        success: false,
        error: (error as Error)?.message || "Internal database error"
      },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: ["/api/vessel-comparator-search", "/.netlify/functions/vessel-comparator-search"]
};
