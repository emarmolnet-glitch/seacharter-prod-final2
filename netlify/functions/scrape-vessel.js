import * as cheerio from "cheerio";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanValue(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "N/A";
}

function normalizeImo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

function normalizeMmsi(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 9 ? digits : "";
}

function normalizeNumber(value) {
  const normalized = String(value || "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeYear(value) {
  const match = String(value || "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function buildVesselSearchUrl(payload) {
  if (payload.url) return new URL(String(payload.url));
  const mmsi = normalizeMmsi(payload.mmsi);
  const name = cleanValue(payload.name || payload.vesselName || payload.nombre);
  const query = mmsi || (name !== "N/A" ? name : "");
  if (!query) throw new Error("IDENTITY_REQUIRED");
  const targetUrl = new URL("https://www.vesselfinder.com/vessels");
  targetUrl.searchParams.set("name", query);
  return targetUrl;
}

function assertAllowedTarget(targetUrl) {
  if (!["http:", "https:"].includes(targetUrl.protocol)) throw new Error("INVALID_PROTOCOL");
  if (!/(^|\.)vesselfinder\.com$/i.test(targetUrl.hostname)) throw new Error("INVALID_HOST");
}

function absoluteVesselFinderUrl(value, baseUrl) {
  if (!value) return "";
  try {
    const targetUrl = new URL(value, baseUrl);
    assertAllowedTarget(targetUrl);
    return targetUrl.toString();
  } catch {
    return "";
  }
}

function cellByHeader(cells, labels, fallbackIndex) {
  const wanted = labels.map((label) => label.toLowerCase());
  const matched = cells.find((cell) => wanted.some((label) => cell.header.includes(label)));
  return cleanValue(matched ? matched.text : cells[fallbackIndex]?.text);
}

function extractHeaders($, table) {
  return table
    .find("tr")
    .first()
    .find("th,td")
    .map((_, cell) => cleanValue($(cell).text()).toLowerCase())
    .get();
}

function extractRowsFromTable($, table, baseUrl) {
  const headers = extractHeaders($, table);
  const records = [];

  table.find("tr").each((_, row) => {
    const rowEl = $(row);
    const cells = rowEl
      .find("td")
      .map((index, cell) => {
        const cellEl = $(cell);
        return {
          text: cleanValue(cellEl.text()),
          html: $.html(cellEl),
          header: cleanValue(
            [
              cellEl.attr("data-title"),
              cellEl.attr("data-label"),
              cellEl.attr("headers"),
              headers[index],
            ]
              .filter(Boolean)
              .join(" "),
          ).toLowerCase(),
        };
      })
      .get();

    if (!cells.length) return;

    const link = rowEl.find("a[href]").first();
    const sourceForImo = [link.attr("href"), rowEl.text(), rowEl.html()].filter(Boolean).join(" ");
    const imo = normalizeImo(sourceForImo);
    if (!imo) return;

    const nombre = cleanValue(link.text() || cells[0]?.text);
    records.push({
      nombre,
      name: nombre,
      imo,
      anio: cellByHeader(cells, ["built", "year", "año", "ano"], 1),
      gt: cellByHeader(cells, ["gross tonnage", "gt"], 2),
      dwt: cellByHeader(cells, ["deadweight", "dwt"], 3),
      dimensiones: cellByHeader(cells, ["loa x beam", "loa", "beam", "dimensions", "dimensiones"], 4),
      tipo: cellByHeader(cells, ["type", "vessel type", "ship type", "class"], 5),
      sourceUrl: absoluteVesselFinderUrl(link.attr("href"), baseUrl),
    });
  });

  return records;
}

function extractVesselRows(html, baseUrl) {
  const $ = cheerio.load(String(html || ""));
  const recordsByImo = new Map();

  $("table").each((_, table) => {
    for (const record of extractRowsFromTable($, $(table), baseUrl)) {
      recordsByImo.set(record.imo, record);
    }
  });

  if (recordsByImo.size === 0) {
    $("tr").each((_, row) => {
      const rowHtml = $.html(row);
      const fallback = extractRowsFromTable($, $("<table>").append(rowHtml), baseUrl);
      for (const record of fallback) {
        recordsByImo.set(record.imo, record);
      }
    });
  }

  return Array.from(recordsByImo.values());
}

function findLabeledValue($, labels) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  let found = "";

  $("tr, dl, li, .vi__r1, .vi__r2, .v3, .v4").each((_, element) => {
    if (found) return false;
    const node = $(element);
    const cells = node.find("th,td,dt,dd");
    if (cells.length >= 2) {
      const label = cleanValue($(cells[0]).text()).toLowerCase();
      if (normalizedLabels.some((candidate) => label.includes(candidate))) {
        found = cleanValue($(cells[cells.length - 1]).text());
        return false;
      }
    }

    const text = cleanValue(node.text());
    const lowerText = text.toLowerCase();
    const matchedLabel = normalizedLabels.find((candidate) => lowerText.startsWith(candidate));
    if (matchedLabel) {
      found = cleanValue(text.slice(matchedLabel.length).replace(/^\s*[:\-]\s*/, ""));
      return false;
    }
    return undefined;
  });

  return found;
}

function extractDetailRecord(html, sourceUrl) {
  const $ = cheerio.load(String(html || ""));
  const bodyText = cleanValue($("body").text());
  const titleName = cleanValue($("h1").first().text() || $("title").text().split("-")[0]);
  const imoValue = findLabeledValue($, ["imo number", "imo"]);
  const mmsiValue = findLabeledValue($, ["mmsi"]);
  const dwtValue = findLabeledValue($, ["deadweight", "dwt"]);
  const flagValue = findLabeledValue($, ["flag"]);
  const yearValue = findLabeledValue($, ["year of build", "built", "build"]);
  const draftValue = findLabeledValue($, ["draught", "draft"]);
  const dimensionsValue = findLabeledValue($, ["length overall x breadth extreme", "length / beam", "dimensions"]);
  const imo = normalizeImo(imoValue || bodyText.match(/\bIMO(?:\s+number)?\s*[:#-]?\s*(\d{7})\b/i)?.[1]);

  return {
    nombre: titleName,
    name: titleName,
    imo,
    mmsi: normalizeMmsi(mmsiValue || bodyText.match(/\bMMSI\s*[:#-]?\s*(\d{9})\b/i)?.[1]),
    dwt: normalizeNumber(dwtValue),
    bandera: flagValue !== "N/A" ? flagValue : "",
    flag: flagValue !== "N/A" ? flagValue : "",
    anio: normalizeYear(yearValue),
    yearBuilt: normalizeYear(yearValue),
    calado: normalizeNumber(draftValue),
    draft: normalizeNumber(draftValue),
    dimensiones: dimensionsValue !== "N/A" ? dimensionsValue : "",
    sourceUrl,
  };
}

function selectBestRecord(records, payload) {
  const expectedImo = normalizeImo(payload.imo);
  const expectedName = cleanValue(payload.name || payload.vesselName || payload.nombre).toLowerCase();
  if (expectedImo) {
    const imoMatch = records.find((record) => normalizeImo(record.imo) === expectedImo);
    if (imoMatch) return imoMatch;
  }
  if (expectedName && expectedName !== "n/a") {
    const nameMatch = records.find((record) => {
      const recordName = cleanValue(record.name || record.nombre).toLowerCase();
      return recordName === expectedName || recordName.includes(expectedName) || expectedName.includes(recordName);
    });
    if (nameMatch) return nameMatch;
  }
  return records[0] || null;
}

async function fetchVesselFinderHtml(targetUrl) {
  const upstream = await fetch(targetUrl.toString(), {
    headers: {
      "User-Agent": "SeaCharterCorePRO/1.0 fleet-intelligence-capture",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
  if (!upstream.ok) throw new Error(`UPSTREAM_${upstream.status}`);
  return upstream.text();
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Metodo no permitido. Usa POST." }, 405);
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "JSON invalido o cuerpo de solicitud no procesable." }, 400);
  }

  let targetUrl;
  try {
    targetUrl = buildVesselSearchUrl(payload);
    assertAllowedTarget(targetUrl);
  } catch (error) {
    const message = error instanceof Error && error.message === "IDENTITY_REQUIRED"
      ? "Se requiere MMSI, nombre o una URL valida de VesselFinder."
      : "Solo se permiten URLs validas de vesselfinder.com.";
    return jsonResponse({ ok: false, error: message }, 400);
  }

  try {
    const html = await fetchVesselFinderHtml(targetUrl);
    const records = extractVesselRows(html, targetUrl);
    const selectedRecord = selectBestRecord(records, payload);
    const detailUrl = selectedRecord?.sourceUrl || targetUrl.toString();
    const detailHtml = detailUrl === targetUrl.toString() ? html : await fetchVesselFinderHtml(new URL(detailUrl));
    const detailRecord = extractDetailRecord(detailHtml, detailUrl);
    const record = {
      ...(selectedRecord || {}),
      ...Object.fromEntries(Object.entries(detailRecord).filter(([, value]) => value !== "" && value !== null && value !== "N/A")),
    };

    if (!record.imo && !record.dwt) {
      return jsonResponse({ ok: false, error: "Data Bridge no encontro datos tecnicos verificables para el buque." }, 404);
    }

    return jsonResponse({
      ok: true,
      count: records.length,
      records,
      record,
      query: {
        mmsi: normalizeMmsi(payload.mmsi),
        name: cleanValue(payload.name || payload.vesselName || payload.nombre),
        latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
        longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
      },
    });
  } catch (error) {
    const upstreamStatus = error instanceof Error ? error.message.match(/^UPSTREAM_(\d+)$/)?.[1] : null;
    const message = upstreamStatus
      ? `VesselFinder devolvio ${upstreamStatus}.`
      : "No se pudo conectar con VesselFinder.";
    return jsonResponse({ ok: false, error: message }, 502);
  }
}

export const config = {
  path: "/api/scrape-vessel",
};
