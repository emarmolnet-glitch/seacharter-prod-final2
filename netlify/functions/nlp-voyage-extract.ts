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

function normalizeDate(value: unknown) {
  const raw = cleanCapture(value);
  const isoMatch = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  const numericMatch = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericMatch) return `${numericMatch[3]}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(2, "0")}`;
  return "";
}

function extractFallback(text: string): VoyageScenario {
  const laycanText = text.match(/(?:laycan|laydays\s*\/\s*cancelling)\s*[:\-]?\s*([^\n;]+)/i)?.[1] || "";
  const laycanDates = Array.from(laycanText.matchAll(
    /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/g,
  )).map((match) => normalizeDate(match[0])).filter(Boolean);

  return {
    pol: captureFirst(text, [
      /(?:^|[\n;,])\s*(?:pol|puerto\s+de\s+carga|load(?:ing)?\s+port)\s*[:\-]\s*([^\n;,]+)/im,
      /(?:from|desde)\s+([^\n;,]+?)\s+(?:to|hasta|a)\s+[^\n;,]+/i,
    ]),
    pod: captureFirst(text, [
      /(?:^|[\n;,])\s*(?:pod|puerto\s+de\s+descarga|discharge\s+port)\s*[:\-]\s*([^\n;,]+)/im,
      /(?:from|desde)\s+[^\n;,]+?\s+(?:to|hasta|a)\s+([^\n;,]+)/i,
    ]),
    laydays: normalizeDate(captureFirst(text, [
      /(?:laydays|laycan\s+(?:start|inicio))\s*[:\-]\s*([^\n;,]+)/i,
    ])) || laycanDates[0] || "",
    cancelling: normalizeDate(captureFirst(text, [
      /(?:cancelling|cancelaci[oó]n|laycan\s+end)\s*[:\-]\s*([^\n;,]+)/i,
    ])) || laycanDates[1] || "",
    cargo_qty: parsePositiveNumber(captureFirst(text, [
      /(?:cargo(?:_qty)?|cantidad(?:\s+de\s+carga)?|quantity|qty)\s*[:\-]?\s*([\d.,\s]+)/i,
      /([\d.,\s]+)\s*(?:mt|tm|tons?|tonnes?)\s+(?:of|de)\s+/i,
    ])),
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
    pol: cleanCapture(value.pol ?? value.port_of_loading ?? value.loading_port ?? fallback.pol),
    pod: cleanCapture(value.pod ?? value.port_of_discharge ?? value.discharge_port ?? fallback.pod),
    laydays: normalizeDate(value.laydays ?? value.layday ?? value.laycan_start ?? fallback.laydays),
    cancelling: normalizeDate(value.cancelling ?? value.canceling ?? value.laycan_end ?? fallback.cancelling),
    cargo_qty: parsePositiveNumber(value.cargo_qty ?? value.cargoQty ?? value.quantity ?? value.qty ?? fallback.cargo_qty),
    loading_rate: parsePositiveNumber(value.loading_rate ?? value.loadingRate ?? value.load_rate ?? fallback.loading_rate),
    discharge_rate: parsePositiveNumber(value.discharge_rate ?? value.dischargeRate ?? value.disch_rate ?? fallback.discharge_rate),
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
        content: "Eres un extractor marítimo de SeaCharter Core PRO. Convierte el requerimiento en las siete claves exactas del esquema. No inventes datos. POL y POD son nombres de puertos. laydays y cancelling deben usar YYYY-MM-DD. cargo_qty, loading_rate y discharge_rate son números positivos en toneladas métricas o toneladas métricas por día. Si un dato no aparece, devuelve string vacío o 0 según el tipo.",
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
          required: ["pol", "pod", "laydays", "cancelling", "cargo_qty", "loading_rate", "discharge_rate"],
          properties: {
            pol: { type: "string" },
            pod: { type: "string" },
            laydays: { type: "string" },
            cancelling: { type: "string" },
            cargo_qty: { type: "number" },
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
