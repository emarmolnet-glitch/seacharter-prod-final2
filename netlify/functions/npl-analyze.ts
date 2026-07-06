import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import OpenAI from "openai";

type NplRequest = {
  text?: string;
  sourceFileName?: string;
  sourceFileType?: string;
  sourceFileBase64?: string;
  sourceFileDataUrl?: string;
  costoOperativoEstimado?: number;
  mercadoPromedio?: number;
};

type CriticalData = {
  flete: number | null;
  fleteUnidad: string | null;
  laycan: string | null;
  cantidadCarga: number | null;
  cantidadUnidad: string | null;
  puertoCarga: string | null;
  puertoDescarga: string | null;
  condicionesDemurrage: string | null;
};

const SYSTEM_PROMPT = `Eres un analista de mercado marítimo independiente. Recibirás texto extraído de documentos (PDF, capturas de pantalla, Excels). Tu trabajo es puramente analítico y deliberativo:

Extracción de Datos Críticos: Identifica: (a) Flete (Freight Rate), (b) Laycan, (c) Cantidad de carga, (d) Puerto carga/descarga, (e) Condiciones de Demurrage.

Simulación de Escenarios:

Posición Armador: Analiza si el flete cubre costos operativos (OPEX + VOYAGE) según los promedios del mercado.

Posición Fletador: Analiza si el costo de transporte es competitivo para el margen de beneficio de la mercancía.

Veredicto Final: Indica si la oferta es: [Muy Rentable / Rentable / Arriesgada / No Recomendable].

Salida Obligatoria: Debes responder ÚNICAMENTE en formato JSON plano para permitir la automatización de la interfaz.`;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function parseNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const compact = raw.replace(/\s/g, "");
  const normalized = compact.includes(",") && compact.includes(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(",", ".");
  const numeric = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function readDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return { contentType: "", base64: dataUrl };
  return {
    contentType: match[1] || "",
    base64: match[2] ? match[3] : Buffer.from(decodeURIComponent(match[3]), "utf8").toString("base64"),
  };
}

