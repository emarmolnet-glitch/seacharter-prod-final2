import { GoogleGenAI } from "@google/genai";
import { Buffer } from "node:buffer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

// Polyfill indispensable para entornos Node.js (Netlify Functions)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}

async function extractTextFromPDF(buffer) {
  try {
    const data = new Uint8Array(buffer);
    const getDocument = pdfjsLib?.getDocument || pdfjsLib?.default?.getDocument;
    const pdfDocument = await getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      text += textContent.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  } catch (err) {
    return "";
  }
}

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const rawBody = event.body || "";
    const buffer = Buffer.from(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');

    // Extraer contenido de texto del PDF adjunto
    let extractedText = "";
    try {
      extractedText = await extractTextFromPDF(buffer);
    } catch (e) {
      extractedText = buffer.toString('utf8');
    }

    // Si el texto binario es multipart, limpiamos los encabezados HTTP residuales para quedarnos con el texto puro
    if (extractedText.includes("Content-Disposition")) {
      const parts = extractedText.split("\r\n\r\n");
      if (parts.length > 1) {
        extractedText = parts.slice(1).join("\n").replace(/\r\n--[\s\S]*$/, "");
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en el servidor.");

    const ai = new GoogleGenAI({ apiKey });

    const prompt = [
      "ERES EL MOTOR DE EXTRACCIÓN Y PARSEO DE PACKING LISTS PARA PROYECTOS MARÍTIMOS.",
      "Analiza el texto extraído del documento adjunto y devuelve estrictamente un objeto JSON con todas las filas de la lista de empaque.",
      "Cada ítem debe contener obligatoriamente:",
      "- category: Categoría del equipo (ej: Equipos de Proceso, Maquinaria y Talleres, Utillaje y Herramientas, Flota de Vehículos)",
      "- type: Descripción detallada de la pieza o equipo",
      "- quantity: Cantidad numérica (entero)",
      "- length: Longitud en metros (string o número)",
      "- width: Anchura en metros (string o número)",
      "- height: Altura en metros (string o número)",
      "- weight: Peso unitario en kilogramos (número)",
      "- shipping_mode_supported: Modo de envío soportado (ej: 40' Flat Rack, 40' HC Contenedor, 20' ST Contenedor)",
      "",
      "FORMATO DE SALIDA JSON ESTRICTO:",
      "{",
      '  "success": true,',
      '  "items": [',
      "    {",
      '      "category": "Equipos de Proceso",',
      '      "type": "Bastidores / Racks de Ósmosis Inversa",',
      '      "quantity": 4,',
      '      "length": "12.00",',
      '      "width": "2.30",',
      '      "height": "2.50",',
      '      "weight": 8500,',
      '      "shipping_mode_supported": "40\' Flat Rack/OT"',
      "    }",
      "  ]",
      "}"
    ].join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `${prompt}\n\n--- TEXTO DEL DOCUMENTO ---\n${extractedText}` }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    });

    const rawText = (response.text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
    const resultObject = JSON.parse(rawText);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultObject)
    };

  } catch (error) {
    console.error('Error crítico en project-parser:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message, items: [] })
    };
  }
};

export default handler;
