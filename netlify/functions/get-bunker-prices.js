import * as cheerio from "cheerio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body, status = 200, cacheable = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? "public, max-age=3600, stale-while-revalidate=86400" : "no-store, max-age=0",
      ...(cacheable ? { "Netlify-CDN-Cache-Control": "public, durable, max-age=3600, stale-while-revalidate=86400" } : {}),
    },
  });
}

function parsePrice(str) {
  if (!str) return null;
  const match = String(str).trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

async function scrapeBunkerPrices() {
  const response = await fetch("https://www.bunkerindex.com/", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Bunkerindex HTTP error: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  let result = null;

  $("table").each((_, table) => {
    const text = $(table).text();
    if (text.includes("IFO 380") || text.includes("Index")) {
      $(table).find("tr").each((_, tr) => {
        const cells = $(tr).find("td").map((_, c) => $(c).text().trim()).get();
        if (cells.length >= 4) {
          const firstCell = cells[0].toLowerCase();
          if ((firstCell.includes("world") || firstCell.includes("mundo")) && !firstCell.includes("world 3")) {
            const parsedCells = cells.slice(1).map(parsePrice).filter((n) => n !== null);
            if (parsedCells.length >= 3) {
              const values = parsedCells.slice(-3);
              if (Number.isFinite(values[0]) && Number.isFinite(values[1]) && Number.isFinite(values[2])) {
                result = { ifo380: values[0], vlsfo: values[1], mgo: values[2] };
              }
            }
          }
        }
      });
    }
  });

  if (!result) {
    throw new Error("Target row 'Mundo' / 'World' in BIX Indices table was not found or incomplete.");
  }

  return result;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed. Use GET." }, 405);
  }

  try {
    const prices = await scrapeBunkerPrices();
    return jsonResponse(prices, 200, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scraping error.";
    return jsonResponse({ error: `Scraping failed: ${message}` }, 500);
  }
};

export const config = {
  path: "/api/get-bunker-prices",
};
