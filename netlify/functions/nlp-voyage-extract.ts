import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import {
  extractNaturalVoyageEntities,
  maritimeDictionaryPrompt,
  normalizeNaturalDate,
  normalizePortReference,
} from "./_shared/nlp-voyage-dictionary.mjs";
import { applyVoyageScenarioDefaults, hasMinimumVoyageRoute } from "../../shared/voyage-scenario-policy.mjs";

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
  dwt: number;
  methodPOL: string;
  methodPOD: string;
  ratePOL: number;
  ratePOD: number;
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

function extractFallback(text: string): VoyageScenario {
  return extractNaturalVoyageEntities(text) as VoyageScenario;
}

function normalizeMethod(value: unknown) {
  const methodSource = value && typeof value === "object"
    ? (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).label
    : value;
  const method = cleanCapture(methodSource);
  const normalized = method.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("big bag") && (normalized.includes("barco") || normalized.includes("ship"))) return "big_bags_barco";
  if (normalized.includes("big bag") && (normalized.includes("portuaria") || normalized.includes("port crane"))) return "big_bags_portuaria";
  return method;
}

function inferBigBagsMethod(cargoType: string) {
  return /big\s*bags?/i.test(cargoType) ? "big_bags_barco" : "";
}

function normalizeScenario(value: Record<string, unknown>, fallback: VoyageScenario): VoyageScenario {
  const cargoQty = parsePositiveNumber(value.cargo_qty ?? value.cargoQty ?? value.quantity ?? value.qty) || fallback.cargo_qty;
  const cargoType = cleanCapture(value.cargo_type ?? value.cargoType ?? value.commodity) || fallback.cargo_type;
  const loadingRate = parsePositiveNumber(value.ratePOL ?? value.loading_rate ?? value.loadingRate ?? value.load_rate) || fallback.loading_rate;
  const dischargeRate = parsePositiveNumber(value.ratePOD ?? value.discharge_rate ?? value.dischargeRate ?? value.disch_rate) || fallback.discharge_rate;
  const dwt = parsePositiveNumber(value.dwt ?? value.required_dwt ?? value.requiredDwt)
    || (cargoQty > 0 ? Math.ceil((cargoQty * 1.1) / 100) * 100 : 0);
  const defaultMethod = inferBigBagsMethod(cargoType);
  const methodPOL = normalizeMethod(value.methodPOL ?? value.loading_method ?? value.loadingMethod) || defaultMethod;
  const methodPOD = normalizeMethod(value.methodPOD ?? value.discharge_method ?? value.dischargeMethod) || defaultMethod;
  return applyVoyageScenarioDefaults({
    pol: normalizePortReference(value.pol ?? value.port_of_loading ?? value.loading_port) || fallback.pol,
    pod: normalizePortReference(value.pod ?? value.port_of_discharge ?? value.discharge_port) || fallback.pod,
    laydays: normalizeNaturalDate(value.laydays ?? value.layday ?? value.laycan_start) || fallback.laydays,
    cancelling: normalizeNaturalDate(value.cancelling ?? value.canceling ?? value.laycan_end) || fallback.cancelling,
    cargo_qty: cargoQty,
    cargo_type: cargoType,
    loading_rate: loadingRate,
    discharge_rate: dischargeRate,
    dwt,
    methodPOL,
    methodPOD,
    ratePOL: loadingRate,
    ratePOD: dischargeRate,
  }) as VoyageScenario;
}

async function extractVoyageScenario(text: string) {
  const fallback = extractFallback(text);
  const openai = new OpenAI();
  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: `Eres un extractor marítimo de SeaCharter Core PRO. Convierte el requerimiento en las trece claves exactas del esquema. Un requerimiento es procesable desde que contiene POL y POD; laycan, mercancía, cantidad y ritmos son opcionales en esta fase. No inventes puertos, mercancías, cantidades ni ritmos. Aplica este diccionario de equivalencias coloquiales: ${maritimeDictionaryPrompt()}. POL y POD deben conservar únicamente el nombre de puerto expresado por el usuario; no los geocodifiques, traduzcas ni completes con ubicaciones externas. Las palabras literales "POL" y "POD" son etiquetas de campo, nunca nombres de puerto: si no aparece un puerto después de ellas, devuelve el campo vacío. La validación oficial se realiza después contra World Port Index. En actualizaciones parciales devuelve vacíos o cero para los campos no mencionados, sin copiar etiquetas ni inventar valores del contexto. cargo_type es la mercancía descrita, incluyendo materiales cotidianos como cemento, grano o clinker. laydays y cancelling deben usar YYYY-MM-DD; interpreta rangos como "entre el día X y el Y" o "desde el [Fecha] hasta el [Fecha]" como inicio y fin del laycan. La fecha actual es ${new Date().toISOString().slice(0, 10)}; si el usuario da día y mes sin año, usa la siguiente ocurrencia futura. Si sólo indica una fecha operativa, úsala como laydays y calcula cancelling cinco días después. Si no indica fechas, deja ambos campos vacíos para que la política operativa aplique una ventana prudencial. cargo_qty, dwt, ratePOL y ratePOD son números positivos. methodPOL y methodPOD contienen el valor del método operativo; para Big Bags con grúas del buque usa big_bags_barco. loading_rate y discharge_rate deben repetir ratePOL y ratePOD por compatibilidad. Si un dato no aparece, devuelve string vacío o 0 según el tipo.`,
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
          required: ["pol", "pod", "laydays", "cancelling", "cargo_qty", "cargo_type", "loading_rate", "discharge_rate", "dwt", "methodPOL", "methodPOD", "ratePOL", "ratePOD"],
          properties: {
            pol: { type: "string" },
            pod: { type: "string" },
            laydays: { type: "string" },
            cancelling: { type: "string" },
            cargo_qty: { type: "number" },
            cargo_type: { type: "string" },
            loading_rate: { type: "number" },
            discharge_rate: { type: "number" },
            dwt: { type: "number" },
            methodPOL: { type: "string" },
            methodPOD: { type: "string" },
            ratePOL: { type: "number" },
            ratePOD: { type: "number" },
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
    return responseJson({
      success: true,
      valid: hasMinimumVoyageRoute(scenario),
      minimum_required: ["pol", "pod"],
      scenario,
      source: "netlify-ai-gateway",
    });
  } catch {
    console.error("NLP voyage extraction failed; using deterministic fallback.");
    const fallback = extractFallback(text);
    const scenario = normalizeScenario({}, fallback);
    return responseJson({
      success: true,
      valid: hasMinimumVoyageRoute(scenario),
      minimum_required: ["pol", "pod"],
      scenario,
      source: "deterministic-fallback",
    });
  }
};

export const config: Config = {
  path: "/api/nlp-voyage-extract",
};
