import type { Config } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPool } from "../../db/index.js";
import { createCorsHeaders } from "./_shared/cors.js";
import { parseDeterministicParticulars, normalizeFlagCode } from "./_shared/vessel-particulars-parser.mjs";

declare const Netlify: {
  env?: {
    get: (key: string) => string | undefined;
  };
} | undefined;

function getGeminiApiKey(): string {
  return (
    (typeof Netlify !== "undefined" && (
      Netlify.env?.get?.("GEMINI_API_KEY") ||
      Netlify.env?.get?.("GOOGLE_API_KEY") ||
      Netlify.env?.get?.("GOOGLE_GENAI_API_KEY")
    )) ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    ""
  );
}

function parseSafeNumber(val: unknown): number | null {
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (!val) return null;
  const match = String(val).match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = parseFloat(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatVesselObject(v: Record<string, any>) {
  const rawImo = v.imo_number || v.imo;
  const imoClean = rawImo ? String(rawImo).replace(/\D/g, "").slice(0, 7) : null;
  const imo = imoClean && /^\d{7}$/.test(imoClean) ? imoClean : null;

  const name = String(v.vessel_name || v.vesselName || "Unknown Vessel").trim();
  const type = String(v.vessel_type || v.vessel_class || v.vesselType || "Handysize").trim();

  const dwtNum = parseSafeNumber(v.dwt);
  const dwt = dwtNum && dwtNum > 0 ? Math.round(dwtNum) : null;

  const yearNum = parseSafeNumber(v.year_built || v.built_year);
  const yearBuilt = yearNum && yearNum > 1900 ? Math.round(yearNum) : null;

  const gtNum = parseSafeNumber(v.gross_tonnage || v.gt);
  const grossTonnage = gtNum && gtNum > 0 ? Math.round(gtNum) : null;

  const ntNum = parseSafeNumber(v.net_tonnage || v.nt);
  const netTonnage = ntNum && ntNum > 0 ? Math.round(ntNum) : null;

  const loaNum = parseSafeNumber(v.loa_meters || v.loa);
  const loaMeters = loaNum && loaNum > 0 ? Number(loaNum.toFixed(2)) : null;

  const beamNum = parseSafeNumber(v.beam_meters || v.beam);
  const beamMeters = beamNum && beamNum > 0 ? Number(beamNum.toFixed(2)) : null;

  const draftNum = parseSafeNumber(v.draft_meters || v.draft);
  const draftMeters = draftNum && draftNum > 0 ? Number(draftNum.toFixed(2)) : null;

  const dwccNum = parseSafeNumber(v.dwcc);
  const dwcc = dwccNum && dwccNum > 0 ? Math.round(dwccNum) : null;

  const spdBallastNum = parseSafeNumber(v.spd_ballast);
  const spdBallast = spdBallastNum && spdBallastNum > 0 ? Number(spdBallastNum.toFixed(1)) : 12.5;

  const spdLadenNum = parseSafeNumber(v.spd_laden);
  const spdLaden = spdLadenNum && spdLadenNum > 0 ? Number(spdLadenNum.toFixed(1)) : 11.5;

  const serviceSpeed = spdLaden || spdBallast || 12.0;

  const consSeaNum = parseSafeNumber(v.cons_sea);
  const consSea = consSeaNum && consSeaNum > 0 ? Number(consSeaNum.toFixed(1)) : 12.0;

  const consPortNum = parseSafeNumber(v.cons_port);
  const consPort = consPortNum && consPortNum > 0 ? Number(consPortNum.toFixed(1)) : 1.5;

  const flag = v.flag && typeof v.flag === "string" && v.flag.trim() ? v.flag.trim() : null;

  return {
    vessel_name: name,
    vesselName: name,
    imo_number: imo,
    imo: imo,
    year_built: yearBuilt,
    built_year: yearBuilt,
    dwt: dwt,
    dwcc: dwcc,
    vessel_type: type,
    vessel_class: type,
    vesselType: type,
    gross_tonnage: grossTonnage,
    gt: grossTonnage,
    net_tonnage: netTonnage,
    nt: netTonnage,
    loa_meters: loaMeters,
    loa: loaMeters,
    beam_meters: beamMeters,
    beam: beamMeters,
    draft_meters: draftMeters,
    draft: draftMeters,
    spd_ballast: spdBallast,
    spd_laden: spdLaden,
    service_speed_knots: serviceSpeed,
    cons_sea: consSea,
    cons_port: consPort,
    flag: flag,
  };
}

async function parseWithGemini(rawText: string, deterministicFallback: any) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return {
      vessel: deterministicFallback,
      source: "regex_particulars" as const,
    };
  }

  const prompt = `You are a specialized maritime software assistant extracting vessel specifications from broker copy-paste text (such as Baltic descriptions, ship's particulars, WhatsApp messages, or emails).
Extract the vessel particulars and return strictly a valid JSON object with the following fields:
{
  "vessel_name": string or null,
  "imo_number": string or null (must be exactly 7 digits like "9811983", otherwise null),
  "year_built": number or null (e.g. 2021),
  "dwt": number or null (metric tons deadweight),
  "dwcc": number or null (deadweight cargo capacity),
  "vessel_type": string or null (e.g. "General Cargo", "Bulk Carrier", "Handysize", etc.),
  "gross_tonnage": number or null,
  "net_tonnage": number or null,
  "loa_meters": number or null,
  "beam_meters": number or null,
  "draft_meters": number or null,
  "spd_ballast": number or null (ballast speed in knots),
  "spd_laden": number or null (laden speed in knots),
  "cons_sea": number or null (sea consumption in metric tons/day),
  "cons_port": number or null (port consumption in metric tons/day),
  "flag": string or null
}

CRITICAL RULES:
1. Return null for any field that is NOT present or cannot be determined. NEVER invent, hallucinate, or assume data.
2. All numbers must be pure numeric values (no units like mt, kt, m, etc.).
3. Return only raw JSON, without markdown formatting or code blocks.

Text to parse:
"""
${rawText}
"""`;

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
  const genAI = new GoogleGenerativeAI(apiKey);

  let aiParsed: Record<string, unknown> | null = null;
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) {
        aiParsed = JSON.parse(text);
        break;
      }
    } catch (err) {
      console.warn(`[vessel-particulars-ingest] Gemini ${modelName} failed:`, err);
    }
  }

  if (!aiParsed) {
    return {
      vessel: deterministicFallback,
      source: "regex_particulars" as const,
    };
  }

  // Combine AI result with deterministic fallback (no NaN)
  const combined = {
    vessel_name: typeof aiParsed.vessel_name === "string" && aiParsed.vessel_name.trim()
      ? aiParsed.vessel_name.trim()
      : deterministicFallback?.vessel_name || null,
    imo_number: typeof aiParsed.imo_number === "string" && /^\d{7}$/.test(aiParsed.imo_number.trim())
      ? aiParsed.imo_number.trim()
      : (typeof aiParsed.imo_number === "number" && /^\d{7}$/.test(String(aiParsed.imo_number))
          ? String(aiParsed.imo_number)
          : deterministicFallback?.imo_number || null),
    year_built: parseSafeNumber(aiParsed.year_built) && parseSafeNumber(aiParsed.year_built)! > 1900
      ? Math.round(parseSafeNumber(aiParsed.year_built)!)
      : deterministicFallback?.year_built || null,
    dwt: parseSafeNumber(aiParsed.dwt) && parseSafeNumber(aiParsed.dwt)! > 0
      ? parseSafeNumber(aiParsed.dwt)
      : deterministicFallback?.dwt || null,
    dwcc: parseSafeNumber(aiParsed.dwcc) && parseSafeNumber(aiParsed.dwcc)! > 0
      ? parseSafeNumber(aiParsed.dwcc)
      : deterministicFallback?.dwcc || null,
    vessel_type: typeof aiParsed.vessel_type === "string" && aiParsed.vessel_type.trim()
      ? aiParsed.vessel_type.trim()
      : deterministicFallback?.vessel_type || null,
    gross_tonnage: parseSafeNumber(aiParsed.gross_tonnage) && parseSafeNumber(aiParsed.gross_tonnage)! > 0
      ? parseSafeNumber(aiParsed.gross_tonnage)
      : deterministicFallback?.gross_tonnage || null,
    net_tonnage: parseSafeNumber(aiParsed.net_tonnage) && parseSafeNumber(aiParsed.net_tonnage)! > 0
      ? parseSafeNumber(aiParsed.net_tonnage)
      : deterministicFallback?.net_tonnage || null,
    loa_meters: parseSafeNumber(aiParsed.loa_meters) && parseSafeNumber(aiParsed.loa_meters)! > 0
      ? parseSafeNumber(aiParsed.loa_meters)
      : deterministicFallback?.loa_meters || null,
    beam_meters: parseSafeNumber(aiParsed.beam_meters) && parseSafeNumber(aiParsed.beam_meters)! > 0
      ? parseSafeNumber(aiParsed.beam_meters)
      : deterministicFallback?.beam_meters || null,
    draft_meters: parseSafeNumber(aiParsed.draft_meters) && parseSafeNumber(aiParsed.draft_meters)! > 0
      ? parseSafeNumber(aiParsed.draft_meters)
      : deterministicFallback?.draft_meters || null,
    spd_ballast: parseSafeNumber(aiParsed.spd_ballast) && parseSafeNumber(aiParsed.spd_ballast)! > 0
      ? parseSafeNumber(aiParsed.spd_ballast)
      : deterministicFallback?.spd_ballast || null,
    spd_laden: parseSafeNumber(aiParsed.spd_laden) && parseSafeNumber(aiParsed.spd_laden)! > 0
      ? parseSafeNumber(aiParsed.spd_laden)
      : deterministicFallback?.spd_laden || null,
    cons_sea: parseSafeNumber(aiParsed.cons_sea) && parseSafeNumber(aiParsed.cons_sea)! > 0
      ? parseSafeNumber(aiParsed.cons_sea)
      : deterministicFallback?.cons_sea || null,
    cons_port: parseSafeNumber(aiParsed.cons_port) && parseSafeNumber(aiParsed.cons_port)! > 0
      ? parseSafeNumber(aiParsed.cons_port)
      : deterministicFallback?.cons_port || null,
    flag: typeof aiParsed.flag === "string" && aiParsed.flag.trim()
      ? aiParsed.flag.trim()
      : deterministicFallback?.flag || null,
  };

  return {
    vessel: combined,
    source: "ai_particulars" as const,
  };
}

