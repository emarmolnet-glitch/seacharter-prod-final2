import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const rawBody = event.body || "";
    const buffer = Buffer.from(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');

    // PASO 1: Digitalización y extracción limpia del texto digital del documento
    let digitalText = "";
    try {
      const pdfData = await pdfParse(buffer);
      digitalText = pdfData.text || "";
    } catch (parseErr) {
      console.warn("Extracción estándar falló, usando buffer en texto plano:", parseErr);
      digitalText = buffer.toString('utf8');
    }

    // Limpieza de cabeceras binarias multipart si el body llega con envoltorio HTTP crudo
    if (digitalText.includes("Content-Disposition")) {
      const parts = digitalText.split("\r\n\r\n");
      if (parts.length > 1) {
        digitalText = parts.slice(1).join("\n").replace(/\r\n--[\s\S]*$/, "");
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // PASO 2: Análisis inteligente de la "digitalización" con cero datos pregrabados
    const prompt = `
      Eres el motor experto de inteligencia logística y fletamentos para SeaCharter Core PRO.
      A continuación se presenta el texto digitalizado de un documento adjunto al expediente.
      
      INSTRUCCIONES DE ANÁLISIS ESTRICTO:
      - Lee y analiza el contenido digitalizado de principio a fin.
      - Extrae exclusivamente los datos reales que aparezcan en el texto. Está totalmente prohibido inventar, asumir o rellenar con valores ficticios.
      - Si el documento contiene una lista de empaque (packing list) o tabla de cargas, extrae cada fila real encontrada.
      - Si es una factura, certificado o texto libre, extrae los elementos descritos basándote únicamente en lo que reza el texto.

      Para cada ítem extraído, completa los campos de forma rigurosa (si un valor numérico o dimensión no se indica en el documento, pon obligatoriamente 0 o cadena vacía ""):
      - category: Categoría o sección indicada en el documento (o "" si no aplica).
      - type: Descripción exacta del ítem, equipo, carga o servicio.
      - quantity: Cantidad real (entero; si no se especifica, 1).
      - length: Largo en metros (si se indica, sino "").
      - width: Ancho en metros (si se indica, sino "").
      - height: Alto en metros (si se indica, sino "").
      - weight: Peso unitario real en kilogramos (número; si el documento no indica el peso, pon 0).
      - shipping_mode_supported: Modo de transporte indicado o deducible estrictamente por las dimensiones/peso (si no se puede determinar, "").

      Devuelve la respuesta EXCLUSIVAMENTE en formato JSON válido, sin bloques markdown ni texto adicional, cumpliendo exactamente con esta estructura de esquema:
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

      --- TEXTO DIGITALIZADO DEL DOCUMENTO ---
      ${digitalText.substring(0, 45000)}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (jsonErr) {
      console.error("Error parseando JSON de Gemini:", responseText);
      parsedData = { success: true, items: [] };
    }

    const mimeType = event.headers['content-type']?.includes('pdf') ? 'application/pdf' : 'application/octet-stream';
    const dataBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        items: parsedData.items || [],
        documentMeta: {
          name: "Documento_Proyecto.pdf",
          size: buffer.length,
          itemsCount: (parsedData.items || []).length,
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
