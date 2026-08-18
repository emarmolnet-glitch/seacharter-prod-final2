export const MARITIME_ENTITY_DICTIONARY = Object.freeze({
  pol: Object.freeze([
    "POL",
    "puerto de carga",
    "puerto de embarque",
    "origen",
    "salida",
    "desde",
    "cargamos en",
    "puerto de salida",
    "loading port",
    "load port",
  ]),
  pod: Object.freeze([
    "POD",
    "puerto de descarga",
    "puerto de destino",
    "destino",
    "llegada",
    "hacia",
    "descargamos en",
    "puerto de llegada",
    "discharge port",
  ]),
  laycan: Object.freeze([
    "laycan",
    "laydays",
    "cancelling",
    "cancelación",
    "el barco tiene que estar el",
    "fecha límite",
    "plazo",
    "entre el día X y el Y",
    "desde el [Fecha] hasta el [Fecha]",
  ]),
  cargoQuantity: Object.freeze(["toneladas", "tonelada", "tm", "mt", "tons", "tonnes"]),
  cargoType: Object.freeze(["carga", "mercancía", "material", "cemento", "grano", "clinker", "clínker"]),
});

const MONTHS = Object.freeze({
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
});

const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const DATE_TOKEN_PATTERN = `(?:20\\d{2}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]20\\d{2}|\\d{1,2}(?:\\s+de)?\\s+(?:${MONTH_PATTERN})(?:\\s+de\\s+20\\d{2})?)`;
const ROUTE_STOP_PATTERN = "(?=\\s+(?:con|para|laycan|laydays|cancelling|cancelación|fecha límite|plazo|carga|mercancía|material|cargando|descargando|de\\s+[\\d.,]+\\s*(?:tm|mt|toneladas?))\\b|[,;\\n]|$)";

function cleanCapture(value) {
  return String(value ?? "")
    .replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, "")
    .replace(/^(?:el|la|los|las)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function captureFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanCapture(match[1]);
  }
  return "";
}

