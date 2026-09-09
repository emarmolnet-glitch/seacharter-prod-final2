import { GoogleGenerativeAI } from "@google/generative-ai";

export const AGENTE_PROYECTOS_MODEL = "gemini-2.5-flash";

export const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

export function formatProjectContext(body = {}) {
    if (body?.projectContext) {
        return typeof body.projectContext === 'string'
            ? body.projectContext
            : JSON.stringify(body.projectContext);
    }
    const fallbackContext = {
        items: body?.items || [],
        financials: body?.financialBreakdown || body?.financials || {},
        stowage: body?.stowagePlan || body?.stowage || {}
    };
    return JSON.stringify(fallbackContext);
}

export function buildAgenteProyectosSystemInstruction(projectContext = '{}') {
    const pContext = typeof projectContext === 'string' ? projectContext : JSON.stringify(projectContext);
    return `Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini. Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente.

REGLA CERO - SALUDOS Y MENSAJES CASUALES:
Si el usuario te saluda ("hola", "buenos días", "qué tal") o hace una pregunta informal, responde ÚNICAMENTE con un saludo natural, humano y cercano, abriendo la puerta a la conversación. ¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON a menos que el usuario te pida explícitamente números, cálculos o análisis específicos.

REGLAS DE COMPORTAMIENTO Y PERSONALIDAD:
1. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL: Habla de tú a tú con el usuario. Tienes permiso absoluto para debatir, opinar, aconsejar sobre negociaciones con clientes, analizar tendencias macroeconómicas (ej. impacto del precio del combustible en fletes) o buscar cualquier dato en la web en tiempo real.
2. OPINIÓN CRÍTICA Y ASESORAMIENTO: Si el usuario te pregunta "¿qué opinas de este croquis?" o "¿debería informar al cliente de esta subida?", no te limites a repetir datos. Analiza la situación, cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior.
3. TONO NATURAL: Responde de forma directa, analítica y fluida. Usa formato markdown para estructurar ideas complejas, manteniendo un tono de diálogo abierto y proactivo.

CONTEXTO EN VIVO DEL PROYECTO (USO INTERNO):
Tienes acceso en tiempo real a los datos que el usuario está operando, pero consúltalos solo cuando te hagan una pregunta técnica o financiera:
- Para consultas financieras, márgenes o viabilidad, evalúa la sección 'financials'.
- Para opinar sobre la viabilidad física, estiba o riesgos, analiza la sección 'stowage.executiveJustification'.
- NUNCA expongas el JSON crudo en tu respuesta.

Contexto actual del proyecto: ${pContext}`;
}

export function buildGeminiHistory(historyEntries = []) {
    if (!Array.isArray(historyEntries)) return [];
    const valid = [];
    let expectedRole = "user";
    for (const entry of historyEntries) {
        const role = (entry?.role === "assistant" || entry?.role === "model" || entry?.sender === "agent") ? "model" : "user";
        const text = String(entry?.content || entry?.text || "").trim();
        if (!text) continue;
        if (role === expectedRole) {
            valid.push({ role, parts: [{ text }] });
            expectedRole = role === "user" ? "model" : "user";
        }
    }
    if (valid.length > 0 && valid[valid.length - 1].role === "user") {
        valid.pop();
    }
    return valid;
}

export function processGroundedResponse(response) {
    let responseText = "";
    try {
        responseText = typeof response?.text === "function" ? response.text() : "";
    } catch (textErr) {
        const parts = response?.candidates?.[0]?.content?.parts || [];
        responseText = parts
            .map((part) => part?.text || "")
            .filter(Boolean)
            .join("\n");
    }

    const candidate = response?.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.groundingChunks?.length > 0) {
        const webSources = groundingMetadata.groundingChunks
            .map((chunk) => chunk?.web)
            .filter((web) => Boolean(web?.uri && web?.title));

        if (webSources.length > 0) {
            const seenUris = new Set();
            const uniqueSources = [];
            for (const source of webSources) {
                if (!seenUris.has(source.uri)) {
                    seenUris.add(source.uri);
                    uniqueSources.push(source);
                }
            }

            const hasExistingLinks = uniqueSources.some((src) => responseText.includes(src.uri));
            if (!hasExistingLinks && uniqueSources.length > 0) {
                const sourcesMarkdown = uniqueSources
                    .slice(0, 5)
                    .map((src) => `- [${src.title}](${src.uri})`)
                    .join("\n");
                responseText += `\n\n**Fuentes consultadas en tiempo real:**\n${sourcesMarkdown}`;
            }
        }
    }

    return { responseText, groundingMetadata: groundingMetadata || null };
}

