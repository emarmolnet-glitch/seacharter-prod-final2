import type { Config } from "@netlify/functions";
import {
  fetchLiveAisBoundingBox,
  isAisMacroCompatibleVessel,
  isVesselInsideBounds,
  mapAisMacroCategoryToTypes,
} from "./_shared/live-ais-provider.mjs";

type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

function finiteParam(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseBounds(url: URL): Bounds | null {
  const bbox = String(url.searchParams.get("bbox") || "").split(",").map(Number);
  const values = bbox.length === 4 && bbox.every(Number.isFinite)
    ? { minLon: bbox[0], minLat: bbox[1], maxLon: bbox[2], maxLat: bbox[3] }
    : {
        minLat: finiteParam(url.searchParams.get("minLat")),
        maxLat: finiteParam(url.searchParams.get("maxLat")),
        minLon: finiteParam(url.searchParams.get("minLon")),
        maxLon: finiteParam(url.searchParams.get("maxLon")),
      };
  if (Object.values(values).some(value => value === null)) return null;
  const bounds = values as Bounds;
  if (bounds.minLat < -90 || bounds.maxLat > 90 || bounds.minLon < -180 || bounds.maxLon > 180) return null;
  if (bounds.minLat >= bounds.maxLat || bounds.minLon >= bounds.maxLon) return null;
  return bounds;
}

export default async (req: Request) => {
  if (req.method !== "GET") {
    return Response.json({ success: false, error: "Method not allowed", vessels: [] }, { status: 405 });
  }
  const url = new URL(req.url);
  const bounds = parseBounds(url);
  if (!bounds) {
    return Response.json({
      success: false,
      error: "A valid bounding box is required",
      message: "Use bbox=minLon,minLat,maxLon,maxLat or the four explicit coordinate parameters.",
      vessels: [],
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const aisCategory = String(url.searchParams.get("aisCategory") || "CARGO").trim().toUpperCase();
  const aisTypes = mapAisMacroCategoryToTypes(aisCategory);
  const limit = Math.min(5000, Math.max(1, Math.trunc(Number(url.searchParams.get("limit")) || 1000)));
  try {
    const live = await fetchLiveAisBoundingBox({ bounds, limit, aisTypes });
    const vessels = live.vessels
      .filter(vessel => isVesselInsideBounds(vessel, bounds))
      .filter(vessel => isAisMacroCompatibleVessel(vessel, aisCategory))
      .slice(0, limit);
    return Response.json({
      success: true,
      provider: live.provider,
      ais_category: aisCategory,
      ais_types: aisTypes,
      bbox: bounds,
      count: vessels.length,
      recent_vessels: vessels.length,
      fetched_at: new Date().toISOString(),
      vessels,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "LIVE_AIS_UNAVAILABLE";
    return Response.json({
      success: false,
      error: code,
      message: "No se pudo consultar el proveedor AIS configurado.",
      vessels: [],
      count: 0,
      recent_vessels: 0,
    }, { status: code === "LIVE_AIS_UNAVAILABLE" ? 503 : 502, headers: { "cache-control": "no-store" } });
  }
};

export const config: Config = {
  path: "/api/fleet/live-ais",
  method: "GET",
};
