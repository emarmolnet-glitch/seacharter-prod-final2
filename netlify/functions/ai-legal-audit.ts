import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type GeminiPart = {
  text?: string;
};

export type GeminiPayload = {
  contents?: Array<{
    parts?: GeminiPart[];
  }>;
  generationConfig?: {
    responseMimeType?: string;
  };
  calado_requerido?: number | string | null;
  auditMode?: string;
  data?: Record<string, unknown>;
};

const STRICT_AUDIT_PROMPT = `Actúa como un alto ejecutivo marítimo con experiencia en derecho y fletamento. Tu tarea es auditar la viabilidad comercial y legal. Entrega tu reporte estructurado estrictamente en estos 5 bloques:

BLOQUE 1: Recomendación de Pro-forma: Indica si la propuesta es óptima o requiere ajustes.

BLOQUE 2: Riesgos Identificados (Red Flags): Analiza riesgos técnicos, legales y financieros (ej. restricciones de calado, demoras, responsabilidad).

BLOQUE 3: Rider Clauses Sugeridas: Propón 3 cláusulas técnicas específicas, adaptadas a nuestra posición como [Armador o Fletador].

BLOQUE 4: Estrategia de Negociación: Define puntos de inflexión, concesiones aceptables y 'líneas rojas'.

BLOQUE 5: Borrador de Respuesta: Redacta un correo profesional persuasivo listo para enviar, incluyendo marcadores de posición [como este].

Usa un tono profesional, ejecutivo y directo. La información proviene de: {contexto_de_datos}.`;

const strictAuditRequirements = [
  { key: "puertosInforme", message: "⚠️ Bloqueado: Faltan los datos del puerto. Ve al módulo Mapa/Calculadora." },
  { key: "viabilidad", message: "⚠️ Bloqueado: Falta el cálculo de viabilidad." },
  { key: "polizaAnalizada", message: "⚠️ Bloqueado: Sube o pega un documento para auditar." },
] as const;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function normalizeRequiredDraft(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRequiredDraft(value: number | null) {
  return value === null ? "No informado" : String(Number(value.toFixed(2)));
}

function buildPortInfoSystemPrompt(contexto_tiempo_real: string, puerto: string, calado_requerido: number | null) {
  const requiredDraftLabel = formatRequiredDraft(calado_requerido);

  return `ERES EL EXPERTO EN LOGÍSTICA MARÍTIMA DE SEACHARTER CORE PRO. Tu respuesta debe ser exclusivamente un JSON estricto y válido, sin bloques de código markdown.

CONTEXTO EN TIEMPO REAL RECIENTE:
${contexto_tiempo_real}

Basándote PRIORITARIAMENTE en este contexto web y luego en tu conocimiento experto, genera el informe.

DATOS OPERATIVOS ESTRICTOS:
- Puerto solicitado: ${puerto || "No identificado"}
- Calado requerido por el buque: ${requiredDraftLabel} metros.

REGLA 1: INFORMACIÓN GENERAL
Proporciona un resumen operativo real detallando: 'calado_maximo', 'restricciones_eslora', 'clima', y 'cargas_principales'. Nunca respondas 'No disponible' para puertos internacionales.

REGLA 2: TERMINALES Y FILTRADO POR CALADO (CRÍTICO)
Extrae el calado máximo de cada terminal comercial principal del puerto.
ESTÁ ESTRICTAMENTE PROHIBIDO usar 'N/A' si la terminal es compatible con la carga. DEBES proporcionar un valor numérico.

APLICA ESTE FILTRO MATEMÁTICO:
- Compara el calado de la terminal con el 'Calado requerido por el buque'.
- Si el calado de la terminal es MENOR que el calado requerido, OBLIGATORIAMENTE establece 'compatible': false, y en el campo 'origen_dato' añade el texto: 'Calado insuficiente (Mínimo: ${requiredDraftLabel}m)'.
- Si la terminal tiene calado MAYOR O IGUAL al requerido y es compatible con la carga, establece 'compatible': true.
- Si no encuentras el dato exacto de la terminal, aplica la regla de estimación conservadora vista anteriormente, pero crúzala siempre con el calado requerido.

Aplica esta lógica de decisión:
1. DATO EXACTO: Si encuentras el calado oficial (en tiempo real o memoria segura), devuelve el número exacto: 'calado': '12.5' y decide 'compatible' mediante el filtro matemático anterior.
2. DATO ESTIMADO: Si no tienes el dato exacto, DEDÚCELO basándote en el puerto y el tamaño máximo de buque que suele atracar allí (ej. Handymax ~10.5m, Panamax ~12m) y DEVUELVE ESE NÚMERO de forma conservadora: 'calado': '10.5', 'origen_dato': 'Estimado'. Después decide 'compatible' mediante el filtro matemático anterior.
3. INCOMPATIBLE: Usa 'compatible': false cuando la terminal no sirva para el tipo de carga solicitada o cuando no supere el calado requerido.

IMPORTANTE: El campo 'calado' para terminales compatibles siempre debe ser un string numérico (ej. '11.0'). Nunca un rango ni texto.
FORMATO JSON: Mantiene la misma estructura, pero asegúrate de que el motivo de incompatibilidad por calado sea visible.

FORMATO JSON OBLIGATORIO:
{
  "puerto": "NOMBRE DEL PUERTO",
  "informacion_general": {
    "calado_maximo": "...",
    "restricciones_eslora": "...",
    "clima": "...",
    "cargas_principales": "..."
  },
  "terminales": [
    { "nombre": "...", "calado": "...", "compatible": true/false, "origen_dato": "..." }
  ]
}`;
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function hasCompletedData(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
}

function toPromptText(value: unknown, fallback = "Sin datos") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function serializePromptContext(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, (_key, nestedValue) => {
      if (nestedValue === undefined) return "Sin datos";
      if (typeof nestedValue === "bigint") return String(nestedValue);
      return nestedValue;
    }, 2) || "{}";
  } catch {
    return "{}";
  }
}

