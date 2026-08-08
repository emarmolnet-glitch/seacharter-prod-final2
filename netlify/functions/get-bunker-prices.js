import { load } from "cheerio";

const BUNKER_INDEX_URL = "https://www.bunkerindex.com/";
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

function jsonResponse(body, status = 200, cacheable = false) {
  return {
    statusCode: status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? "public, max-age=3600, stale-while-revalidate=86400" : "no-store, max-age=0",
      ...(cacheable ? { "Netlify-CDN-Cache-Control": "public, durable, max-age=3600, stale-while-revalidate=86400" } : {}),
    },
    body: JSON.stringify(body),
  };
}

function parsePrice(str) {
  if (!str) return null;
  const match = String(str).replace(/,/g, "").trim().match(/(?:US\$|\$)?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number.parseFloat(match[1]) : null;
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

function buildConfiguredScraperRequest() {
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
    endpoint.searchParams.set("url", BUNKER_INDEX_URL);
    endpoint.searchParams.set("render", "false");
    return { endpoint, init: { headers: { Accept: "text/html" } }, provider: "scraper-api" };
  }
  if (hostname.includes("scrapingbee.com")) {
    endpoint.searchParams.set("api_key", token);
    endpoint.searchParams.set("url", BUNKER_INDEX_URL);
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
        url: BUNKER_INDEX_URL,
        headers: browserHeaders,
        waitForSelector: ".tablePrices1-div > table.tablePrices1",
      }),
    },
  };
}

async function fetchThroughConfiguredScraper() {
  const request = buildConfiguredScraperRequest();
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

  return readHtmlResponse(response, request.provider);
}

async function fetchDirectly() {
  let response;
  try {
    response = await fetch(BUNKER_INDEX_URL, {
      headers: browserHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw createScrapingError(
      timedOut ? "DIRECT_TIMEOUT" : "DIRECT_NETWORK_ERROR",
      timedOut ? "BunkerIndex agotó el tiempo de espera." : "No se pudo conectar directamente con BunkerIndex.",
      { provider: "direct" },
    );
  }

  return readHtmlResponse(response, "BunkerIndex directo");
}

function extractBixWorldPrices(html) {
  const $ = load(html);
  const heading = $("h1,h2,h3,h4,h5,h6").filter((_, element) => {
    return $(element).text().replace(/\s+/g, " ").trim().startsWith("BIX Indices");
  }).first();
  const bixTable = heading.closest(".well").children(".tablePrices1-div").children("table.tablePrices1").first();

  if (!heading.length || !bixTable.length) {
    throw createScrapingError("BIX_TABLE_NOT_FOUND", "No se encontró la tabla lateral BIX Indices.", {
      provider: "bunkerindex-dom",
    });
  }

  const headerNames = bixTable.children("tbody").children("tr").first().children("td,th").map((_, cell) => {
    return $(cell).text().replace(/\s+/g, " ").trim().toUpperCase();
  }).get();
  const expectedHeaders = ["IFO 380", "VLSFO", "MGO"];
  if (!expectedHeaders.every((header) => headerNames.includes(header))) {
    throw createScrapingError("BIX_HEADERS_CHANGED", "Las columnas IFO 380, VLSFO y MGO no coinciden con BIX Indices.", {
      provider: "bunkerindex-dom",
    });
  }

  const worldRow = bixTable.children("tbody").children("tr").filter((_, row) => {
    const indexCell = $(row).children("td").first();
    const worldLink = indexCell.find('a[href$="indices/world.php"]').first();
    return worldLink.text().replace(/\s+/g, " ").trim().toLowerCase() === "world";
  }).first();
  const priceCells = worldRow.children("td").eq(1).find("table").first().find("tr").first().children("td");

  if (!worldRow.length || priceCells.length !== expectedHeaders.length) {
    throw createScrapingError("BIX_WORLD_ROW_NOT_FOUND", "No se encontró la fila World completa en BIX Indices.", {
      provider: "bunkerindex-dom",
    });
  }

  const pricesByHeader = Object.fromEntries(expectedHeaders.map((header) => {
    const priceCellIndex = headerNames.indexOf(header) - 1;
    const cleanCell = priceCells.eq(priceCellIndex).clone();
    cleanCell.find("span,img").remove();
    return [header, parsePrice(cleanCell.text())];
  }));
  const prices = {
    ifo380: pricesByHeader["IFO 380"],
    vlsfo: pricesByHeader.VLSFO,
    mgo: pricesByHeader.MGO,
  };

  if (!Object.values(prices).every((price) => Number.isFinite(price) && price > 0)) {
    throw createScrapingError("BIX_PRICE_PARSE_ERROR", "La fila World no contiene tres precios válidos.", {
      provider: "bunkerindex-dom",
    });
  }

  return prices;
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
  const sources = [
    { name: "scraper-api", fetchHtml: fetchThroughConfiguredScraper },
    { name: "direct", fetchHtml: fetchDirectly },
  ];

  for (const source of sources) {
    try {
      const html = await source.fetchHtml();
      const prices = extractBixWorldPrices(html);
      const relevantAttempts = attempts.filter((attempt) => attempt.code !== "SCRAPER_NOT_CONFIGURED");
      if (relevantAttempts.length > 0) {
        console.warn("[get-bunker-prices] Se usó una fuente alternativa tras fallar el bypass.", relevantAttempts);
      }
      return { ...prices, source: source.name, attempts };
    } catch (error) {
      attempts.push(summarizeAttempt(error));
    }
  }

  throw createScrapingError("ALL_SOURCES_FAILED", "No se pudo extraer el índice World de BunkerIndex.", { attempts });
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