export async function handler(eventOrRequest) {
    const request = eventOrRequest.method ? eventOrRequest : new Request(eventOrRequest.url, eventOrRequest);
    
    if (request.method === 'OPTIONS') return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

    try {
        const body = await request.json();

        // 🔒 ROUTE-GUARD: Bloqueo absoluto si no está activo el módulo de proyectos
        const activeModule = body.modulo || body.module || body.activeModule;
        if (activeModule && activeModule !== 'proyectos' && !body.isProjectMode) {
            return new Response(JSON.stringify({
                success: false,
                reply: "El Agente de Proyectos solo opera dentro del módulo de proyectos.",
                action: "none",
                payload: {}
            }), { status: 403, headers });
        }

        const apiKey = (typeof Netlify !== 'undefined' && (Netlify.env?.get?.('GEMINI_API_KEY') || Netlify.env?.get?.('GOOGLE_API_KEY') || Netlify.env?.get?.('GOOGLE_GENAI_API_KEY')))
            || process.env.GEMINI_API_KEY
            || process.env.GOOGLE_API_KEY
            || process.env.GOOGLE_GENAI_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({
                success: false,
                reply: "GEMINI_API_KEY no configurada en el servidor.",
                error: "GEMINI_API_KEY no configurada.",
                action: "error",
                payload: {}
            }), { status: 500, headers });
        }

        const projectContext = formatProjectContext(body);
        const userMessage = body.message || body.mensaje || body.UserContext || body.text || "Hola";

        const genAI = new GoogleGenerativeAI(apiKey);

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ googleSearch: {} }], // <-- Búsqueda web nativa en tiempo real de Google
            systemInstruction: `Eres el Agente de Proyectos de SeaCharter Core PRO, impulsado por Gemini. Eres un consultor estratégico marítimo y un socio conversacional altamente inteligente.

REGLA CERO - SALUDOS Y MENSAJES CASUALES:
Si el usuario te saluda ("hola", "buenos días", "qué tal") o hace una pregunta informal, responde ÚNICAMENTE con un saludo natural, humano y cercano, abriendo la puerta a la conversación. ¡PROHIBIDO! No escupas desgloses financieros, costes ni datos del JSON a menos que el usuario te pida explícitamente números, cálculos o análisis específicos.

REGLAS DE COMPORTAMIENTO Y PERSONALIDAD:
1. LIBERTAD ESTRATÉGICA Y CONVERSACIONAL: Habla de tú a tú con el usuario. Tienes permiso absoluto para debatir, opinar, aconsejar sobre negociaciones con clientes, analizar tendencias macroeconómicas (ej. impacto del precio del combustible en fletes) o buscar cualquier dato en la web en tiempo real.
2. OPINIÓN CRÍTICA Y ASESORAMIENTO: Si el usuario te pregunta "¿qué opinas de este croquis?" o "¿debería informar al cliente de esta subida?", no te limites a repetir datos. Analiza la situación, cruza la información con la web si es necesario, y da tu recomendación profesional como un bróker senior.
3. TONO NATURAL: Responde de forma directa, analítica y fluida. Usa formato markdown para estructurar ideas complejas, manteniendo un tono de diálogo abierto y proactivo.

CONTEXTO EN VIVO DEL PROYECTO (USO INTERNO):
Tienes acceso en tiempo real a los datos que el usuario está operando, pero consúltalos solo cuando te hagan una pregunta técnica o financiera:
- Para consultas financieras, márgenes o viabilidad, evalúa la sección 'financials'.
- Para opinar sobre la viabilidad física, estiba o riesgos, analiza la sección 'stowage.executiveJustification'.
- NUNCA expongas el JSON crudo en tu respuesta.

Contexto actual del proyecto: ${projectContext}`
        });

        const rawHistory = body.history || body.historial || [];
        const chatHistory = buildGeminiHistory(rawHistory);
        const chat = model.startChat(chatHistory.length > 0 ? { history: chatHistory } : undefined);

        const result = await chat.sendMessage(userMessage);
        const { responseText, groundingMetadata } = processGroundedResponse(result.response);

        return new Response(JSON.stringify({
            success: true,
            reply: responseText,
            text: responseText,
            respuesta: responseText,
            groundingMetadata: groundingMetadata || null,
            intent: "PROJECT_CONSULTANT",
            action: "none",
            payload: {}
        }), { status: 200, headers });

    } catch (error) {
        console.error("Error en Agente de Proyectos:", error);
        return new Response(JSON.stringify({
            success: false,
            reply: "El Agente de Proyectos no está disponible temporalmente.",
            error: error instanceof Error ? error.message : "Error interno del servidor.",
            action: "error",
            payload: {}
        }), { status: 503, headers });
    }
}

export default handler;