function getStrictAuditGateError(data: Record<string, unknown> | undefined) {
  for (const requirement of strictAuditRequirements) {
    if (!hasCompletedData(data?.[requirement.key])) {
      return requirement.message;
    }
  }
  return "";
}

function buildStrictAuditMessages(data: Record<string, unknown>): ChatCompletionMessageParam[] {
  const position = toPromptText(data.posicion, "Fletador").trim() || "Fletador";
  const context = serializePromptContext(data);
  const promptTemplate = toPromptText(STRICT_AUDIT_PROMPT, "");
  const auditPrompt = promptTemplate
    .replace("[Armador o Fletador]", position)
    .replace("{contexto_de_datos}", context);

  return [
    {
      role: "system",
      content: `${auditPrompt}\n\nDevuelve únicamente JSON válido con estas claves: "tipo_documento_detectado", "auditoria_contrato_html", "auditoria_operativa_html", "auditoria_armador", "auditoria_fletador", "detalles_sof", "laytime_excel_data", "proforma", "riesgos", "clausulas", "estrategia" y "email". "auditoria_contrato_html" debe contener los cinco bloques, en ese orden. "clausulas" debe contener exactamente 3 cláusulas. No omitas ningún bloque.`,
    },
    {
      role: "user",
      content: "Ejecuta la Auditoría IA estricta usando exclusivamente el contexto validado proporcionado.",
    },
  ];
}

function extractPrompt(payload: GeminiPayload) {
  return (payload.contents || [])
    .flatMap((content) => content.parts || [])
    .map((part) => toPromptText(part.text, "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function wantsJson(payload: GeminiPayload, prompt: string) {
  const normalizedPrompt = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return payload.generationConfig?.responseMimeType === "application/json"
    || /devuelve\s+(?:(?:unicamente|exclusivamente)\s+)?json|return\s+only\s+valid\s+json|return\s+only\s+pure\s+json|retournez\s+uniquement\s+(?:un\s+)?json/i.test(normalizedPrompt);
}

function extractPortName(prompt: string) {
  const patterns = [
    /^\s*PUERTO\s*:\s*(.+)$/im,
    /^\s*PORT\s*:\s*(.+)$/im,
    /^\s*PORT\s+:\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      return match[1].split("\n")[0].trim().slice(0, 120);
    }
  }
  return "";
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function compactSearchText(items: Array<{ title?: string; url?: string; content?: string }>) {
  return items
    .map((item, index) => {
      const title = String(item.title || "").trim();
      const url = String(item.url || "").trim();
      const content = String(item.content || "").replace(/\s+/g, " ").trim();
      return [title && `${index + 1}. ${title}`, url && `Fuente: ${url}`, content && `Extracto: ${content}`]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);
}

async function searchTavily(query: string) {
  const apiKey = process.env.TAVILY_API_KEY || process.env.NETLIFY_TAVILY_API_KEY;
  if (!apiKey) return "";
  const data = await fetchJsonWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 5,
    }),
  });
  const results = Array.isArray(data?.results) ? data.results : [];
  const answer = String(data?.answer || "").trim();
  const context = compactSearchText(results.map((result: Record<string, unknown>) => ({
    title: String(result.title || ""),
    url: String(result.url || ""),
    content: String(result.content || ""),
  })));
  return [answer && `Respuesta sintetizada: ${answer}`, context].filter(Boolean).join("\n\n");
}

