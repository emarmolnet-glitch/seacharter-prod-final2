import { GoogleGenAI } from "@google/genai";
import { Buffer } from "node:buffer";
import * as xlsx from "xlsx";
import mammoth from "mammoth";
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
    const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    
    // Extracción de texto según formato (PDF, Excel, Word o texto plano)
    let extractedText = "";
    try {
      extractedText = await extractTextFromPDF(bodyBuffer);
    } catch (e) {
      extractedText = bodyBuffer.toString('utf8');
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
      "- length: Longitud en metros (número o string)",
      "- width: Anchura en metros (número o string)",
      "- height: Altura en metros (número o string)",
      "- weight: Peso unitario en kilogramos (número)",
      "- shipping_mode_supported: Modo de envío soportado (ej: 40' Flat Rack, 40' HC Contenedor, Ro-Ro)",
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
