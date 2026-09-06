import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const rawBody = event.body || "";
    const buffer = Buffer.from(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const pdfBase64 = buffer.toString('base64');

    // Prompt limpio: Sin valores de ejemplo para evitar sesgos o datos fijos
    const prompt = `
      Eres un motor experto de extracción y parseo de packing lists y documentos marítimos para SeaCharter Core PRO.
      Analiza de forma exhaustiva el documento PDF adjunto. Tu única fuente de verdad son los datos que contiene este documento específico.
      Extrae ABSOLUTAMENTE TODAS las filas tabulares, equipos, piezas, vehículos o componentes de carga reales que aparezcan en el archivo. No omitas ninguna línea ni inventes datos.

      Para cada ítem extraído, devuelve:
      - category: Categoría o tipo de equipo indicado en el documento.
      - type: Descripción exacta de la pieza u objeto.
      - quantity: Cantidad numérica real.
      - length: Longitud real en metros (si no existe, pon cadena vacía "").
      - width: Ancho real en metros (si no existe, pon cadena vacía "").
      - height: Alto real en metros (si no existe, pon cadena vacía "").
      - weight: Peso unitario real en kilogramos (número; si no existe, pon 0).
      - shipping_mode_supported: Modo de envío recomendado según sus dimensiones y peso.

      Devuelve la respuesta EXCLUSIVAMENTE en formato JSON válido, sin bloques markdown ni texto adicional, cumpliendo estrictamente con esta estructura de esquema:
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
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf"
        }
      }
    ]);

    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);

    const dataBase64 = `data:application/pdf;base64,${pdfBase64}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        items: parsedData.items || [],
        documentMeta: {
          name: "PackingList_Proyecto.pdf",
          size: buffer.length,
          itemsCount: (parsedData.items || []).length,
          uploadedAt: new Date().toISOString(),
          dataBase64: dataBase64
        }
      })
    };

  } catch (error) {
    console.error('Error en parser multimodal:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message, items: [] })
    };
  }
};

export default handler;
