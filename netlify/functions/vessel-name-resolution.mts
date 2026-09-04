import type { Config } from "@netlify/functions";
import type { QueryResultRow } from "pg";
import { getPool } from "../../db/index.js";

type VesselNameRow = QueryResultRow & {
  imo_number?: string | number | null;
  vessel_name?: string | null;
};

function cleanVesselName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^(?:M\s*\/?\s*V|MV)\s+/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function normalizedVesselName(value: unknown): string {
  return cleanVesselName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function validImo(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{7}$/.test(digits) ? digits : "";
}

export default async (request: Request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  let input: unknown;
  if (request.method === "GET") {
    const url = new URL(request.url);
    input = url.searchParams.get("vessel_name") || url.searchParams.get("q");
  } else {
    const body = await request.json().catch(() => ({}));
    input = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).vessel_name
      : null;
  }

  const vesselName = cleanVesselName(input);
  const normalizedName = normalizedVesselName(vesselName);
  if (normalizedName.length < 2) {
    return Response.json({ success: false, status: "invalid", error: "A vessel name is required" }, { status: 400 });
  }

  try {
    const result = await getPool().query<VesselNameRow>(
      `
        SELECT imo_number, vessel_name
        FROM vessels_master
        WHERE vessel_name ILIKE $1
        ORDER BY fecha_ultima_actualizacion DESC NULLS LAST
        LIMIT 50
      `,
      [`%${vesselName}%`],
    );

    const uniqueMatches = new Map<string, { imo: string; vessel_name: string }>();
    for (const row of result.rows || []) {
      const imo = validImo(row.imo_number);
      const matchedName = cleanVesselName(row.vessel_name);
      if (!imo || normalizedVesselName(matchedName) !== normalizedName) continue;
      uniqueMatches.set(imo, { imo, vessel_name: matchedName });
    }

    const matches = [...uniqueMatches.values()];
    if (matches.length === 1) {
      return Response.json({ success: true, status: "resolved", vessel: matches[0] }, {
        headers: { "cache-control": "no-store" },
      });
    }

    return Response.json({
      success: true,
      status: matches.length > 1 ? "ambiguous" : "not_found",
      vessel: null,
      match_count: matches.length,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[vessel-name-resolution] Database lookup failed.", error instanceof Error ? error.message : String(error));
    return Response.json({ success: false, status: "unavailable", error: "Vessel name resolution unavailable" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
};

export const config: Config = {
  path: "/api/vessel-name-resolution",
  method: ["GET", "POST"],
};
