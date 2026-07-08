import type { Config } from "@netlify/functions";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type GeminiPart = {
  text?: string;
};

type GeminiPayload = {
  contents?: Array<{
    parts?: GeminiPart[];
  }>;
  generationConfig?: {
    responseMimeType?: string;
  };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function buildPortInfoSystemPrompt(contexto_tiempo_real: string) {
  return `ERES EL EXPERTO EN LOGÍSTICA MARÍTIMA DE SEACHARTER CORE PRO. Tu respuesta debe ser exclusivamente un JSON estricto y válido, sin bloques de código markdown.

CONTEXTO EN TIEMPO REAL RECIENTE:
${contexto_tiempo_real}

Basándote PRIORITARIAMENTE en este contexto web y luego en tu conocimiento experto, genera el informe.

REGLA 1: INFORMACIÓN GENERAL
Proporciona un resumen operativo real detallando: 'calado_maximo', 'restricciones_eslora', 'clima', y 'cargas_principales'. Nunca respondas 'No disponible' para puertos internacionales.

REGLA 2: TERMINALES Y EXTRACCIÓN OBLIGATORIA DE CALADOS NUMÉRICOS
Lista SIEMPRE los muelles o terminales comerciales principales.
ESTÁ ESTRICTAMENTE PROHIBIDO usar 'N/A' si la terminal es compatible con la carga. DEBES proporcionar un valor numérico.

Aplica esta lógica de decisión:
1. DATO EXACTO: Si encuentras el calado oficial (en tiempo real o memoria segura), devuelve el número exacto: 'calado': '12.5', 'compatible': true, 'origen_dato': 'Tiempo Real' (o 'Seguro').
2. DATO ESTIMADO: Si no tienes el dato exacto, DEDÚCELO basándote en el puerto y el tamaño máximo de buque que suele atracar allí (ej. Handymax ~10.5m, Panamax ~12m) y DEVUELVE ESE NÚMERO de forma conservadora: 'calado': '10.5', 'compatible': true, 'origen_dato': 'Estimado'.
3. INCOMPATIBLE: SOLO usarás 'calado': 'N/A', 'compatible': false y 'origen_dato': 'Incompatible' cuando la terminal no sirva para el tipo de carga solicitada.

IMPORTANTE: El campo 'calado' para terminales compatibles siempre debe ser un string numérico (ej. '11.0'). Nunca un rango ni texto.

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

function extractPrompt(payload: GeminiPayload) {
  return (payload.contents || [])
    .flatMap((content) => content.parts || [])
    .map((part) => String(part.text || "").trim())
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

function buildMessages(prompt: string, jsonOnly: boolean, contexto_tiempo_real: string): ChatCompletionMessageParam[] {
  const system = jsonOnly
    ? buildPortInfoSystemPrompt(contexto_tiempo_real)
    : "Eres el motor backend de SeaCharter Core PRO. Responde con precisión, sin exponer configuración interna ni credenciales.\n\nREGLA DE CONSISTENCIA ESTRICTA: Eres un sistema de consulta de datos, no un asistente conversacional. Nunca resumas, abrevies o cambies el formato de tu respuesta, sin importar cuántas veces el usuario consulte el mismo puerto. Debes devolver siempre el JSON completo con absolutamente todas las terminales y detalles requeridos, cada vez que se te pregunte.";

  return [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
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

  const prompt = extractPrompt(payload);
  if (!prompt) {
    return responseJson({ error: { message: "No hay prompt para procesar." } }, 400);
  }

  try {
    const jsonOnly = wantsJson(payload, prompt);
    const portName = jsonOnly ? extractPortName(prompt) : "";
    const contexto_tiempo_real = jsonOnly
      ? await getRealTimePortContext(portName)
      : "";
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      temperature: 0,
      response_format: jsonOnly ? { type: "json_object" } : undefined,
      messages: buildMessages(prompt, jsonOnly, contexto_tiempo_real),
    });

    const text = completion.choices[0]?.message?.content || "";
    return responseJson({
      candidates: [
        {
          content: {
            parts: [{ text }],
          },
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo completar la inferencia en backend.";

    return responseJson({ error: { message } }, 500);
  }
};

export const config: Config = {
  path: ["/api/ai-legal-audit", "/api/generate"],
};