function parsePositiveNumber(value) {
  const compact = String(value ?? "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return 0;
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;
  if (hasComma && hasDot) {
    const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (/^\d+[,.]\d{3}$/.test(compact)) {
    normalized = compact.replace(/[,.]/g, "");
  } else {
    normalized = compact.replace(",", ".");
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function toIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeNaturalDate(value, referenceDate = new Date()) {
  const raw = cleanCapture(value);
  const isoMatch = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const numericMatch = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericMatch) return toIsoDate(Number(numericMatch[3]), Number(numericMatch[2]), Number(numericMatch[1]));

  const naturalMatch = raw.toLocaleLowerCase("es-ES").match(
    new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+(${MONTH_PATTERN})(?:\\s+de\\s+(20\\d{2}))?\\b`, "i"),
  );
  if (!naturalMatch) return "";

  const day = Number(naturalMatch[1]);
  const month = MONTHS[naturalMatch[2].toLocaleLowerCase("es-ES")];
  let year = Number(naturalMatch[3]) || referenceDate.getUTCFullYear();
  let normalized = toIsoDate(year, month, day);
  const today = toIsoDate(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, referenceDate.getUTCDate());
  if (!naturalMatch[3] && normalized && normalized < today) normalized = toIsoDate(++year, month, day);
  return normalized;
}

function extractRoute(text) {
  const pairedPatterns = [
    new RegExp(`(?:cargamos|embarcamos)\\s+en\\s+(.+?)\\s+(?:y\\s+|,\\s*)?(?:descargamos|desembarcamos)\\s+en\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
    new RegExp(`(?:origen|salida|puerto\\s+de\\s+(?:carga|embarque|salida)|load(?:ing)?\\s+port|pol)\\s*(?:es|en|:|-)?\\s+(.+?)\\s*(?:,|;|\\n|\\s)+(?:destino|llegada|puerto\\s+de\\s+(?:descarga|destino|llegada)|discharge\\s+port|pod)\\s*(?:es|en|:|-)?\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
    new RegExp(`(?:origen|salida|puerto\\s+de\\s+(?:carga|embarque|salida)|load(?:ing)?\\s+port|pol)\\s*(?:es|en|:|-)?\\s+(?:desde\\s+)?(.+?)\\s+(?:hacia|hasta|to|a)\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
    new RegExp(`(?:desde|from)\\s+(.+?)\\s+(?:hacia|hasta|to|a)\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
  ];

  for (const pattern of pairedPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const pol = cleanCapture(match[1]);
    const pod = cleanCapture(match[2]);
    if (normalizeNaturalDate(pol) || normalizeNaturalDate(pod)) continue;
    return { pol, pod };
  }

  const pol = captureFirst(text, [
    /(?:^|[\n;,])\s*(?:pol|puerto\s+de\s+(?:carga|embarque|salida)|load(?:ing)?\s+port|origen|salida)\s*(?:es|en|:|-)?\s+([^\n;,]+)/im,
    new RegExp(`(?:cargamos|embarcamos)\\s+en\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
  ]);
  const pod = captureFirst(text, [
    /(?:^|[\n;,])\s*(?:pod|puerto\s+de\s+(?:descarga|destino|llegada)|discharge\s+port|destino|llegada)\s*(?:es|en|:|-)?\s+([^\n;,]+)/im,
    new RegExp(`(?:descargamos|desembarcamos)\\s+en\\s+(.+?)${ROUTE_STOP_PATTERN}`, "i"),
  ]);
  return { pol, pod };
}

function resolveSharedNaturalRange(match, referenceDate) {
  const startDay = match?.[1];
  const startMonth = match?.[2];
  const startYear = match?.[3];
  const endDay = match?.[4];
  const endMonth = match?.[5];
  const endYear = match?.[6];
  if (!startDay || !endDay || (!startMonth && !endMonth)) return null;
  const sharedMonth = startMonth || endMonth;
  const sharedYear = startYear || endYear || "";
  return {
    laydays: normalizeNaturalDate(`${startDay} de ${startMonth || sharedMonth}${startYear ? ` de ${startYear}` : sharedYear ? ` de ${sharedYear}` : ""}`, referenceDate),
    cancelling: normalizeNaturalDate(`${endDay} de ${endMonth || sharedMonth}${endYear ? ` de ${endYear}` : sharedYear ? ` de ${sharedYear}` : ""}`, referenceDate),
  };
}

function extractLaycan(text, referenceDate) {
  const sharedRange = text.match(new RegExp(
    `(?:entre|del|desde)\\s+(?:el\\s+)?(?:d[ií]a\\s+)?(\\d{1,2})(?:\\s+de\\s+(${MONTH_PATTERN})(?:\\s+de\\s+(20\\d{2}))?)?\\s+(?:y|al|hasta)\\s+(?:el\\s+)?(?:d[ií]a\\s+)?(\\d{1,2})(?:\\s+de\\s+(${MONTH_PATTERN})(?:\\s+de\\s+(20\\d{2}))?)?`,
    "i",
  ));
  const resolvedSharedRange = resolveSharedNaturalRange(sharedRange, referenceDate);
  if (resolvedSharedRange?.laydays && resolvedSharedRange?.cancelling) return resolvedSharedRange;

  const explicitRange = text.match(new RegExp(
    `(?:laycan|laydays\\s*\\/\\s*cancelling|plazo|entre|desde)\\s*(?:es|:|-|del|el)?\\s*(${DATE_TOKEN_PATTERN})\\s*(?:y|al|a|hasta|-|\\/)\\s*(?:el\\s+)?(${DATE_TOKEN_PATTERN})`,
    "i",
  ));
  if (explicitRange) {
    return {
      laydays: normalizeNaturalDate(explicitRange[1], referenceDate),
      cancelling: normalizeNaturalDate(explicitRange[2], referenceDate),
    };
  }

  const laydays = normalizeNaturalDate(captureFirst(text, [
    new RegExp(`(?:laydays|laycan\\s+(?:start|inicio))\\s*[:\\-]?\\s*(${DATE_TOKEN_PATTERN})`, "i"),
  ]), referenceDate);
  const cancelling = normalizeNaturalDate(captureFirst(text, [
    new RegExp(`(?:cancelling|cancelaci[oó]n|fecha\\s+l[ií]mite|laycan\\s+(?:end|fin))\\s*[:\\-]?\\s*(?:el\\s+)?(${DATE_TOKEN_PATTERN})`, "i"),
  ]), referenceDate);
  if (laydays || cancelling) return { laydays: laydays || cancelling, cancelling: cancelling || laydays };

  const singleDate = normalizeNaturalDate(captureFirst(text, [
    new RegExp(`(?:el\\s+barco\\s+tiene\\s+que\\s+estar|barco\\s+debe\\s+estar|para|fecha|laycan|plazo)\\s+(?:el\\s+)?(${DATE_TOKEN_PATTERN})`, "i"),
  ]), referenceDate);
  return { laydays: singleDate, cancelling: singleDate };
}

function extractCargo(text) {
  const cargo_qty = parsePositiveNumber(captureFirst(text, [
    /(?:cargo(?:_qty)?|cantidad(?:\s+de\s+carga)?|quantity|qty)\s*[:\-]?\s*([\d.,\s]+)/i,
    /([\d.,\s]+)\s*(?:mt|tm|tons?|tonnes?|toneladas?)(?:\s+m[eé]tricas?)?\b/i,
  ]));

  let cargo_type = captureFirst(text, [
    /[\d.,\s]+\s*(?:mt|tm|tons?|tonnes?|toneladas?)(?:\s+m[eé]tricas?)?\s+(?:de\s+|del\s+|of\s+)?(.+?)(?=\s+(?:desde|origen|salida|hacia|destino|llegada|para|con|laycan|laydays|cancelling|fecha\s+l[ií]mite|plazo|cargando|descargando)\b|[;,\n]|$)/i,
    /(?:carga|mercanc[ií]a|material|producto|cargo\s+type)\s*(?:es|de|:|-)?\s+(?![\d])([^\n;,]+?)(?=\s+(?:desde|origen|salida|hacia|destino|llegada|para|con|laycan|laydays|cancelling|fecha\s+l[ií]mite|plazo)\b|[;,\n]|$)/i,
  ]);
  if (!cargo_type) {
    cargo_type = captureFirst(text, [
      /\b(cemento(?:\s+(?:a\s+granel|en\s+polvo))?|granos?|cl[ií]nker|trigo|ma[ií]z|soja|fertilizantes?|carb[oó]n|mineral\s+de\s+hierro)\b/i,
    ]);
  }
  return { cargo_qty, cargo_type };
}

export function extractNaturalVoyageEntities(text, referenceDate = new Date()) {
  const source = String(text ?? "");
  const route = extractRoute(source);
  const laycan = extractLaycan(source, referenceDate);
  const cargo = extractCargo(source);
  return {
    pol: route.pol,
    pod: route.pod,
    laydays: laycan.laydays,
    cancelling: laycan.cancelling,
    cargo_qty: cargo.cargo_qty,
    cargo_type: cargo.cargo_type,
    loading_rate: parsePositiveNumber(captureFirst(source, [
      /(?:loading(?:\s+rate)?|load\s+rate|ritmo\s+(?:de\s+)?carga|loading_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
    discharge_rate: parsePositiveNumber(captureFirst(source, [
      /(?:discharg(?:e|ing)(?:\s+rate)?|ritmo\s+(?:de\s+)?descarga|discharge_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
  };
}

export function maritimeDictionaryPrompt() {
  return Object.entries(MARITIME_ENTITY_DICTIONARY)
    .map(([field, terms]) => `${field}: ${terms.join(", ")}`)
    .join("; ");
}
