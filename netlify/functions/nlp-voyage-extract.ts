import type { Config } from "@netlify/functions";
import OpenAI from "openai";

type VoyageExtractionRequest = {
  text?: string;
};

type VoyageScenario = {
  pol: string;
  pod: string;
  laydays: string;
  cancelling: string;
  cargo_qty: number;
  cargo_type: string;
  loading_rate: number;
  discharge_rate: number;
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function parsePositiveNumber(value: unknown) {
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

function cleanCapture(value: unknown) {
  return String(value ?? "")
    .replace(/^[\s:;,-]+|[\s:;,.\-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function captureFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanCapture(match[1]);
  }
  return "";
}

const SPANISH_MONTHS: Record<string, number> = {
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
};

function toIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDate(value: unknown, referenceDate = new Date()) {
  const raw = cleanCapture(value);
  const isoMatch = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const numericMatch = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericMatch) return toIsoDate(Number(numericMatch[3]), Number(numericMatch[2]), Number(numericMatch[1]));

  const naturalMatch = raw.toLocaleLowerCase("es-ES").match(
    /\b(\d{1,2})(?:\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(20\d{2}))?\b/i,
  );
  if (naturalMatch) {
    const day = Number(naturalMatch[1]);
    const month = SPANISH_MONTHS[naturalMatch[2].toLocaleLowerCase("es-ES")];
    let year = Number(naturalMatch[3]) || referenceDate.getUTCFullYear();
    let normalized = toIsoDate(year, month, day);
    const today = toIsoDate(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, referenceDate.getUTCDate());
    if (!naturalMatch[3] && normalized && normalized < today) normalized = toIsoDate(++year, month, day);
    return normalized;
  }
  return "";
}

function extractFallback(text: string): VoyageScenario {
  const laycanText = text.match(/(?:laycan|laydays\s*\/\s*cancelling)\s*[:\-]?\s*([^\n;]+)/i)?.[1] || "";
  const laycanDates = Array.from(laycanText.matchAll(
    /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/g,
  )).map((match) => normalizeDate(match[0])).filter(Boolean);

  const explicitDate = normalizeDate(captureFirst(text, [
    /(?:para|el|fecha|laycan)\s+(?:el\s+)?(\d{1,2}(?:\s+de)?\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+20\d{2})?)/i,
  ]));
  const laydays = normalizeDate(captureFirst(text, [
    /(?:laydays|laycan\s+(?:start|inicio))\s*[:\-]?\s*([^\n;,]+)/i,
  ])) || laycanDates[0] || explicitDate;
  const cancelling = normalizeDate(captureFirst(text, [
    /(?:cancelling|cancelaci[oó]n|laycan\s+end|laycan\s+fin)\s*[:\-]?\s*([^\n;,]+)/i,
  ])) || laycanDates[1] || (explicitDate ? laydays : "");

  return {
    pol: captureFirst(text, [
      /(?:^|[\n;,])\s*(?:pol|puerto\s+de\s+carga|load(?:ing)?\s+port)\s*[:\-]\s*([^\n;,]+)/im,
      /(?:from|desde)\s+([^\n;,]+?)\s+(?:to|hasta|a)\s+/i,
    ]),
    pod: captureFirst(text, [
      /(?:^|[\n;,])\s*(?:pod|puerto\s+de\s+descarga|discharge\s+port)\s*[:\-]\s*([^\n;,]+)/im,
      /(?:from|desde)\s+[^\n;,]+?\s+(?:to|hasta|a)\s+([^\n;,]+?)(?=\s+(?:para|con|laycan|cargando|descargando)\b|[;,]|$)/i,
    ]),
    laydays,
    cancelling,
    cargo_qty: parsePositiveNumber(captureFirst(text, [
      /(?:cargo(?:_qty)?|cantidad(?:\s+de\s+carga)?|quantity|qty)\s*[:\-]?\s*([\d.,\s]+)/i,
      /([\d.,\s]+)\s*(?:mt|tm|tons?|tonnes?|toneladas?)\s+(?:of|de)\s+/i,
    ])),
    cargo_type: captureFirst(text, [
      /[\d.,\s]+\s*(?:mt|tm|tons?|tonnes?|toneladas?)\s+(?:of|de)\s+(.+?)(?=\s+(?:from|desde)\b|[;,]|$)/i,
      /(?:carga|mercanc[ií]a|producto|cargo\s+type)\s*[:\-]\s*([^\n;,]+)/i,
    ]),
    loading_rate: parsePositiveNumber(captureFirst(text, [
      /(?:loading(?:\s+rate)?|load\s+rate|ritmo\s+(?:de\s+)?carga|loading_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
    discharge_rate: parsePositiveNumber(captureFirst(text, [
      /(?:discharg(?:e|ing)(?:\s+rate)?|ritmo\s+(?:de\s+)?descarga|discharge_rate)\s*[:\-]?\s*([\d.,\s]+)/i,
    ])),
  };
}

function normalizeScenario(value: Record<string, unknown>, fallback: VoyageScenario): VoyageScenario {
  return {
    pol: cleanCapture(value.pol ?? value.port_of_loading ?? value.loading_port) || fallback.pol,
    pod: cleanCapture(value.pod ?? value.port_of_discharge ?? value.discharge_port) || fallback.pod,
    laydays: normalizeDate(value.laydays ?? value.layday ?? value.laycan_start) || fallback.laydays,
    cancelling: normalizeDate(value.cancelling ?? value.canceling ?? value.laycan_end) || fallback.cancelling,
    cargo_qty: parsePositiveNumber(value.cargo_qty ?? value.cargoQty ?? value.quantity ?? value.qty) || fallback.cargo_qty,
    cargo_type: cleanCapture(value.cargo_type ?? value.cargoType ?? value.commodity) || fallback.cargo_type,
    loading_rate: parsePositiveNumber(value.loading_rate ?? value.loadingRate ?? value.load_rate) || fallback.loading_rate,
    discharge_rate: parsePositiveNumber(value.discharge_rate ?? value.dischargeRate ?? value.disch_rate) || fallback.discharge_rate,
  };
}

async function extractVoyageScenario(text: string) {
  const fallback = extractFallback(text);
  const openai = new OpenAI();
  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: `Eres un extractor marítimo de SeaCharter Core PRO. Convierte el requerimiento en las ocho claves exactas del esquema. No inventes puertos, mercancías, cantidades ni ritmos. POL y POD son nombres de puertos. cargo_type es la mercancía descrita. laydays y cancelling deben usar YYYY-MM-DD. La fecha actual es ${new Date().toISOString().slice(0, 10)}; si el usuario da día y mes sin año, usa la siguiente ocurrencia futura. Si sólo indica una fecha operativa, úsala como laydays y cancelling para representar un laycan de un día. cargo_qty, loading_rate y discharge_rate son números positivos en toneladas métricas o toneladas métricas por día. Si un dato no aparece, devuelve string vacío o 0 según el tipo.`,
      },
      { role: "user", content: text },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "voyage_scenario",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["pol", "pod", "laydays", "cancelling", "cargo_qty", "cargo_type", "loading_rate", "discharge_rate"],
          properties: {
            pol: { type: "string" },
            pod: { type: "string" },
            laydays: { type: "string" },
            cancelling: { type: "string" },
            cargo_qty: { type: "number" },
            cargo_type: { type: "string" },
            loading_rate: { type: "number" },
            discharge_rate: { type: "number" },
          },
        },
      },
    },
  });

  return normalizeScenario(JSON.parse(response.output_text || "{}"), fallback);
}

export default async (req: Request) => {
  if (req.method !== "POST") return responseJson({ error: "Metodo no permitido. Use POST." }, 405);

  let body: VoyageExtractionRequest;
  try {
    body = await req.json();
  } catch {
    return responseJson({ error: "JSON de entrada invalido." }, 400);
  }

  const text = String(body.text || "").trim();
  if (!text) return responseJson({ error: "El requerimiento esta vacio." }, 400);

  try {
    const scenario = await extractVoyageScenario(text);
    return responseJson({ success: true, scenario, source: "netlify-ai-gateway" });
  } catch {
    console.error("NLP voyage extraction failed; using deterministic fallback.");
    return responseJson({ success: true, scenario: extractFallback(text), source: "deterministic-fallback" });
  }
};

export const config: Config = {
  path: "/api/nlp-voyage-extract",
};
