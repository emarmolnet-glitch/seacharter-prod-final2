import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

export async function handler(event, context) {
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
    let fullDataUrl = "";

    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';

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
      fullDataUrl = rawData.startsWith('data:') ? rawData : `data:application/pdf;base64,${rawData}`;
      const pureBase64 = rawData.includes(',') ? rawData.split(',')[1] : rawData;
      const buffer = Buffer.from(pureBase64, 'base64');
      pdfBase64 = buffer.toString('base64');
    } else {
      // Soporte robusto si llega por form-data o binario directo
      const buffer = Buffer.from(rawBody, event.isBase64Encoded ? 'base64' : 'utf8');
      pdfBase64 = buffer.toString('base64');
      fullDataUrl = `data:application/pdf;base64,${pdfBase64}`;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      Eres el motor experto de inteligencia logística y fletamentos para SeaCharter Core PRO.
      Analiza de forma exhaustiva el documento adjunto. 
      Extrae exclusivamente la información real que aparezca en el documento. Está estrictamente prohibido usar datos de ejemplo, inventar piezas o rellenar con valores pregrabados.
      - Si el documento tiene formato tabular o de packing list, extrae cada fila real de carga.
      - Si es un documento de texto libre, factura o certificado, extrae los elementos descritos basándote únicamente en el contenido real.

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

    // Mapeo seguro de IDs para compatibilidad con la interfaz
    const items = (parsedData.items || []).map((it, idx) => ({
      id: Date.now() + idx + Math.random(),
      quantity: it.quantity || 1,
      type: it.type || 'Ítem Documental',
      length: it.length || '',
      width: it.width || '',
      height: it.height || '',
      weight: it.weight || 0,
      category: it.category || '',
      shipping_mode_supported: it.shipping_mode_supported || '',
      length_m: it.length || '',
      width_m: it.width || '',
      height_m: it.height || '',
      unit_weight_kg: it.weight || 0
    }));

    return new Response(JSON.stringify({
      success: true,
      filename,
      count: items.length,
      items,
      documentMeta: {
        name: fileName,
        size: Buffer.from(pdfBase64, 'base64').length,
        itemsCount: items.length,
        uploadedAt: new Date().toISOString(),
        dataBase64: fullDataUrl
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('Error crítico en parse-packing-list handler:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Error interno del servidor',
      count: 0,
      items: []
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

export default handler;
