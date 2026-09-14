import type { Config } from "@netlify/functions";
import { resolvePortsWithFailover, DatalasticPortError } from "./_shared/datalastic-port-client.js";
import { createResponseCacheHeaders, getOrSetCachedJson } from "./_shared/response-cache.js";

export default async function portsSearchHandler(request: Request) {
  if (request.method !== "GET") return Response.json({ error: "Método no permitido." }, { status: 405 });
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("search") || "").trim();
  if (query.length < 2) return Response.json({ ports: [], results: [] });

  try {
    const cached = await getOrSetCachedJson({
      namespace: "datalastic-port-finder-v1",
      key: query.toLowerCase(),
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      staleTtlMs: 30 * 24 * 60 * 60 * 1000,
      producer: () => resolvePortsWithFailover(query),
    });
    return Response.json({
      ports: cached.value,
      results: cached.value,
    }, {
      headers: createResponseCacheHeaders(cached, 86_400, 604_800),
    });
  } catch (error) {
    console.error("[ports-search] Geographic and port lookup failed.", error instanceof Error ? error.message : String(error));
    const status = error instanceof DatalasticPortError ? error.status : 502;
    return Response.json({
      error: error instanceof Error ? error.message : "No fue posible resolver la ubicación geográfica o puerto.",
      ports: [],
      results: [],
    }, { status });
  }
}

export const config: Config = {
  path: [
    "/api/v1/ports/search",
    "/api/v1/geocode",
    "/api/geocode",
    "/api/v1/geo/resolve",
  ],
};
