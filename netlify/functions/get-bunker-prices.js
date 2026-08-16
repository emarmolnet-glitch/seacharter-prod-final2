import { extractBixWorldPrices, extractShipAndBunkerGlobalPrices } from "./_shared/bunker-price-parser.mjs";

const BUNKER_INDEX_URL = "https://www.bunkerindex.com/";
const SHIP_AND_BUNKER_URL = "https://shipandbunker.com/prices/av";
const SCRAPER_TIMEOUT_MS = 25_000;
const DIRECT_TIMEOUT_MS = 12_000;
const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const CACHE_SECONDS = 60 * 60;

function jsonResponse(body, status = 200, cacheable = false) {
  return {
    statusCode: status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400` : "no-store, max-age=0",
      ...(cacheable ? { "Netlify-CDN-Cache-Control": `public, durable, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400` } : {}),
    },
    body: JSON.stringify(body),
  };
}

function createScrapingError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function extractHtmlFromScraperPayload(payload) {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const html = extractHtmlFromScraperPayload(item);
      if (html) return html;
    }
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  for (const key of ["html", "content", "body", "data", "result", "results"]) {
    const html = extractHtmlFromScraperPayload(payload[key]);
    if (html) return html;
  }
  return null;
}

async function readHtmlResponse(response, provider) {
  const body = await response.text();
  if (!response.ok) {
    throw createScrapingError("UPSTREAM_HTTP_ERROR", `${provider} devolvió HTTP ${response.status}.`, {
      provider,
      upstreamStatus: response.status,
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html") || /^\s*<!?html/i.test(body)) return body;

  try {
    const html = extractHtmlFromScraperPayload(JSON.parse(body));
    if (html && /^\s*</.test(html)) return html;
  } catch {
    // The explicit invalid-payload error below contains no upstream response body.
  }

  throw createScrapingError("INVALID_SCRAPER_PAYLOAD", `${provider} no devolvió HTML utilizable.`, { provider });
}

function buildConfiguredScraperRequest(targetUrl) {
  const configuredUrl = process.env.SCRAPER_API_URL;
  const token = process.env.SCRAPER_API_TOKEN;
  if (!configuredUrl || !token) return null;

  let endpoint;
  try {
    endpoint = new URL(configuredUrl);
  } catch {
    throw createScrapingError("SCRAPER_CONFIG_ERROR", "SCRAPER_API_URL no es una URL válida.", { provider: "scraper-api" });
  }

  const hostname = endpoint.hostname.toLowerCase();
  if (hostname.includes("scraperapi.com")) {
    endpoint.searchParams.set("api_key", token);
    endpoint.searchParams.set("url", targetUrl);
    endpoint.searchParams.set("render", "false");
    return { endpoint, init: { headers: { Accept: "text/html" } }, provider: "scraper-api" };
  }
  if (hostname.includes("scrapingbee.com")) {
    endpoint.searchParams.set("api_key", token);
    endpoint.searchParams.set("url", targetUrl);
    endpoint.searchParams.set("render_js", "false");
    return { endpoint, init: { headers: { Accept: "text/html" } }, provider: "scrapingbee" };
  }

  return {
    endpoint,
    provider: "configured-scraper",
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/html;q=0.9",
        Authorization: `Bearer ${token}`,
        "X-API-Key": token,
      },
      body: JSON.stringify({
        url: targetUrl,
        headers: browserHeaders,
        waitForSelector: "body",
      }),
    },
  };
}

async function fetchThroughConfiguredScraper(targetUrl, sourceName) {
  const request = buildConfiguredScraperRequest(targetUrl);
  if (!request) {
    throw createScrapingError("SCRAPER_NOT_CONFIGURED", "No hay un bypass de scraping configurado.", {
      provider: "configured-scraper",
    });
  }

  let response;
  try {
    response = await fetch(request.endpoint, {
      ...request.init,
      signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw createScrapingError(
      timedOut ? "SCRAPER_TIMEOUT" : "SCRAPER_NETWORK_ERROR",
      timedOut ? `${request.provider} agotó el tiempo de espera.` : `No se pudo conectar con ${request.provider}.`,
      { provider: request.provider },
    );
  }

  return readHtmlResponse(response, `${sourceName} vía ${request.provider}`);
}

async function fetchDirectly(targetUrl, sourceName) {
  let response;
  try {
    response = await fetch(targetUrl, {
      headers: browserHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw createScrapingError(
      timedOut ? "DIRECT_TIMEOUT" : "DIRECT_NETWORK_ERROR",
      timedOut ? `${sourceName} agotó el tiempo de espera.` : `No se pudo conectar directamente con ${sourceName}.`,
      { provider: `${sourceName}-direct` },
    );
  }

  return readHtmlResponse(response, `${sourceName} directo`);
}

function summarizeAttempt(error) {
  return {
    provider: error?.provider || "unknown",
    code: error?.code || "UNKNOWN_ERROR",
    ...(Number.isInteger(error?.upstreamStatus) ? { status: error.upstreamStatus } : {}),
    message: error instanceof Error ? error.message : "Error desconocido.",
  };
}

async function scrapeBunkerPrices() {
  const attempts = [];
  const scraperConfigured = Boolean(process.env.SCRAPER_API_URL && process.env.SCRAPER_API_TOKEN);
  const sources = [
    {
      name: "Bunker Index",
      url: BUNKER_INDEX_URL,
      parser: extractBixWorldPrices,
      transports: scraperConfigured ? ["scraper", "direct"] : ["direct"],
    },
    {
      name: "Ship & Bunker",
      url: SHIP_AND_BUNKER_URL,
      parser: extractShipAndBunkerGlobalPrices,
      transports: scraperConfigured ? ["direct", "scraper"] : ["direct"],
    },
  ];

  for (const source of sources) {
    for (const transport of source.transports) {
      try {
        const html = transport === "scraper"
          ? await fetchThroughConfiguredScraper(source.url, source.name)
          : await fetchDirectly(source.url, source.name);
        const prices = source.parser(html);
        const relevantAttempts = attempts.filter((attempt) => attempt.code !== "SCRAPER_NOT_CONFIGURED");
        if (relevantAttempts.length > 0) {
          console.warn(`[get-bunker-prices] ${source.name} respondió tras fallar intentos anteriores.`, relevantAttempts);
        }
        return { ...prices, source: source.name, transport, attempts };
      } catch (error) {
        attempts.push(summarizeAttempt(Object.assign(error instanceof Error ? error : new Error("Error desconocido."), {
          provider: error?.provider || `${source.name}-${transport}`,
        })));
      }
    }
  }

  throw createScrapingError("ALL_SOURCES_FAILED", "No se pudieron extraer precios de Bunker Index ni Ship & Bunker.", { attempts });
}

export const handler = async (event, context) => {
  const method = String(event?.httpMethod || event?.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (method !== "GET") {
    return jsonResponse({ error: "Method not allowed. Use GET." }, 405);
  }

  try {
    const prices = await scrapeBunkerPrices();
    const fetchedAt = new Date().toISOString();
    return jsonResponse({
      ok: true,
      ifo380: prices.ifo380,
      vlsfo: prices.vlsfo,
      mgo: prices.mgo,
      index: "World",
      source: prices.source,
      transport: prices.transport,
      sourceDate: fetchedAt.slice(0, 10),
      fetchedAt,
    }, 200, true);
  } catch (error) {
    const diagnostic = {
      code: error?.code || "UNKNOWN_SCRAPING_ERROR",
      message: error instanceof Error ? error.message : "Error desconocido durante la extracción.",
      attempts: Array.isArray(error?.attempts) ? error.attempts : [summarizeAttempt(error)],
    };
    console.error("[get-bunker-prices] Error extrayendo Bunkers.", diagnostic);
    const timedOut = diagnostic.attempts.some((attempt) => String(attempt.code).includes("TIMEOUT"));
    return jsonResponse({
      ok: false,
      error: "Error extrayendo Bunkers",
      code: diagnostic.code,
      details: diagnostic.message,
      attempts: diagnostic.attempts,
    }, timedOut ? 504 : 502);
  }
};
