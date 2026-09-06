// Polyfill indispensable para entornos Node.js (Serverless)
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
  };
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

async function extractTextFromPDF(buffer) {
  try {
    const data = new Uint8Array(buffer);
    const getDocument = pdfjsLib?.getDocument || pdfjsLib?.default?.getDocument;
    if (!getDocument) throw new Error("pdfjs-dist getDocument no disponible.");
    
    const loadingTask = getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    let text = "";
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      text += `--- Página ${i} ---\n${pageText}\n`;
    }
    return text;
  } catch (err) {
    console.error("Error en extracción PDF con pdfjs-dist:", err);
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

    let extractedText = await extractTextFromPDF(buffer);
    
    if (!extractedText || extractedText.trim().length < 5) {
      extractedText = buffer.toString('utf8');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Prompt estricto: Cero datos pregrabados. Todo debe salir exclusivamente del documento real.
    const prompt = `
      Eres el motor experto de inteligencia logística y fletamentos para SeaCharter Core PRO.
      Analiza de forma estricta el siguiente texto extraído de un documento adjunto al expediente.
      
      INSTRUCCIONES DE EXTRACCIÓN PURA:
      - Extrae exclusivamente la información real que aparezca en el texto. No inventes ni asumas datos que no estén escritos.
      - Si el documento tiene formato tabular o de packing list, extrae cada fila de carga.
      - Si es un documento de texto libre, factura o certificado, extrae los elementos descritos basándote únicamente en el contenido.

      Para cada ítem obtenido, extrae los siguientes campos (si un valor numérico o dimensión no se especifica en el texto, pon 0 o cadena vacía "" según corresponda, sin rellenar con datos falsos):
      - category: Categoría o sección indicada en el documento (o "" si no aplica).
      - type: Descripción exacta del ítem, equipo o servicio.
      - quantity: Cantidad real (entero, por defecto 1).
      - length: Largo en metros (si se indica, sino "").
      - width: Ancho en metros (si se indica, sino "").
      - height: Alto en metros (si se indica, sino "").
      - weight: Peso unitario real en kilogramos (número; si el documento no indica el peso, pon obligatoriamente 0).
      - shipping_mode_supported: Modo de transporte indicado o deducible estrictamente por las dimensiones/peso (si no se puede determinar, "").

      Devuelve la respuesta EXCLUSIVAMENTE en formato JSON válido, sin bloques markdown ni texto adicional, cumpliendo exactamente con esta estructura:
      {
        "success": true,
        "items": [
          {
            "category": "",
            "type": "",
            "quantity": 1,
            "length": "",
            "width": "",
            "height": "",
            "weight": 0,
            "shipping_mode_supported": ""
          }
        ]
      }

      --- TEXTO EXTRAÍDO DEL DOCUMENTO ---
      ${extractedText.substring(0, 45000)}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsedData;
    
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      parsedData = {
        success: true,
        items: [{
          category: "",
          type: "Documento Analizado (Sin estructura tabular detectada)",
          quantity: 1,
          length: "",
          width: "",
          height: "",
          weight: 0,
          shipping_mode_supported: ""
        }]
      };
    }

    const mimeType = event.headers['content-type']?.includes('pdf') ? 'application/pdf' : 'application/octet-stream';
    const dataBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        items: parsedData.items && parsedData.items.length > 0 ? parsedData.items : [],
        documentMeta: {
          name: "Documento_Proyecto.pdf",
          size: buffer.length,
          itemsCount: parsedData.items ? parsedData.items.length : 0,
          uploadedAt: new Date().toISOString(),
          dataBase64: dataBase64
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
