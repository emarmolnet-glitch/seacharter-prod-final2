import { GoogleGenerativeAI } from "@google/generative-ai";

const systemInstruction =
  "Eres el asistente inteligente de SeaCharter (Core PRO y Data Bridge). Eres un experto en logística marítima, fletamentos y cálculo de rutas. Responde de forma concisa, profesional y directa.";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, {
      success: false,
      error: "Método no permitido. Usa POST.",
    });
  }

  try {
    const { mensaje } = await req.json();

    if (typeof mensaje !== "string" || !mensaje.trim()) {
      return jsonResponse(400, {
        success: false,
        error: "El campo mensaje es obligatorio y debe ser un string.",
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      systemInstruction,
    });

    const result = await model.generateContent(mensaje.trim());
    const respuesta = result.response.text();

    return jsonResponse(200, {
      success: true,
      respuesta,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Error interno del servidor.",
    });
  }
};
