// Stubs de seguridad obligatorios para entornos Node.js (Serverless)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse";

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const rawBody = event.body || "";
    const buffer = Buffer.from(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');

    // Extracción segura del texto del PDF
    let extractedText = "";
    try {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text || "";
    } catch (e) {
      extractedText = buffer.toString('utf8');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en el servidor.");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Eres el motor de extracción y parseo de packing lists para proyectos marítimos en SeaCharter Core PRO.
      Analiza el texto extraído del documento y devuelve estrictamente un objeto JSON con las filas de carga detectadas.
      
      FORMATO DE SALIDA JSON ESTRICTO:
      {
        "success": true,
        "items": [
          {
            "category": "Equipos de Proceso",
            "type": "Descripción del ítem",
            "quantity": 1,
            "length": "6.0",
            "width": "2.4",
            "height": "2.8",
            "weight": 12000,
            "shipping_mode_supported": "40' Flat Rack"
          }
        ]
      }

      --- TEXTO DEL DOCUMENTO ---
      ${extractedText.substring(0, 30000)}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        items: parsedData.items || [],
        documentMeta: {
          name: "packing_list.pdf",
          size: buffer.length,
          itemsCount: (parsedData.items || []).length,
          uploadedAt: new Date().toISOString()
        }
      })
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
