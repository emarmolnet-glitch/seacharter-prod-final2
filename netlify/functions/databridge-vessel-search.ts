import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type VesselMasterRow = QueryResultRow & {
  id?: number | string;
  imo_number?: string | number | null;
  vessel_name?: string | null;
  dwt?: number | null;
  mmsi?: string | null;
  vessel_type?: string | null;
  draft_meters?: number | null;
  flag?: string | null;
  eta?: string | null;
  last_port?: string | null;
  current_destination?: string | null;
  year_built?: string | number | null;
  gross_tonnage?: number | null;
  net_tonnage?: number | null;
  loa_meters?: number | null;
  beam_meters?: number | null;
  owner_manager?: string | null;
  has_gears?: boolean | null;
  process_status?: string | null;
  status?: string | null;
  validation_status?: string | null;
  audit_status?: string | null;
  audit_source?: string | null;
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

export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    let searchTerm = "";
    if (req.method === "GET") {
      const url = new URL(req.url);
      searchTerm = cleanString(url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("search"));
    } else {
      const body = await req.json().catch(() => ({}));
      const payload = asRecord(body);
      searchTerm = cleanString(payload.q || payload.query || payload.vessel_name || payload.imo_number || payload.search);
    }

    const pool = getPool();

    if (!searchTerm || searchTerm.toUpperCase() === "TBN") {
      // Query portfolio vessels from vessels_master for dual-sourcing / bulk loading
      const allQueryResult = await pool.query<VesselMasterRow>(
        `
          SELECT
            imo_number,
            vessel_name,
            dwt,
            mmsi,
            vessel_type,
            draft_meters,
            flag,
            latitude,
            longitude,
            eta,
            last_port,
            current_destination,
            year_built,
            gross_tonnage,
            net_tonnage,
            loa_meters,
            beam_meters,
            owner_manager,
            has_gears,
            process_status,
            status,
            validation_status,
            audit_status,
            audit_source,
            source_payload
          FROM vessels_master
          WHERE (status = 'EN_CARTERA' OR validation_status = 'VALIDADO')
            AND UPPER(COALESCE(status, '')) NOT IN ('PENDING', 'PENDING_AUDIT')
            AND UPPER(COALESCE(audit_status, '')) NOT IN ('PENDING', 'IN_DUE_DILIGENCE', 'REJECTED')
            AND UPPER(COALESCE(process_status, '')) NOT IN ('PENDING_REVIEW', 'DUE_DILIGENCE')
          ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
          LIMIT 1000
        `
      ).catch(() => ({ rows: [] as VesselMasterRow[] }));

      const mappedVessels = (allQueryResult.rows || []).map((row) => {
        const sourcePayload = asRecord(row.source_payload);
        const metadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);
        return {
          vessel_name: row.vessel_name || sourcePayload.vessel_name || metadata.ShipName || 'Buque Data Bridge',
          vesselName: row.vessel_name || sourcePayload.vessel_name || metadata.ShipName || 'Buque Data Bridge',
          imo: row.imo_number || sourcePayload.imo || metadata.IMO || null,
          imo_number: row.imo_number || sourcePayload.imo_number || metadata.IMO || null,
          dwt: row.dwt ?? (sourcePayload.dwt as number | null) ?? (metadata.DWT as number | null) ?? null,
          mmsi: row.mmsi || (sourcePayload.mmsi as string | null) || null,
          vessel_type: row.vessel_type || (sourcePayload.vessel_type as string | null) || null,
          latitude: row.latitude ?? (sourcePayload.latitude as number | null) ?? null,
          longitude: row.longitude ?? (sourcePayload.longitude as number | null) ?? null,
          lat: row.latitude ?? (sourcePayload.latitude as number | null) ?? null,
          lng: row.longitude ?? (sourcePayload.longitude as number | null) ?? null,
          draft: row.draft_meters ?? (sourcePayload.draft as number | null) ?? null,
          flag: row.flag || (sourcePayload.flag as string | null) || (metadata.Flag as string | null) || null,
          gross_tonnage: row.gross_tonnage ?? (sourcePayload.gross_tonnage as number | null) ?? (sourcePayload.gt as number | null) ?? null,
          gt: row.gross_tonnage ?? (sourcePayload.gross_tonnage as number | null) ?? (sourcePayload.gt as number | null) ?? null,
          net_tonnage: row.net_tonnage ?? (sourcePayload.net_tonnage as number | null) ?? (sourcePayload.nt as number | null) ?? null,
          loa_meters: row.loa_meters ?? (sourcePayload.loa_meters as number | null) ?? (sourcePayload.loa as number | null) ?? null,
          loa: row.loa_meters ?? (sourcePayload.loa_meters as number | null) ?? (sourcePayload.loa as number | null) ?? null,
          beam_meters: row.beam_meters ?? (sourcePayload.beam_meters as number | null) ?? (sourcePayload.beam as number | null) ?? null,
          beam: row.beam_meters ?? (sourcePayload.beam_meters as number | null) ?? (sourcePayload.beam as number | null) ?? null,
          audit_status: row.audit_status || null,
          auditStatus: row.audit_status || null,
          audit_source: row.audit_source || null,
          data_source: 'databridge'
        };
      });

      return Response.json({
        success: true,
        vessel: mappedVessels[0] || null,
        vessels: mappedVessels,
        data: mappedVessels,
        count: mappedVessels.length,
        message: "Flota de Data Bridge cargada con éxito"
      }, { status: 200 });
    }

    // Extract base search name/IMO if parenthesized
    const parenIndex = searchTerm.indexOf("(");
    if (parenIndex !== -1) {
      searchTerm = searchTerm.substring(0, parenIndex).trim();
    }

    // Extract digits for clean IMO check
    const imoDigits = searchTerm.replace(/\D/g, "");

    // Local-first lookup: targeted searches must include freshly saved Due Diligence
    // records even while they are still pending portfolio validation.
    const queryResult = await pool.query<VesselMasterRow>(
      `
        SELECT
          imo_number,
          vessel_name,
          dwt,
          mmsi,
          vessel_type,
          draft_meters,
          flag,
          latitude,
          longitude,
          eta,
          last_port,
          current_destination,
          year_built,
          gross_tonnage,
          net_tonnage,
          loa_meters,
          beam_meters,
          owner_manager,
          has_gears,
          process_status,
          status,
          validation_status,
          audit_status,
          audit_source,
          source_payload
        FROM vessels_master
        WHERE (
          imo_number::text = $1
          OR ($3 != '' AND imo_number::text = $3)
          OR mmsi = $1
          OR ($3 != '' AND mmsi = $3)
          OR vessel_name ILIKE $2
        )
        ORDER BY
          CASE
            WHEN imo_number::text = $1 OR ($3 != '' AND imo_number::text = $3) THEN 0
            WHEN mmsi = $1 OR ($3 != '' AND mmsi = $3) THEN 1
            WHEN LOWER(vessel_name) = LOWER($1) THEN 2
            WHEN audit_status IS NOT NULL THEN 3
            ELSE 4
          END,
          fecha_ultima_actualizacion DESC NULLS LAST
        LIMIT 1
      `,
      [searchTerm, `%${searchTerm}%`, imoDigits],
    );

    if (!queryResult.rows || queryResult.rows.length === 0) {
      return Response.json({
        success: false,
        vessel: null,
        vessels: [],
        data: [],
        message: "Buque no encontrado en Data Bridge",
      }, { status: 200 });
    }

    const row = queryResult.rows[0];
    const sourcePayload = asRecord(row.source_payload);
    const metadata = asRecord(sourcePayload.MetaData || sourcePayload.metadata);

    const vesselData = {
      vessel_name: row.vessel_name || sourcePayload.vessel_name || metadata.ShipName || searchTerm,
      vesselName: row.vessel_name || sourcePayload.vessel_name || metadata.ShipName || searchTerm,
      imo: row.imo_number || sourcePayload.imo || metadata.IMO || null,
      imo_number: row.imo_number || sourcePayload.imo_number || metadata.IMO || null,
      dwt: row.dwt ?? (sourcePayload.dwt as number | null) ?? (metadata.DWT as number | null) ?? null,
      mmsi: row.mmsi || (sourcePayload.mmsi as string | null) || null,
      vessel_type: row.vessel_type || (sourcePayload.vessel_type as string | null) || null,
      latitude: row.latitude ?? (sourcePayload.latitude as number | null) ?? null,
      longitude: row.longitude ?? (sourcePayload.longitude as number | null) ?? null,
      lat: row.latitude ?? (sourcePayload.latitude as number | null) ?? null,
      lng: row.longitude ?? (sourcePayload.longitude as number | null) ?? null,
      draft: row.draft_meters ?? (sourcePayload.draft as number | null) ?? null,
      draft_meters: row.draft_meters ?? (sourcePayload.draft as number | null) ?? null,
      flag: row.flag || (sourcePayload.flag as string | null) || (metadata.Flag as string | null) || null,
      year_built: row.year_built || (sourcePayload.built_year as string | number | null) || (metadata.Year_Built as string | number | null) || null,
      built_year: row.year_built || (sourcePayload.built_year as string | number | null) || (metadata.Year_Built as string | number | null) || null,
      gross_tonnage: row.gross_tonnage ?? (sourcePayload.gross_tonnage as number | null) ?? (sourcePayload.gt as number | null) ?? null,
      gt: row.gross_tonnage ?? (sourcePayload.gross_tonnage as number | null) ?? (sourcePayload.gt as number | null) ?? null,
      net_tonnage: row.net_tonnage ?? (sourcePayload.net_tonnage as number | null) ?? (sourcePayload.nt as number | null) ?? null,
      loa_meters: row.loa_meters ?? (sourcePayload.loa_meters as number | null) ?? (sourcePayload.loa as number | null) ?? null,
      beam_meters: row.beam_meters ?? (sourcePayload.beam_meters as number | null) ?? (sourcePayload.beam as number | null) ?? null,
      owner_manager: row.owner_manager || null,
      has_gears: row.has_gears ?? null,
      status: row.status,
      validation_status: row.validation_status,
      audit_status: row.audit_status,
      auditStatus: row.audit_status,
      audit_source: row.audit_source,
      spd_ballast: sourcePayload.spd_ballast || null,
      spd_laden: sourcePayload.spd_laden || null,
      cons_sea: sourcePayload.cons_sea || null,
      cons_port: sourcePayload.cons_port || null,
      loa: row.loa_meters ?? (sourcePayload.loa_meters as number | null) ?? (sourcePayload.loa as number | null) ?? null,
      beam: row.beam_meters ?? (sourcePayload.beam_meters as number | null) ?? (sourcePayload.beam as number | null) ?? null,
      vessel_class: sourcePayload.vessel_class || row.vessel_type || null,
      specialty_type: sourcePayload.specialty_type || row.vessel_type || null,
      data_source: 'vessels_master',
      local_first: true,
    };

    return Response.json({
      success: true,
      vessel: vesselData,
      vessels: [vesselData],
      data: [vesselData],
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[databridge-vessel-search] Query failed:", errorMessage);
    return Response.json(
      { success: false, vessel: null, vessels: [], data: [], message: "Buque no encontrado en Data Bridge", error: errorMessage },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: "/api/databridge-vessel-search",
  method: ["GET", "POST"],
};
