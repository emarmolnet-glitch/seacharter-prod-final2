import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import {
  extractNaturalVoyageEntities,
  maritimeDictionaryPrompt,
  normalizeNaturalDate,
} from "./_shared/nlp-voyage-dictionary.mjs";
import { validateWpiVoyagePorts } from "./_shared/wpi-port-resolver.mjs";

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
  pol_port?: WpiPortRecord;
  pod_port?: WpiPortRecord;
};

type WpiPortRecord = {
  indexNo: number | null;
  regionNo: number | null;
  name: string;
  officialLabel: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  source: "WPI";
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

function normalizeScenario(value: Record<string, unknown>, fallback: VoyageScenario): VoyageScenario {
  return {
    pol: cleanCapture(value.pol ?? value.port_of_loading ?? value.loading_port) || fallback.pol,
    pod: cleanCapture(value.pod ?? value.port_of_discharge ?? value.discharge_port) || fallback.pod,
    laydays: normalizeNaturalDate(value.laydays ?? value.layday ?? value.laycan_start) || fallback.laydays,
    cancelling: normalizeNaturalDate(value.cancelling ?? value.canceling ?? value.laycan_end) || fallback.cancelling,
    cargo_qty: parsePositiveNumber(value.cargo_qty ?? value.cargoQty ?? value.quantity ?? value.qty) || fallback.cargo_qty,
    cargo_type: cleanCapture(value.cargo_type ?? value.cargoType ?? value.commodity) || fallback.cargo_type,
    loading_rate: parsePositiveNumber(value.loading_rate ?? value.loadingRate ?? value.load_rate) || fallback.loading_rate,
    discharge_rate: parsePositiveNumber(value.discharge_rate ?? value.dischargeRate ?? value.disch_rate) || fallback.discharge_rate,
  };
}

async function validateScenarioPorts(scenario: VoyageScenario) {
  const portValidation = await validateWpiVoyagePorts(scenario.pol, scenario.pod);
  const polPort = portValidation.pol.match as WpiPortRecord | undefined;
  const podPort = portValidation.pod.match as WpiPortRecord | undefined;
  return {
    scenario: {
      ...scenario,
      pol: polPort?.officialLabel || scenario.pol,
      pod: podPort?.officialLabel || scenario.pod,
      ...(polPort ? { pol_port: polPort } : {}),
      ...(podPort ? { pod_port: podPort } : {}),
    },
    port_validation: portValidation,
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
        content: `Eres un extractor marítimo de SeaCharter Core PRO. Convierte el requerimiento en las ocho claves exactas del esquema. No inventes puertos, mercancías, cantidades ni ritmos. Aplica este diccionario de equivalencias coloquiales: ${maritimeDictionaryPrompt()}. POL y POD deben conservar únicamente el nombre de puerto expresado por el usuario; no los geocodifiques, traduzcas ni completes con ubicaciones externas. La validación oficial se realiza después contra World Port Index. cargo_type es la mercancía descrita, incluyendo materiales cotidianos como cemento, grano o clinker. laydays y cancelling deben usar YYYY-MM-DD; interpreta rangos como "entre el día X y el Y" o "desde el [Fecha] hasta el [Fecha]" como inicio y fin del laycan. La fecha actual es ${new Date().toISOString().slice(0, 10)}; si el usuario da día y mes sin año, usa la siguiente ocurrencia futura. Si sólo indica una fecha operativa, úsala como laydays y cancelling para representar un laycan de un día. cargo_qty, loading_rate y discharge_rate son números positivos en toneladas métricas o toneladas métricas por día. Si un dato no aparece, devuelve string vacío o 0 según el tipo.`,
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
    const validated = await validateScenarioPorts(await extractVoyageScenario(text));
    return responseJson({ success: true, ...validated, source: "netlify-ai-gateway+wpi" });
  } catch {
    console.error("NLP voyage extraction failed; using deterministic fallback.");
    try {
      const validated = await validateScenarioPorts(extractFallback(text));
      return responseJson({ success: true, ...validated, source: "deterministic-fallback+wpi" });
    } catch {
      console.error("WPI port validation failed.");
      return responseJson({
        success: false,
        error: "No se pudo validar POL y POD contra el catalogo WPI.",
      }, 503);
    }
  }
};

export const config: Config = {
  path: "/api/nlp-voyage-extract",
};
