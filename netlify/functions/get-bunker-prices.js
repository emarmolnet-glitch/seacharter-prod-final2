import * as cheerio from "cheerio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SOURCE_URL = "https://www.bunkerindex.com/";
const WORLD_INDEX_URL = "https://www.bunkerindex.com/indices/world.php";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}

function parsePrice(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;
  return Number((validValues.reduce((sum, value) => sum + value, 0) / validValues.length).toFixed(2));
}

function validatePrices(prices) {
  const vlsfo = Number(prices.vlsfo);
  const ifo380 = Number(prices.ifo380);
  const mgo = Number(prices.mgo);

  if (!Number.isFinite(vlsfo) || !Number.isFinite(ifo380) || !Number.isFinite(mgo)) {
    return null;
  }

  return { vlsfo, ifo380, mgo };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "SeaCharterCorePRO/1.0 bunker price proxy",
    },
  });

  if (!response.ok) {
    throw new Error(`Bunkerindex responded with status ${response.status}.`);
  }

  return response.text();
}

function scrapeHomePriceTable(html) {
  const $ = cheerio.load(html);
  const table = $("#price-table").first();
  if (!table.length) return null;

  const headers = table
    .find("thead th")
    .map((_, element) => $(element).text().trim().toLowerCase())
    .get();

  const ifoIndex = headers.findIndex((header) => header.includes("ifo 380"));
  const vlsfoIndex = headers.findIndex((header) => header.includes("vlsfo"));
  const mgoIndex = headers.findIndex((header) => header === "mgo" || header.includes("mgo"));

  if (ifoIndex < 0 || vlsfoIndex < 0 || mgoIndex < 0) return null;

  const rows = table.find("tbody tr").toArray();
  const ifo380Values = [];
  const vlsfoValues = [];
  const mgoValues = [];

  for (const row of rows) {
    const cells = $(row).find("td").toArray();
    const ifo380 = parsePrice($(cells[ifoIndex]).text());
    const vlsfo = parsePrice($(cells[vlsfoIndex]).text());
    const mgo = parsePrice($(cells[mgoIndex]).text());

    if (Number.isFinite(ifo380)) ifo380Values.push(ifo380);
    if (Number.isFinite(vlsfo)) vlsfoValues.push(vlsfo);
    if (Number.isFinite(mgo)) mgoValues.push(mgo);
  }

  return validatePrices({
    ifo380: average(ifo380Values),
    vlsfo: average(vlsfoValues),
    mgo: average(mgoValues),
  });
}

function latestPriceFromTab($, tabId) {
  const tabText = $(`#${tabId}`).text();
  const matches = [...tabText.matchAll(/"price"\s*:\s*"([^"]+)"/g)];
  const latestMatch = matches.at(-1);
  return latestMatch ? parsePrice(latestMatch[1]) : null;
}

function scrapeWorldIndices(html) {
  const $ = cheerio.load(html);

  return validatePrices({
    ifo380: latestPriceFromTab($, "TabA"),
    vlsfo: latestPriceFromTab($, "TabB"),
    mgo: latestPriceFromTab($, "TabC"),
  });
}

async function scrapeBunkerPrices() {
  const homeHtml = await fetchHtml(SOURCE_URL);
  const homePrices = scrapeHomePriceTable(homeHtml);
  if (homePrices) return homePrices;

  const indexHtml = await fetchHtml(WORLD_INDEX_URL);
  const worldPrices = scrapeWorldIndices(indexHtml);
  if (worldPrices) return worldPrices;

  throw new Error("No valid Global Average bunker prices were found for VLSFO, IFO 380 and MGO.");
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
    return jsonResponse(prices);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bunker scraping error.";
    return jsonResponse({ error: `Bunker price scraping failed: ${message}` }, 500);
  }
};

export const config = {
  path: "/api/get-bunker-prices",
};
