function cleanValue(value) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || "N/A";
}

function normalizeImo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

function extractCells(rowHtml) {
  return Array.from(rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)).map((match) => ({
    html: match[0],
    text: cleanValue(match[1]),
    header: cleanValue(
      [
        match[0].match(/\bdata-title=["']([^"']+)["']/i)?.[1],
        match[0].match(/\bdata-label=["']([^"']+)["']/i)?.[1],
        match[0].match(/\bheaders=["']([^"']+)["']/i)?.[1],
      ].filter(Boolean).join(" "),
    ).toLowerCase(),
  }));
}

function cellByLabel(cells, labels, fallbackIndex) {
  const wanted = labels.map((label) => label.toLowerCase());
  const matched = cells.find((cell) => wanted.some((label) => cell.header.includes(label)));
  return cleanValue(matched ? matched.text : cells[fallbackIndex]?.text);
}

function extractVesselRows(html) {
  const rows = Array.from(String(html || "").matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)).map((match) => match[0]);
  return rows.map((row) => {
    const cells = extractCells(row);
    if (!cells.length) return null;

    const linkMatch = row.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const sourceForImo = [linkMatch?.[1], row].filter(Boolean).join(" ");
    const imo = normalizeImo(sourceForImo);
    if (!imo) return null;

    const nombre = cleanValue(linkMatch ? linkMatch[2] : cells[0]?.text);
    return {
      imo,
      nombre,
      tipo: cellByLabel(cells, ["type", "vessel type", "ship type", "class"], 5),
      anio: cellByLabel(cells, ["built", "year"], 1),
      gt: cellByLabel(cells, ["gross tonnage", "gt"], 2),
      dwt: cellByLabel(cells, ["deadweight", "dwt"], 3),
      dimensiones: cellByLabel(cells, ["loa x beam", "loa", "beam", "dimensions"], 4),
    };
  }).filter(Boolean);
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let payload = {};
  try {
    payload = await req.json();
  } catch (_) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(String(payload.url || ""));
  } catch (_) {
    return Response.json({ error: "A valid VesselFinder URL is required" }, { status: 400 });
  }

  const allowedHost = /(^|\.)vesselfinder\.com$/i.test(targetUrl.hostname);
  if (!allowedHost) {
    return Response.json({ error: "Only vesselfinder.com URLs are allowed" }, { status: 400 });
  }

  const upstream = await fetch(targetUrl.toString(), {
    headers: {
      "user-agent": "SeaCharterCorePRO/1.0 fleet intelligence sync",
      "accept": "text/html,application/xhtml+xml",
    },
  });

  if (!upstream.ok) {
    return Response.json({ error: `VesselFinder returned ${upstream.status}` }, { status: 502 });
  }

  const html = await upstream.text();
  const records = extractVesselRows(html);
  return Response.json({ records, count: records.length });
}

export const config = {
  path: "/api/scrape-vessel",
};
