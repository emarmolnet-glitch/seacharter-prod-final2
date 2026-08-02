import * as cheerio from "cheerio";

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text && !/^(?:unknown|n\/?a|not available|-+)$/i.test(text) ? text : null;
}

function cleanNumber(value) {
  const match = String(value ?? "").match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0].replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanNumbers(value) {
  return Array.from(String(value ?? "").matchAll(/\d+(?:[.,]\d+)?/g), (match) => cleanNumber(match[0]))
    .filter((number) => number !== null);
}

function normalizeLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedIdentityText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function readLabeledValue($, labels) {
  const normalizedLabels = new Set(labels.map(normalizeLabel));
  let result = null;

  $("table.tpt1 tr, .ship-section tr, [class*='detail'] tr, [class*='spec'] tr").each((_, row) => {
    const cells = $(row).children("th, td");
    if (cells.length < 2) return undefined;
    const label = normalizeLabel($(cells[0]).text());
    if (!normalizedLabels.has(label)) return undefined;
    result = cleanText($(cells[cells.length - 1]).text());
    return false;
  });

  return result;
}

function readVoyageValue($, label, selector) {
  const normalizedLabel = normalizeLabel(label);
  const labelNode = $(".vilabel").filter((_, element) => normalizeLabel($(element).text()) === normalizedLabel).first();
  if (!labelNode.length) return null;
  return cleanText(labelNode.closest(".flx").find(selector).first().text());
}

function findSearchResultRow($, identity) {
  const expectedValues = [identity?.imo, identity?.mmsi, identity?.vesselName]
    .map(normalizedIdentityText)
    .filter(Boolean);
  const rows = $("a.ship-link[href*='/vessels/details/']").closest("tr").toArray();
  return rows.find((row) => {
    if (!expectedValues.length) return true;
    const rowText = normalizedIdentityText(`${$(row).text()} ${$.html(row)}`);
    return expectedValues.some((value) => rowText.includes(value));
  }) || rows[0] || null;
}

function readSearchDimensions($, row) {
  if (!row) return { loa_meters: null, beam_meters: null };
  const table = $(row).closest("table");
  const headers = table.find("tr").first().find("th, td").toArray();
  const cells = $(row).children("td").toArray();
  const sizeIndex = headers.findIndex((header) => /^(?:size|length|loa)\b/.test(normalizeLabel($(header).text())));
  const dimensions = sizeIndex >= 0 && cells[sizeIndex] ? cleanNumbers($(cells[sizeIndex]).text()) : [];
  return {
    loa_meters: dimensions[0] || null,
    beam_meters: dimensions[1] || null,
  };
}

export function extractVesselFinderFields(html, identity = {}) {
  const $ = cheerio.load(html);
  const searchRow = findSearchResultRow($, identity);
  const searchDimensions = readSearchDimensions($, searchRow);
  const aisDimensions = cleanNumbers(readLabeledValue($, ["Length / Beam"]));
  const detailFlag = readLabeledValue($, ["Flag", "AIS Flag"]);
  const detailType = readLabeledValue($, ["Ship Type", "Vessel Type"]);
  const detailLength = readLabeledValue($, ["Length Overall", "LOA"]);
  const detailBeam = readLabeledValue($, ["Beam", "Breadth"]);
  const detailNetTonnage = readLabeledValue($, ["Net Tonnage", "NT"]);
  const detailCallSign = readLabeledValue($, ["Callsign", "Call Sign"]);
  const lastPort = readVoyageValue($, "Last Port", "a._npNa, a[href*='/ports/'], ._value");
  const eta = readVoyageValue($, "Destination", "._mcol12ext")
    || readLabeledValue($, ["ETA", "Predicted ETA"]);

  return {
    flag: detailFlag
      || cleanText($(searchRow).find(".flag-icon[title], .flag-icon-med[title], img.flag_icon[title]").first().attr("title"))
      || cleanText($(".title-flag-icon[title], .flag-icon[title]").first().attr("title")),
    vessel_type: detailType
      || cleanText($(searchRow).find(".slty, .ship-type, [data-ship-type], [data-vessel-type]").first().text()),
    loa_meters: cleanNumber(detailLength) || aisDimensions[0] || searchDimensions.loa_meters,
    beam_meters: cleanNumber(detailBeam) || aisDimensions[1] || searchDimensions.beam_meters,
    net_tonnage: cleanNumber(detailNetTonnage),
    call_sign: cleanText(detailCallSign),
    last_port: cleanText(lastPort),
    eta: cleanText(eta)?.replace(/^ETA\s*:\s*/i, "") || null,
  };
}

export function extractVesselFinderDetailUrl(html, identity = {}) {
  const $ = cheerio.load(html);
  const searchRow = findSearchResultRow($, identity);
  return cleanText(
    $(searchRow).find("a.ship-link[href*='/vessels/details/']").first().attr("href")
    || $("link[rel='canonical'][href*='/vessels/details/']").first().attr("href"),
  );
}
