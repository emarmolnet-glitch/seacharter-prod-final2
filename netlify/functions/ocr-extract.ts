import type { Config, Context } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";

const jsonHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

type PagePayload = {
  data?: string;
  base64?: string;
  mimeType?: string;
  pageNumber?: number;
};

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const payload = await req.json().catch(() => null) as {
    base64?: string;
    mimeType?: string;
    file?: { base64?: string; type?: string };
    pages?: PagePayload[];
  } | null;

  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const singleBase64 = payload?.base64 || payload?.file?.base64;
  const singleMime = payload?.mimeType || payload?.file?.type || "application/pdf";

  if (!pages.length && (!singleBase64 || typeof singleBase64 !== "string")) {
    return new Response(JSON.stringify({ error: "Se requiere contenido base64 o lote de páginas para OCR." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

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
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (pages.length > 0) {
      parts.push({
        text: "Extrae y transcribe íntegramente todo el texto de las siguientes páginas escaneadas del documento en orden correlativo, indicando cada página con su encabezado [Página X]:",
      });

      for (const page of pages) {
        const rawData = String(page.data || page.base64 || "");
        const cleanData = rawData.includes(",") ? rawData.split(",")[1] : rawData;
        const pageMime = String(page.mimeType || "image/jpeg");
        const pageNum = page.pageNumber || 0;

        if (cleanData) {
          if (pageNum > 0) {
            parts.push({ text: `\n--- [PÁGINA ${pageNum}] ---\n` });
          }
          parts.push({
            inlineData: {
              mimeType: pageMime,
              data: cleanData,
            },
          });
        }
      }
    } else if (singleBase64) {
      const cleanBase64 = singleBase64.includes(",") ? singleBase64.split(",")[1] : singleBase64;
      parts.push({
        text: "Extrae y transcribe íntegramente todo el texto de este documento escaneado/adjunto para auditoría:",
      });
      parts.push({
        inlineData: {
          mimeType: singleMime,
          data: cleanBase64,
        },
      });
    }

    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let extractedText = "";
    let lastError: unknown;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: "Eres un transcriptor y motor OCR especializado en documentación marítima, mercantil y contractual (pólizas de fletamento GENCON, ASBATANKVOY, contratos de compraventa SPA de cemento/clinker/commodities, cartas de crédito bancarias L/C, facturas comerciales, conocimientos de embarque B/L, packing lists). Tu única función es transcribir fielmente todo el texto del documento o lote de páginas adjunto, conservando con exactitud los nombres de partes (Seller/Buyer/Owner/Charterer), precios, cantidades, buques, puertos, laycan, demoras, condiciones de pago, números de cláusula y todo el redactado legal. Devuelve única y exclusivamente el texto plano transcrito en orden de páginas, sin introducciones ni comentarios adicionales.",
        }, requestOptions);

        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts,
            },
          ],
        });

        extractedText = result.response?.text?.() || "";
        if (extractedText.trim()) {
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[ocr-extract] Error con modelo ${modelName}, intentando siguiente fallback:`, err);
      }
    }

    if (!extractedText.trim() && lastError) {
      throw lastError;
    }

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
  path: ["/api/ocr-extract", "/.netlify/functions/ocr-extract"],
};