export default async (req: Request) => {
  const corsHeaders = createCorsHeaders(req, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed. Use POST." },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { success: false, error: "JSON payload inválido." },
        { status: 400, headers: corsHeaders }
      );
    }

    const action = String(body.action || "parse").trim().toLowerCase();

    // =========================================================================
    // ACTION: PARSE
    // =========================================================================
    if (action === "parse") {
      const rawText = String(body.rawText || "").trim();
      const vesselNameHint = String(body.vesselName || "").trim();

      // If rawText is empty and only vesselName (or 7-digit IMO) is provided
      if (!rawText && vesselNameHint) {
        const digitsOnly = vesselNameHint.replace(/\D/g, "");
        const isImo = /^\d{7}$/.test(digitsOnly);
        const pool = getPool();

        const result = await pool.query(
          `
            SELECT
              imo_number,
              vessel_name,
              vessel_type,
              dwt,
              year_built,
              gross_tonnage,
              net_tonnage,
              loa_meters,
              beam_meters,
              draft_meters,
              service_speed_knots,
              flag,
              source_payload
            FROM vessels_master
            WHERE ($1 != '' AND (imo_number::text = $1 OR imo::text = $1))
               OR ($2 != '' AND LOWER(vessel_name) = LOWER($2))
               OR ($2 != '' AND vessel_name ILIKE $3)
            ORDER BY
              CASE
                WHEN imo_number::text = $1 OR imo::text = $1 THEN 0
                WHEN LOWER(vessel_name) = LOWER($2) THEN 1
                ELSE 2
              END
            LIMIT 1
          `,
          [isImo ? digitsOnly : "", vesselNameHint, `%${vesselNameHint}%`]
        );

        if (result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          const sourcePayload = (row.source_payload && typeof row.source_payload === "object")
            ? (row.source_payload as Record<string, any>)
            : {};
          const h15 = (sourcePayload.h15_technical_sheet && typeof sourcePayload.h15_technical_sheet === "object")
            ? sourcePayload.h15_technical_sheet
            : {};
          const brokerParticulars = (sourcePayload.broker_particulars && typeof sourcePayload.broker_particulars === "object")
            ? sourcePayload.broker_particulars
            : {};

          const spdBallastVal = parseSafeNumber(sourcePayload.spd_ballast) ||
            parseSafeNumber(row.service_speed_knots) ||
            parseSafeNumber(h15.service_speed_knots) ||
            parseSafeNumber(sourcePayload.service_speed);

          const spdLadenVal = parseSafeNumber(sourcePayload.spd_laden) ||
            parseSafeNumber(row.service_speed_knots) ||
            parseSafeNumber(h15.service_speed_knots) ||
            parseSafeNumber(sourcePayload.service_speed);

          const consSeaVal = parseSafeNumber(sourcePayload.cons_sea) ||
            parseSafeNumber(sourcePayload.fuel_consumption_laden) ||
            parseSafeNumber(h15.vlsfo_sea_design_mt_day) ||
            parseSafeNumber(h15.vlsfo_sea_eco_mt_day) ||
            parseSafeNumber(h15.sea_consumption) ||
            parseSafeNumber(sourcePayload.sea_consumption);

          const consPortVal = parseSafeNumber(sourcePayload.cons_port) ||
            parseSafeNumber(sourcePayload.port_consumption) ||
            parseSafeNumber(h15.mgo_port_working_mt_day) ||
            parseSafeNumber(h15.port_consumption) ||
            parseSafeNumber(sourcePayload.fuel_consumption_port);

          const formatted = formatVesselObject({
            imo_number: row.imo_number,
            vessel_name: row.vessel_name,
            vessel_type: row.vessel_type,
            dwt: row.dwt,
            year_built: row.year_built,
            gross_tonnage: row.gross_tonnage,
            net_tonnage: row.net_tonnage,
            loa_meters: row.loa_meters,
            beam_meters: row.beam_meters,
            draft_meters: row.draft_meters,
            flag: row.flag || brokerParticulars.flag,
            dwcc: brokerParticulars.dwcc,
            spd_ballast: spdBallastVal,
            spd_laden: spdLadenVal,
            cons_sea: consSeaVal,
            cons_port: consPortVal,
          });

          return Response.json(
            { success: true, source: "neon_existing", vessel: formatted },
            { status: 200, headers: corsHeaders }
          );
        } else {
          return Response.json(
            {
              success: false,
              error: `No se encontró ningún buque en Neon con el nombre o IMO "${vesselNameHint}".`,
            },
            { status: 404, headers: corsHeaders }
          );
        }
      }

      if (!rawText && !vesselNameHint) {
        return Response.json(
          {
            success: false,
            error: "Debes proporcionar una descripción de buque (rawText) o un nombre/IMO.",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // 1. Deterministic regex parsing
      const deterministic = parseDeterministicParticulars(rawText, vesselNameHint);

      // 2. AI Structured extraction with Gemini (if API key present)
      const { vessel: combinedVessel, source } = await parseWithGemini(rawText, deterministic);

      // 3. Format result
      const formatted = formatVesselObject(combinedVessel || deterministic || {});

      return Response.json(
        {
          success: true,
          source,
          vessel: formatted,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // =========================================================================
    // ACTION: UPSERT (UPDATE first -> conditional INSERT)
    // =========================================================================
    if (action === "upsert") {
      const vessel = body.vessel || {};
      const rawText = String(body.rawText || "").trim();

      const rawImo = String(vessel.imo_number || vessel.imo || "").trim().replace(/\D/g, "");
      if (!/^\d{7}$/.test(rawImo)) {
        return Response.json(
          {
            success: false,
            code: "IMO_REQUIRED",
            error: "Se requiere un IMO válido de 7 dígitos para guardar en la base maestra.",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const vesselName = String(vessel.vessel_name || vessel.vesselName || "").trim();
      const dwtRaw = parseSafeNumber(vessel.dwt);
      if (!vesselName || !dwtRaw || dwtRaw <= 0) {
        return Response.json(
          {
            success: false,
            error: "El buque debe tener un nombre y DWT mayor que 0.",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const imoInt = parseInt(rawImo, 10);
      const dwtInt = Math.round(dwtRaw);

      const vesselType = vessel.vessel_type || vessel.vessel_class || vessel.vesselType || null;
      const yearBuiltRaw = parseSafeNumber(vessel.year_built || vessel.built_year);
      const yearBuiltInt = yearBuiltRaw && yearBuiltRaw > 1900 ? Math.round(yearBuiltRaw) : null;

      const grossTonnage = parseSafeNumber(vessel.gross_tonnage || vessel.gt);
      const netTonnage = parseSafeNumber(vessel.net_tonnage || vessel.nt);
      const loaMeters = parseSafeNumber(vessel.loa_meters || vessel.loa);
      const beamMeters = parseSafeNumber(vessel.beam_meters || vessel.beam);
      const draftMeters = parseSafeNumber(vessel.draft_meters || vessel.draft);

      const rawFlag = vessel.flag ? String(vessel.flag).trim() : null;
      const flagCode = normalizeFlagCode(rawFlag);

      const spdBallast = parseSafeNumber(vessel.spd_ballast);
      const spdLaden = parseSafeNumber(vessel.spd_laden);
      const consSea = parseSafeNumber(vessel.cons_sea);
      const consPort = parseSafeNumber(vessel.cons_port);
      const dwcc = parseSafeNumber(vessel.dwcc);
      const serviceSpeed = spdLaden || spdBallast || null;

      const nowIso = new Date().toISOString();
      const brokerParticulars = {
        updated_at: nowIso,
        origin: "broker_copy_paste",
        raw_excerpt: rawText.slice(0, 2000),
        spd_ballast: spdBallast,
        spd_laden: spdLaden,
        cons_sea: consSea,
        cons_port: consPort,
        dwcc: dwcc,
        flag: rawFlag,
      };

      const payloadJson = {
        broker_particulars: brokerParticulars,
        spd_ballast: spdBallast,
        spd_laden: spdLaden,
        cons_sea: consSea,
        cons_port: consPort,
        port_consumption: consPort,
        fuel_consumption_laden: consSea,
        service_speed_knots: serviceSpeed,
        flag: rawFlag,
      };

      const pool = getPool();

      // Step A: UPDATE first
      const updateResult = await pool.query(
        `
          UPDATE vessels_master
          SET
            vessel_name = CASE
              WHEN $2::text IS NOT NULL AND BTRIM($2::text) <> ''
              THEN BTRIM($2::text)
              ELSE vessels_master.vessel_name
            END,
            vessel_type = CASE
              WHEN $3::text IS NOT NULL AND BTRIM($3::text) <> '' AND UPPER(BTRIM($3::text)) NOT IN ('OTHER', 'UNKNOWN', 'N/A')
              THEN BTRIM($3::text)
              WHEN vessels_master.vessel_type IS NULL OR UPPER(BTRIM(vessels_master.vessel_type)) IN ('OTHER', 'UNKNOWN', 'N/A', '')
              THEN COALESCE(NULLIF(BTRIM($3::text), ''), vessels_master.vessel_type)
              ELSE vessels_master.vessel_type
            END,
            dwt = CASE
              WHEN $4::integer IS NOT NULL AND $4::integer > 0
              THEN $4::integer
              ELSE vessels_master.dwt
            END,
            year_built = CASE
              WHEN $5::integer IS NOT NULL AND $5::integer > 1900
              THEN $5::integer
              ELSE vessels_master.year_built
            END,
            gross_tonnage = CASE
              WHEN $6::numeric IS NOT NULL AND $6::numeric > 0
              THEN $6::numeric
              ELSE vessels_master.gross_tonnage
            END,
            net_tonnage = CASE
              WHEN $7::numeric IS NOT NULL AND $7::numeric > 0
              THEN $7::numeric
              ELSE vessels_master.net_tonnage
            END,
            loa_meters = CASE
              WHEN $8::numeric IS NOT NULL AND $8::numeric > 0
              THEN $8::numeric
              ELSE vessels_master.loa_meters
            END,
            beam_meters = CASE
              WHEN $9::numeric IS NOT NULL AND $9::numeric > 0
              THEN $9::numeric
              ELSE vessels_master.beam_meters
            END,
            draft_meters = CASE
              WHEN $10::numeric IS NOT NULL AND $10::numeric > 0
              THEN ROUND($10::numeric, 2)
              ELSE vessels_master.draft_meters
            END,
            service_speed_knots = CASE
              WHEN $11::numeric IS NOT NULL AND $11::numeric > 0
              THEN $11::numeric
              ELSE vessels_master.service_speed_knots
            END,
            flag = COALESCE($12::varchar(3), vessels_master.flag),
            source_payload = COALESCE(vessels_master.source_payload, '{}'::jsonb) || $13::jsonb,
            updated_at = NOW(),
            fecha_ultima_actualizacion = NOW()
          WHERE imo_number = $1::integer OR imo = $1::integer
          RETURNING *
        `,
        [
          imoInt,
          vesselName,
          vesselType,
          dwtInt,
          yearBuiltInt,
          grossTonnage,
          netTonnage,
          loaMeters,
          beamMeters,
          draftMeters,
          serviceSpeed,
          flagCode,
          JSON.stringify(payloadJson),
        ]
      );

      let savedRow: any = null;
      let isInserted = false;

      if (updateResult.rows && updateResult.rows.length > 0) {
        savedRow = updateResult.rows[0];
        isInserted = false;
      } else {
        // Step B: INSERT only if row does not exist
        const insertResult = await pool.query(
          `
            INSERT INTO vessels_master (
              imo_number,
              imo,
              system_identity,
              vessel_name,
              vessel_type,
              dwt,
              year_built,
              gross_tonnage,
              net_tonnage,
              loa_meters,
              beam_meters,
              draft_meters,
              service_speed_knots,
              flag,
              source_payload,
              origen,
              updated_at,
              fecha_ultima_actualizacion
            ) VALUES (
              $1::integer,
              $1::integer,
              'IMO:' || $1::text,
              $2,
              $3,
              $4::integer,
              $5::integer,
              $6::numeric,
              $7::numeric,
              $8::numeric,
              $9::numeric,
              ROUND($10::numeric, 2),
              $11::numeric,
              $12::varchar(3),
              $13::jsonb,
              'broker_copy_paste',
              NOW(),
              NOW()
            )
            RETURNING *
          `,
          [
            imoInt,
            vesselName,
            vesselType,
            dwtInt,
            yearBuiltInt,
            grossTonnage,
            netTonnage,
            loaMeters,
            beamMeters,
            draftMeters,
            serviceSpeed,
            flagCode,
            JSON.stringify(payloadJson),
          ]
        );
        savedRow = insertResult.rows[0];
        isInserted = true;
      }

      const formatted = formatVesselObject({
        imo_number: savedRow.imo_number,
        vessel_name: savedRow.vessel_name,
        vessel_type: savedRow.vessel_type,
        dwt: savedRow.dwt,
        year_built: savedRow.year_built,
        gross_tonnage: savedRow.gross_tonnage,
        net_tonnage: savedRow.net_tonnage,
        loa_meters: savedRow.loa_meters,
        beam_meters: savedRow.beam_meters,
        draft_meters: savedRow.draft_meters,
        flag: savedRow.flag || rawFlag,
        dwcc: dwcc,
        spd_ballast: spdBallast,
        spd_laden: spdLaden,
        cons_sea: consSea,
        cons_port: consPort,
      });

      return Response.json(
        {
          success: true,
          action: isInserted ? "inserted" : "updated",
          vessel: formatted,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    return Response.json(
      { success: false, error: `Acción desconocida: "${action}". Acciones soportadas: parse, upsert.` },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[vessel-particulars-ingest] Error:", error);
    const detailedError = [
      error?.message,
      error?.detail,
      error?.constraint,
      error?.column,
    ]
      .filter(Boolean)
      .join(" | ") || "Error interno del servidor.";

    return Response.json(
      {
        success: false,
        error: detailedError,
      },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: ["/api/vessel-particulars-ingest", "/.netlify/functions/vessel-particulars-ingest"],
};
