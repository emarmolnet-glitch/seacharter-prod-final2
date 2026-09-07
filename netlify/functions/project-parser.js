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
    // Usamos Gemini 2.5 Flash con capacidad multimodal (lee imágenes y PDFs visualmente como un humano)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const pdfBase64 = buffer.toString('base64');

    const prompt = `
      Eres el motor experto de inteligencia logística y fletamentos para SeaCharter Core PRO.
      Actúa como un sistema OCR avanzado y analista de documentos marítimos. Analiza visual y textualmente el documento PDF adjunto de principio a fin.
      
      INSTRUCCIONES DE EXTRACCIÓN:
      - Extrae exclusivamente la información real que aparezca en el documento. No inventes ni asumas datos.
      - Si el documento contiene una lista de empaque (packing list) o tabla de cargas, extrae cada fila real de carga con su respectiva cantidad, dimensiones y pesos si se indican.
      - Si es una factura, certificado o texto libre, extrae los elementos descritos basándote únicamente en el contenido visual o textual.

      Para cada ítem obtenido, extrae los siguientes campos (si un valor numérico o dimensión no se especifica en el documento, pon 0 o cadena vacía "" según corresponda):
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
    `;

    // Envío multimodal nativo: Gemini procesa el PDF completo visual y textualmente
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
    
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Error parseando JSON multimodal:", responseText);
      parsedData = { success: true, items: [] };
    }

    const dataBase64 = `data:application/pdf;base64,${pdfBase64}`;

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
    console.error('Error crítico en parser multimodal:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message, items: [] })
    };
  }
};

export default handler;