function decodeTextFile(base64: string) {
  try {
    return Buffer.from(base64, "base64").toString("utf8").replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function extractPlainText(input: NplRequest) {
  if (input.text?.trim()) return input.text.trim();

  const dataUrl = input.sourceFileDataUrl ? readDataUrl(input.sourceFileDataUrl) : null;
  const contentType = input.sourceFileType || dataUrl?.contentType || "";
  const base64 = input.sourceFileBase64 || dataUrl?.base64 || "";
  const fileName = input.sourceFileName || "documento";
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
  const isTextLike = contentType.startsWith("text/") || ["txt", "csv", "md"].includes(extension || "");

  if (base64 && isTextLike) {
    const text = decodeTextFile(base64);
    if (text) return text;
  }

  if (base64) {
    return [
      `[Fuente recibida por Blob: ${fileName}]`,
      `Tipo: ${contentType || "desconocido"}.`,
      "No se pudo extraer texto plano en backend para este formato. Envie texto extraido por OCR/PDF/Excel desde el cliente para inferencia completa.",
    ].join("\n");
  }

  return "";
}

function extractFallback(text: string): CriticalData {
  const freight = text.match(/(?:flete|freight|rate)\s*[:\-]?\s*(?:usd|\$)?\s*([\d.,]+)\s*(?:usd)?\s*\/?\s*(mt|tm|ton|tons|t|day|día|dia)?/i);
  const qty = text.match(/(?:cantidad|quantity|cargo|qty)\s*[:\-]?\s*([\d.,]+)\s*(mt|tm|tons|toneladas|t)?/i) || text.match(/([\d.,]+)\s*(mt|tm|tons|toneladas)\b/i);
  const route = text.match(/(?:from|desde)\s+([^,\n;]+?)\s+(?:to|a|hasta)\s+([^,\n;]+)/i) || text.match(/(?:pol\s*\/\s*pod|load\s*\/\s*disch)\s*[:\-]\s*([^\/\n;]+)\s*\/\s*([^\n;]+)/i);
  const laycan = text.match(/(?:laycan|fechas|dates)\s*[:\-]?\s*([^\n;]+)/i);
  const demurrage = text.match(/(?:demurrage|demoras?)\s*[:\-]?\s*([^\n;]+)/i);

  return {
    flete: parseNumber(freight?.[1]),
    fleteUnidad: freight?.[2]?.toUpperCase() || null,
    laycan: laycan?.[1]?.trim() || null,
    cantidadCarga: parseNumber(qty?.[1]),
    cantidadUnidad: qty?.[2]?.toUpperCase() || null,
    puertoCarga: route?.[1]?.trim() || null,
    puertoDescarga: route?.[2]?.trim() || null,
    condicionesDemurrage: demurrage?.[1]?.trim() || null,
  };
}

function normalizeCriticalData(value: any, fallback: CriticalData): CriticalData {
  const data = value?.datosCriticos || value?.criticalData || value || {};
  return {
    flete: parseNumber(data.flete ?? data.freightRate) ?? fallback.flete,
    fleteUnidad: data.fleteUnidad || data.freightUnit || fallback.fleteUnidad,
    laycan: data.laycan || fallback.laycan,
    cantidadCarga: parseNumber(data.cantidadCarga ?? data.cargoQuantity) ?? fallback.cantidadCarga,
    cantidadUnidad: data.cantidadUnidad || data.quantityUnit || fallback.cantidadUnidad,
    puertoCarga: data.puertoCarga || data.loadPort || fallback.puertoCarga,
    puertoDescarga: data.puertoDescarga || data.dischargePort || fallback.puertoDescarga,
    condicionesDemurrage: data.condicionesDemurrage || data.demurrageTerms || fallback.condicionesDemurrage,
  };
}

function analizarRentabilidad(fleteExtraido: number, costoOperativoEstimado: number, mercadoPromedio: number) {
  const margen = fleteExtraido - costoOperativoEstimado;
  return {
    margen,
    veredictoArmador: margen > 0 ? "Rentable" : "Pérdida operativa",
    veredictoFletador: fleteExtraido < mercadoPromedio ? "Ventajoso" : "Caro",
    recomendacion: margen > (fleteExtraido * 0.15) ? "Aceptar oferta" : "Negociar flete",
  };
}

function classifyFinalVerdict(flete: number, costo: number, mercado: number) {
  const margen = flete - costo;
  if (margen > flete * 0.15 && flete <= mercado) return "Muy Rentable";
  if (margen > 0) return "Rentable";
  if (margen > -Math.abs(flete) * 0.1) return "Arriesgada";
  return "No Recomendable";
}

async function runInference(text: string) {
  const openai = new OpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Devuelve JSON plano con las claves datosCriticos, simulacionArmador, simulacionFletador y veredictoFinal. Texto:\n${text}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  return JSON.parse(raw);
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return responseJson({ error: "Metodo no permitido. Use POST." }, 405);
  }

  let body: NplRequest;
  try {
    body = await req.json();
  } catch {
    return responseJson({ error: "JSON de entrada invalido." }, 400);
  }

  const text = extractPlainText(body);
  if (!text) {
    return responseJson({ error: "No hay texto ni archivo procesable para analizar." }, 400);
  }

  const store = getStore("npl-ingesta");
  const sourceId = crypto.randomUUID();
  await store.setJSON(sourceId, {
    sourceFileName: body.sourceFileName || null,
    sourceFileType: body.sourceFileType || null,
    receivedAt: new Date().toISOString(),
    text,
  });

  const fallback = extractFallback(text);
  let inference: any = {};
  let inferenceStatus = "ok";
  try {
    inference = await runInference(text);
  } catch (error) {
    inferenceStatus = "fallback_regex";
    inference = {
      datosCriticos: fallback,
      simulacionArmador: "Inferencia AI no disponible; se aplico extraccion regex.",
      simulacionFletador: "Inferencia AI no disponible; se aplico extraccion regex.",
      veredictoFinal: "Arriesgada",
    };
  }

  const datosCriticos = normalizeCriticalData(inference, fallback);
  const fleteExtraido = datosCriticos.flete ?? 0;
  const costoOperativoEstimado = Number.isFinite(Number(body.costoOperativoEstimado))
    ? Number(body.costoOperativoEstimado)
    : Math.round(fleteExtraido * 0.82 * 100) / 100;
  const mercadoPromedio = Number.isFinite(Number(body.mercadoPromedio))
    ? Number(body.mercadoPromedio)
    : Math.round(fleteExtraido * 1.05 * 100) / 100;
  const decision = analizarRentabilidad(fleteExtraido, costoOperativoEstimado, mercadoPromedio);
  const veredictoFinal = fleteExtraido > 0
    ? classifyFinalVerdict(fleteExtraido, costoOperativoEstimado, mercadoPromedio)
    : "Arriesgada";

  return responseJson({
    modulo: "NPL",
    arquitectura: "Ingesta -> Inferencia -> Veredicto",
    sourceId,
    inferenceStatus,
    datosCriticos,
    simulacion: {
      armador: inference.simulacionArmador || inference.ownerScenario || null,
      fletador: inference.simulacionFletador || inference.chartererScenario || null,
    },
    motorDecision: {
      fleteExtraido,
      costoOperativoEstimado,
      mercadoPromedio,
      ...decision,
    },
    veredictoFinal,
    informe: {
      titulo: "Informe Motor NPL Independiente",
      resumen: `Oferta ${veredictoFinal}. Armador: ${decision.veredictoArmador}. Fletador: ${decision.veredictoFletador}. Recomendacion: ${decision.recomendacion}.`,
      imprimible: true,
    },
  });
};

export const config: Config = {
  path: ["/api/npl-analyze", "/api/npl/analyze"],
};
