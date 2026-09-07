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
      const pureBase64 = rawData.includes(',') ? rawData.split(',')[1] : rawData;
      pdfBase64 = Buffer.from(pureBase64, 'base64').toString('base64');
    } else {
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
      Analiza exhaustivamente el documento adjunto distinguiendo claramente entre:
      - **Encabezado**: Datos de la empresa, fechas, referencias y metadatos generales (deben ignorarse para la tabla de cargas).
      - **Cuerpo del archivo**: Detalle tabular o descriptivo de las mercancías (es el núcleo que debes extraer).
      - **Final / Pie de página**: Totales generales o notas legales (pueden usarse para contraste pero no como ítems individuales).

      REGLAS ESTRICTAS DE EXTRACCIÓN Y LÓGICA LOGÍSTICA:
      1. **Categoría (category)**: Identifica con precisión si se trata de Maquinaria, Vehículo, Equipos de Proceso, Mercancía Paletizada, Suministros, etc.
      2. **Descripción (type)**: Extrae el detalle exacto y completo de la mercancía.
      3. **Cantidad (quantity)**: Número de unidades. Si se repiten o agrupan, refleja la cantidad real de piezas.
      4. **Dimensiones (length, width, height)**: Largo, ancho y alto en metros. Si hay variaciones entre elementos similares, mantenlos en filas separadas con sus medidas reales.
      5. **Peso Unitario (weight)**: Peso en kilogramos. **Atención**: Aunque dos mercancías compartan categoría y descripción general, respeta el peso específico indicado para cada una si difieren entre sí (no unifiques pesos por promedio).
      6. **Modo de Envío (shipping_mode_supported)**: Deduce el tipo de estiba o transporte según el texto del documento (ej: "Contenedor", "Palet", "Plataforma / Flat Rack", "Suelto / Breakbulk", "Vehículo / Ro-Ro"). Si el documento no lo especifica de forma directa, dedúcelo de manera lógica según las características de la carga.

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

    const bufferFinal = Buffer.from(pdfBase64, 'base64');
    const fullDataUrl = `data:application/pdf;base64,${pdfBase64}`;

    return new Response(JSON.stringify({
      success: true,
      items,
      documentMeta: {
        name: fileName,
        size: bufferFinal.length,
        itemsCount: items.length,
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
