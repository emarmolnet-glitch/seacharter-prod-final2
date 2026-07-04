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

function extractRowsFromTable($, table) {
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
    });
  });

  return records;
}

function extractVesselRows(html) {
  const $ = cheerio.load(String(html || ""));
  const recordsByImo = new Map();

  $("table").each((_, table) => {
    for (const record of extractRowsFromTable($, $(table))) {
      recordsByImo.set(record.imo, record);
    }
  });

  if (recordsByImo.size === 0) {
    $("tr").each((_, row) => {
      const rowHtml = $.html(row);
      const fallback = extractRowsFromTable($, $("<table>").append(rowHtml));
      for (const record of fallback) {
        recordsByImo.set(record.imo, record);
      }
    });
  }

  return Array.from(recordsByImo.values());
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
    targetUrl = new URL(String(payload.url || ""));
  } catch {
    return jsonResponse({ ok: false, error: "Se requiere una URL valida de VesselFinder." }, 400);
  }

  if (!/(^|\.)vesselfinder\.com$/i.test(targetUrl.hostname)) {
    return jsonResponse({ ok: false, error: "Solo se permiten URLs de vesselfinder.com." }, 400);
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "SeaCharterCorePRO/1.0 fleet-intelligence-capture",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!upstream.ok) {
      return jsonResponse({ ok: false, error: `VesselFinder devolvio ${upstream.status}.` }, 502);
    }

    const html = await upstream.text();
    const records = extractVesselRows(html);

    return jsonResponse({
      ok: true,
      count: records.length,
      records,
    });
  } catch {
    return jsonResponse({ ok: false, error: "No se pudo conectar con VesselFinder." }, 502);
  }
}

export const config = {
  path: "/api/scrape-vessel",
};
