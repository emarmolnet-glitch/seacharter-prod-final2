import { load } from "cheerio";

const REQUIRED_FUELS = Object.freeze(["ifo380", "vlsfo", "mgo"]);

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalFuel(value) {
  const key = normalizeKey(value);
  if (key.includes("VLSFO")) return "vlsfo";
  if (key === "MGO" || key.includes("MARINEGASOIL")) return "mgo";
  if (key.includes("IFO380") || key.includes("HSFO380") || key === "HSFO") return "ifo380";
  return "";
}

export function parseBunkerPrice(value) {
  if (!value) return null;
  const match = normalizeText(value).replace(/,/g, "").match(/(?:US\$|USD|\$)?\s*(\d{2,5}(?:\.\d+)?)/i);
  return match ? Number.parseFloat(match[1]) : null;
}

function findHeaderRow($, table) {
  return table.find("tr").filter((_, row) => {
    const fuels = $(row).children("th,td").map((__, cell) => canonicalFuel($(cell).text())).get().filter(Boolean);
    return REQUIRED_FUELS.every((fuel) => fuels.includes(fuel));
  }).first();
}

function findNamedRow($, table, rowName) {
  const expected = normalizeKey(rowName);
  return table.find("tr").filter((_, row) => {
    const cells = $(row).children("th,td");
    if (!cells.length) return false;
    const firstCellText = normalizeKey(cells.first().text());
    if (firstCellText === expected) return true;
    return cells.first().find("a,strong,b,span").toArray().some((element) => normalizeKey($(element).text()) === expected);
  }).first();
}

function parsePriceCell($, cell) {
  const withoutIndicators = cell.clone();
  withoutIndicators.find("img,svg,[class*='change'],[class*='trend'],[class*='arrow']").remove();
  return parseBunkerPrice(withoutIndicators.text()) ?? parseBunkerPrice(cell.text());
}

function extractDirectPrices($, headerRow, dataRow) {
  const headerCells = headerRow.children("th,td");
  const dataCells = dataRow.children("th,td");
  const prices = {};

  headerCells.each((index, cell) => {
    const fuel = canonicalFuel($(cell).text());
    if (!fuel || index >= dataCells.length) return;
    prices[fuel] = parsePriceCell($, dataCells.eq(index));
  });

  return prices;
}

function extractNestedPrices($, headerRow, dataRow) {
  const fuelOrder = headerRow.children("th,td").map((_, cell) => canonicalFuel($(cell).text())).get().filter(Boolean);
  const nestedCells = dataRow.children("th,td").slice(1).find("table tr").first().children("th,td");
  if (!nestedCells.length) return {};

  return Object.fromEntries(fuelOrder.map((fuel, index) => [fuel, parsePriceCell($, nestedCells.eq(index))]));
}

function hasValidPrices(prices) {
  return REQUIRED_FUELS.every((fuel) => Number.isFinite(prices[fuel]) && prices[fuel] > 0);
}

function extractPricesFromTable($, table, rowName) {
  const headerRow = findHeaderRow($, table);
  const dataRow = findNamedRow($, table, rowName);
  if (!headerRow.length || !dataRow.length) return null;

  const directPrices = extractDirectPrices($, headerRow, dataRow);
  if (hasValidPrices(directPrices)) return directPrices;

  const nestedPrices = extractNestedPrices($, headerRow, dataRow);
  return hasValidPrices(nestedPrices) ? nestedPrices : null;
}

function findSectionTables($, headingPattern) {
  const heading = $("h1,h2,h3,h4,h5,h6,[role='heading'],strong,b").filter((_, element) => {
    return headingPattern.test(normalizeText($(element).text()));
  }).first();
  if (!heading.length) return { heading, tables: $() };

  let cursor = heading;
  let tables = $();
  for (let depth = 0; depth < 6 && cursor.length; depth += 1) {
    tables = tables.add(cursor.find("table"));
    cursor = cursor.parent();
  }
  return { heading, tables };
}

export function extractBixWorldPrices(html) {
  const $ = load(html);
  const { heading, tables } = findSectionTables($, /\bBIX\s+Indices\b/i);
  if (!heading.length) throw new Error("No se encontró la sección BIX Indices.");

  for (const table of tables.add($("table")).toArray()) {
    const prices = extractPricesFromTable($, $(table), "World");
    if (prices) return prices;
  }
  throw new Error("No se encontró una fila World válida dentro de BIX Indices.");
}

export function extractShipAndBunkerGlobalPrices(html) {
  const $ = load(html);
  const { heading, tables } = findSectionTables($, /\bGlobal Average Bunker Prices\b/i);
  if (!heading.length) throw new Error("No se encontró la tabla Global Average Bunker Prices.");

  for (const table of tables.add($("table")).toArray()) {
    const prices = extractPricesFromTable($, $(table), "Global Average Bunker Price");
    if (prices) return prices;
  }
  throw new Error("No se encontró la fila Global Average Bunker Price con valores válidos.");
}
