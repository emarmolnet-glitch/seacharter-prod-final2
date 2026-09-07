import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

export async function handler(event, context) {
  // 1. Responder correctamente al preflight CORS del navegador
  if (event.httpMethod === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    });
  }

  if (event.httpMethod !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const rawBody = event.body || "";
    let pdfBase64 = "";
    let fileName = "Documento_Proyecto.pdf";

    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';

    // 2. Soporte dual: JSON o Multipart/form-data (FormData)
    if (contentType.includes('application/json')) {
      const body = JSON.parse(rawBody);
      const rawData = body.fileBase64 || body.pdfBase64 || body.data || ''; 
      if (!rawData) {
        return new Response(JSON.stringify({ success: false, error: 'No se encontró el archivo en el JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      fileName = body.fileName || fileName;
      const pureBase64 = rawData.includes(',') ? rawData.split(',')[1] : rawData;
      pdfBase64 = Buffer.from(pureBase64, 'base64').toString('base64');
    } else {
      // Extracción limpia para FormData / binario directo
      const bodyBuffer = event.isBase64Encoded 
        ? Buffer.from(rawBody, 'base64') 
        : Buffer.from(rawBody, 'binary');
      
      pdfBase64 = bodyBuffer.toString('base64');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Eres el motor experto de inteligencia logística y fletamentos para SeaCharter Core PRO.
      Analiza de forma exhaustiva el documento PDF adjunto. 
      Extrae exclusivamente la información real que aparezca en el documento. No inventes ni asumas datos que no estén escritos.
      - Si el documento tiene formato tabular o de packing list, extrae cada fila real de carga.
      - Si es un documento de texto libre, factura o certificado, extrae los elementos descritos basándote únicamente en el contenido.

      Para cada ítem obtenido, extrae los siguientes campos (si un valor numérico o dimensión no se especifica, pon 0 o cadena vacía "" según corresponda):
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
      parsedData = { success: true, items: [] };
    }

    const bufferFinal = Buffer.from(pdfBase64, 'base64');
    const fullDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    return new Response(JSON.stringify({
      success: true,
      items: parsedData.items || [],
      documentMeta: {
        name: fileName,
        size: bufferFinal.length,
        itemsCount: (parsedData.items || []).length,
        uploadedAt: new Date().toISOString(),
        dataBase64: fullDataUrl
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error crítico en project-parser:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Error interno del servidor', 
      items: [] 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

export default handler;
