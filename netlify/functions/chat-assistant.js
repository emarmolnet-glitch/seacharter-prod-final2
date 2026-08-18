import { GoogleGenerativeAI } from "@google/generative-ai";

const systemInstruction = "Eres el asistente inteligente de SeaCharter (Core PRO y Data Bridge). Eres un experto en logística marítima, fletamentos y cálculo de rutas.";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(200, { ok: true });
  if (req.method !== "POST") return jsonResponse(405, { error: "Método no permitido" });

  try {
    const { mensaje } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Se actualiza al identificador válido más reciente y rápido
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction });

    const result = await model.generateContent(mensaje.trim());
    return jsonResponse(200, { success: true, respuesta: result.response.text() });

  } catch (error) {
    console.error("Error en Gemini API:", error);
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Error interno del servidor.",
    });
  }
};
