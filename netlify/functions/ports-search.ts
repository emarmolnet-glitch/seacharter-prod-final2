import type { Config } from "@netlify/functions";
import { findDatalasticPorts, DatalasticPortError } from "./_shared/datalastic-port-client.js";
import { createResponseCacheHeaders, getOrSetCachedJson } from "./_shared/response-cache.js";

export default async function portsSearchHandler(request: Request) {
  if (request.method !== "GET") return Response.json({ error: "Método no permitido." }, { status: 405 });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) return Response.json({ ports: [] });

  try {
    const cached = await getOrSetCachedJson({
      namespace: "datalastic-port-finder-v1",
      key: query.toLowerCase(),
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      staleTtlMs: 30 * 24 * 60 * 60 * 1000,
      producer: () => findDatalasticPorts(query),
    });
    return Response.json({ ports: cached.value }, {
      headers: createResponseCacheHeaders(cached, 86_400, 604_800),
    });
  } catch (error) {
    console.error("[ports-search] Datalastic lookup failed.", error instanceof Error ? error.message : String(error));
    const status = error instanceof DatalasticPortError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible buscar puertos." }, { status });
  }
}

export const config: Config = {
  path: "/api/v1/ports/search",
};
