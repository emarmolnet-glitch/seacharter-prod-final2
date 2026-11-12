import type { Config, Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const payload = await req.json().catch(() => null);
  const base64Data = payload?.base64 || payload?.file?.base64;
  const mimeType = payload?.mimeType || payload?.file?.type || "application/pdf";

  if (!base64Data || typeof base64Data !== "string") {
    return new Response(JSON.stringify({ error: "Se requiere el contenido del archivo en base64." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  // Sanitize base64 (remove data URI scheme prefix if present)
  const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;

  const apiKey = (typeof Netlify !== "undefined" && (
    Netlify.env?.get?.("GEMINI_API_KEY") ||
    Netlify.env?.get?.("GOOGLE_API_KEY") ||
    Netlify.env?.get?.("GOOGLE_GENAI_API_KEY")
  ))
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_GENAI_API_KEY
    || "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada en el servidor." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const GOOGLE_AI_STUDIO_BASE_URL = "https://generativelanguage.googleapis.com";
  const requestOptions = { baseUrl: GOOGLE_AI_STUDIO_BASE_URL };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "Eres un transcriptor y motor OCR especializado en documentación marítima, mercantil y contractual (pólizas de fletamento GENCON, ASBATANKVOY, cartas de crédito bancarias L/C, facturas comerciales, conocimientos de embarque B/L, packing lists). Tu única función es transcribir fielmente todo el texto del documento adjunto, conservando con exactitud los nombres de buques, números IMO, DWT, fechas de laycan, puertos de carga y descarga, cantidades, tarifas de flete y demoras, y todas las cláusulas. Devuelve única y exclusivamente el texto plano transcrito, sin introducciones ni comentarios adicionales.",
    }, requestOptions);

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extrae y transcribe íntegramente todo el texto de este documento escaneado/adjunto para auditoría:",
            },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
    });

    const extractedText = result.response?.text?.() || "";

    return new Response(JSON.stringify({
      success: true,
      text: extractedText.trim(),
    }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("[ocr-extract] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Error durante la extracción OCR.",
    }), {
      status: 502,
      headers: jsonHeaders,
    });
  }
};

export const config: Config = {
  path: "/api/ocr-extract",
};
