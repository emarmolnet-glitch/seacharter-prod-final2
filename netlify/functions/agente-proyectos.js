import { GoogleGenAI } from "@google/genai";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

export async function handler(eventOrRequest) {
    const request = eventOrRequest.method ? eventOrRequest : new Request(eventOrRequest.url, eventOrRequest);
    
    if (request.method === 'OPTIONS') return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

    try {
        const body = await request.json();

        // 🔒 ROUTE-GUARD: Bloqueo absoluto si no está activo el módulo de proyectos
        const activeModule = body.modulo || body.module || body.activeModule;
        if (activeModule !== 'proyectos' && !body.isProjectMode) {
            return new Response(JSON.stringify({
                success: false,
                reply: "El Agente de Proyectos solo opera dentro del módulo de proyectos.",
                action: "none",
                payload: {}
            }), { status: 403, headers });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY no configurada.");

        const ai = new GoogleGenAI({ apiKey });

        const systemPrompt = [
            "ERES EL AGENTE DE PROYECTOS EXCLUSIVO DE SEACHARTER CORE PRO.",
            "TU ÚNICO ÁMBITO DE ACTUACIÓN ES EL MÁSTER DE COSTES Y OPERATIVA DE PUERTO EN EL MÓDULO DE PROYECTOS.",
            "Analiza los datos de carga introducidos y devuelve estrictamente un JSON con action: 'update_fields' y el objeto payload relleno con los valores estimados para los bloques de empaque, trincaje, mano de obra y logística periférica.",
            "FORMATO DE SALIDA JSON ESTRICTO:",
            "{",
            '  "success": true,',
            '  "intent": "PROJECT_COST_CALCULATION",',
            '  "reply": "Costes de terminal y operativa calculados con éxito.",',
            '  "action": "update_fields",',
            '  "payload": {',
            '    "category": "Carga Unitizada / Envasada",',
            '    "packingType": "big bag",',
            '    "dunnageUnits": 0,',
            '    "lashingChains": 0,',
            '    "slingsUnits": 3835,',
            '    "stevedoringShifts": 512,',
            '    "lashingTeams": 384,',
            '    "heavyLiftCranes": 0,',
            '    "mafiPlatforms": 0,',
            '    "storageDays": 3,',
            '    "surveyorCost": 1500,',
            '    "inlandTrucksCount": 120,',
            '    "customsCost": 450',
            "  }",
            "}"
        ].join("\n");

        const userMessage = body.message || body.UserContext || body.text || "Calcula los costes de esta operativa.";

        const effectiveSystemPrompt = body.systemInstruction
            ? `${body.systemInstruction}\n\n${systemPrompt}`
            : (body.projectContext
                ? `Contexto del Proyecto:\n${typeof body.projectContext === 'string' ? body.projectContext : JSON.stringify(body.projectContext)}\n\n${systemPrompt}`
                : systemPrompt);

        const response = await ai.models.generateContent({
            model: DEFAULT_GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: `${effectiveSystemPrompt}\n\n--- ENTRADA ---\n${userMessage}` }] }],
            config: {
                responseMimeType: "application/json",
                temperature: 0.1,
                maxOutputTokens: 2048,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });

        const rawText = (response.text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
        const resultObject = JSON.parse(rawText);

        return new Response(JSON.stringify(resultObject), { status: 200, headers });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            reply: "El Agente de Proyectos no está disponible temporalmente.",
            action: "error",
            payload: {}
        }), { status: 503, headers });
    }
}

export default handler;