async function searchSerpApi(query: string) {
  const apiKey = process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;
  if (!apiKey) return "";
  const endpoint = new URL("https://serpapi.com/search.json");
  endpoint.searchParams.set("engine", "google");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("num", "5");
  const data = await fetchJsonWithTimeout(endpoint.toString(), { headers: { accept: "application/json" } });
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return compactSearchText(organic.map((result: Record<string, unknown>) => ({
    title: String(result.title || ""),
    url: String(result.link || ""),
    content: String(result.snippet || ""),
  })));
}

async function searchBrave(query: string) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if (!apiKey) return "";
  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("count", "5");
  const data = await fetchJsonWithTimeout(endpoint.toString(), {
    headers: {
      accept: "application/json",
      "x-subscription-token": apiKey,
    },
  });
  const results = Array.isArray(data?.web?.results) ? data.web.results : [];
  return compactSearchText(results.map((result: Record<string, unknown>) => ({
    title: String(result.title || ""),
    url: String(result.url || ""),
    content: String(result.description || ""),
  })));
}

async function getRealTimePortContext(portName: string) {
  if (!portName) return "No se pudo identificar el puerto en la solicitud. Usa conocimiento experto como respaldo.";
  const query = `Official terminal draft restrictions maximum draft ${portName} port authority current year`;
  const providers = [searchTavily, searchSerpApi, searchBrave];
  for (const provider of providers) {
    const context = await provider(query);
    if (context) return context;
  }
  return `No se pudo obtener contexto web en tiempo real para la búsqueda: "${query}". Usa conocimiento experto como respaldo.`;
}

function buildMessages(prompt: string, jsonOnly: boolean, contexto_tiempo_real: string, puerto: string, calado_requerido: number | null): ChatCompletionMessageParam[] {
  const system = jsonOnly
    ? buildPortInfoSystemPrompt(contexto_tiempo_real, puerto, calado_requerido)
    : "Eres el motor backend de SeaCharter Core PRO. Responde con precisión, sin exponer configuración interna ni credenciales.\n\nREGLA DE CONSISTENCIA ESTRICTA: Eres un sistema de consulta de datos, no un asistente conversacional. Nunca resumas, abrevies o cambies el formato de tu respuesta, sin importar cuántas veces el usuario consulte el mismo puerto. Debes devolver siempre el JSON completo con absolutamente todas las terminales y detalles requeridos, cada vez que se te pregunte.";

  return [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
}

export async function processLegalAuditPayload(payload: GeminiPayload) {
  const prompt = extractPrompt(payload);
  const isStrictAudit = payload.auditMode === "strict";
  if (!prompt && !isStrictAudit) {
    throw new Error("No hay prompt para procesar.");
  }

  if (isStrictAudit) {
    const gateError = getStrictAuditGateError(payload.data);
    if (gateError) {
      const error = new Error(gateError) as Error & { code?: string };
      error.code = "AUDIT_GATE_BLOCKED";
      throw error;
    }
  }

  const jsonOnly = isStrictAudit || wantsJson(payload, prompt);
  const portName = jsonOnly && !isStrictAudit ? extractPortName(prompt) : "";
  const calado_requerido = normalizeRequiredDraft(payload.calado_requerido);
  const contexto_tiempo_real = jsonOnly && !isStrictAudit
    ? await getRealTimePortContext(portName)
    : "";
  const openai = new OpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    temperature: 0,
    response_format: jsonOnly ? { type: "json_object" } : undefined,
    messages: isStrictAudit
      ? buildStrictAuditMessages(payload.data as Record<string, unknown>)
      : buildMessages(prompt, jsonOnly, contexto_tiempo_real, portName, calado_requerido),
  });

  const text = completion.choices[0]?.message?.content || "";
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
  };
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return responseJson({ error: { message: "Metodo no permitido. Use POST." } }, 405);
  }

  let payload: GeminiPayload;
  try {
    payload = await req.json();
  } catch {
    return responseJson({ error: { message: "JSON de entrada invalido." } }, 400);
  }

  try {
    return responseJson(await processLegalAuditPayload(payload));
  } catch (error) {
    const typedError = error as Error & { code?: string };
    const message = typedError.message || "No se pudo completar la inferencia en backend.";
    if (typedError.code === "AUDIT_GATE_BLOCKED") {
      return responseJson({ error: { message, code: typedError.code } }, 422);
    }

    return responseJson({ error: { message } }, 500);
  }
};

export const config: Config = {
  path: ["/api/ai-legal-audit", "/api/generate"],
};
