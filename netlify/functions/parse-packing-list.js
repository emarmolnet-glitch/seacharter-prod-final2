import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export async function handler(req, context) {
  const method = req?.method || req?.httpMethod || '';

  // 1. Manejo estricto de CORS preflight: método OPTIONS devuelve status 204
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // 2. Aceptar exclusivamente el método POST para la ejecución principal
  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });
  }

  try {
    // 3. Extracción de cuerpo JSON
    let body = {};
    if (typeof req.json === 'function') {
      try {
        body = await req.json();
      } catch (e) {
        try {
          const txt = await req.text();
          body = JSON.parse(txt);
        } catch (_) {
          body = {};
        }
      }
    } else if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (_) {
        if (req.isBase64Encoded) {
          try {
            const decoded = Buffer.from(req.body, 'base64').toString('utf8');
            body = JSON.parse(decoded);
          } catch (_) {
            body = {};
          }
        } else {
          body = {};
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }

    const rawData = body.fileBase64 || body.pdfBase64 || body.data || body.file || '';
    const fileName = body.fileName || body.name || 'Documento_Proyecto.pdf';
    let mimeType = body.mimeType || body.type || 'application/pdf';

    if (!rawData || typeof rawData !== 'string' || !rawData.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No se encontró el archivo Base64 en el cuerpo de la petición.',
        items: [],
      }), {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    // Limpieza estricta de Base64 eliminando prefijos DataURL (ej: "data:application/pdf;base64,...") y espacios en blanco
    const pureBase64 = rawData.includes(',') ? rawData.split(',')[1].trim() : rawData.trim();
    const fileBuffer = Buffer.from(pureBase64, 'base64');
    if (!fileBuffer || fileBuffer.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'El archivo Base64 proporcionado está vacío o no es válido.',
        items: [],
      }), {
        status: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    // Detección de mimeType según extensión de archivo si es genérico
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (lowerName.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (lowerName.endsWith('.webp')) {
      mimeType = 'image/webp';
    } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
      mimeType = 'text/plain';
    }

    const apiKey = (typeof Netlify !== 'undefined' && Netlify.env?.get('GEMINI_API_KEY')) 
      || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY no configurada en las variables de entorno.');
      return new Response(JSON.stringify({
        success: false,
        error: 'GEMINI_API_KEY no configurada en el servidor.',
        items: [],
      }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = `Eres el motor experto de inteligencia logística, estiba y fletamentos marítimos para SeaCharter Core PRO.
Analiza exhaustivamente el documento adjunto.

APLICA UN FILTRADO INTELIGENTE EN TRES FASES ESTRICTAS:
1. ENCABEZADO: Identifica e ignora por completo los metadatos de la empresa emisora/receptora, fechas, números de contrato, referencias generales, direcciones, identificadores fiscales y logotipos. Ninguno de estos datos debe ser extraído como ítem de carga.
2. CUERPO DEL DOCUMENTO: Es la fuente principal donde se detalla la carga de forma tabular o descriptiva. Extrae con la máxima fidelidad y rigor técnico cada ítem o línea real de carga.
3. PIE DE PÁGINA / FINAL: Identifica e ignora los totales globales (ej. Total Bruto, Total Bultos, Sumas acumuladas, Peso Total General), notas legales, condiciones generales y firmas para evitar duplicidades de ítems.

REGLAS DE NEGOCIO ESTRICTAS PARA CADA ÍTEM EXTRAÍDO:
- category: Clasifica estrictamente el tipo de mercancía en una categoría logística profesional (ej: "Maquinaria", "Vehículo", "Equipos de Proceso", "Mercancía Paletizada", "Suministros", "Estructura Metálica"). Si no aparece, devuélvelo como "".
- type: Detalle exacto y profesional de la mercancía tal como aparece en el documento. Si no aparece, devuélvelo como "".
- quantity: Número de unidades (entero positivo). Si el documento agrupa varias líneas idénticas (mismo tipo, mismas dimensiones y mismo peso unitario), suma las cantidades de forma lógica; si tienen variaciones en dimensiones, peso o especificaciones, mantenlas como filas independientes. Por defecto 1 si no se indica.
- length: Medida en metros (número decimal). Si el documento indica dimensiones en centímetros o milímetros, conviértelas obligatoriamente a metros (ej: 6000 mm -> 6.0; 240 cm -> 2.4). Si hay múltiples elementos con distintas dimensiones, NUNCA los promedies: colócalos por separado con sus medidas reales en líneas distintas. Si no aparece, pon 0.
- width: Ancho en metros (número decimal). Si no aparece, pon 0.
- height: Alto en metros (número decimal). Si no aparece, pon 0.
- weight: Peso unitario en kilogramos (kg, número decimal o entero). Si en el documento viene expresado en toneladas (MT/t), conviértelo a kg multiplicando por 1000 (ej: 12.6 t -> 12600). Si hay varios elementos bajo la misma categoría o descripción pero con distinto peso real, respeta el peso independiente de cada línea (ESTÁ ESTRICTAMENTE PROHIBIDO unificar o promediar pesos si varían en el documento). Si no aparece el peso, pon obligatoriamente 0.
- shipping_mode_supported: Analiza el contexto del embalaje e indica el modo de transporte adecuado seleccionando estrictamente uno de los siguientes:
  * Si indica palets / mercancía suelta en estiba -> "Paletizado / Suelto"
  * Si indica dentro de contenedor (DV/HC) -> "Contenedor 20'/40'"
  * Si va sobre plataforma / flat rack -> "Plataforma / Flat Rack"
  * Si es maquinaria pesada sin contenedor -> "Breakbulk / Maquinaria Suelta"
  * Si es un vehículo / camión / furgoneta -> "Ro-Ro / Vehículo Rodado"
  (Si el documento no lo menciona explícitamente, dedúcelo de manera lógica según las dimensiones, peso y naturaleza descrita de la carga; si no se puede determinar, devuelve "").

CERO DATOS PREGRABADOS:
Está totalmente prohibido inventar datos o usar funciones de respaldo con datos fijos (como plantas desaladoras o ítems por defecto). Si un campo numérico no aparece en el documento, devuelve 0; si es texto, cadena vacía "". Todo debe salir exclusivamente de la lectura real del documento analizado. Si el documento no contiene partidas de carga, devuelve una lista de items vacía [].

Devuelve la respuesta EXCLUSIVAMENTE en formato JSON cumpliendo con esta estructura:
{
  "success": true,
  "items": [
    {
      "category": "Maquinaria",
      "type": "Excavadora sobre orugas CAT 320",
      "quantity": 1,
      "length": 8.9,
      "width": 2.98,
      "height": 3.15,
      "weight": 22500,
      "shipping_mode_supported": "Breakbulk / Maquinaria Suelta"
    }
  ]
}`;

    let contentParts;
    if (mimeType.startsWith('text/')) {
      const textContent = fileBuffer.toString('utf8');
      contentParts = [prompt, `Contenido del documento:\n${textContent}`];
    } else {
      contentParts = [
        prompt,
        {
          inlineData: {
            data: pureBase64,
            mimeType: mimeType,
          },
        },
      ];
    }

    const result = await model.generateContent(contentParts);
    const responseText = result.response.text();

    let parsedData = { success: true, items: [] };
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Error parseando JSON de respuesta de IA:', e);
      parsedData = { success: true, items: [] };
    }

    const rawItems = Array.isArray(parsedData?.items) ? parsedData.items : [];
    const items = rawItems.map((it, idx) => {
      const qty = Number(it.quantity);
      const len = Number(it.length);
      const wid = Number(it.width);
      const hgt = Number(it.height);
      const wt = Number(it.weight);

      const lengthVal = !isNaN(len) && len > 0 ? len : 0;
      const widthVal = !isNaN(wid) && wid > 0 ? wid : 0;
      const heightVal = !isNaN(hgt) && hgt > 0 ? hgt : 0;
      const weightVal = !isNaN(wt) && wt > 0 ? wt : 0;

      let shippingMode = typeof it.shipping_mode_supported === 'string' ? it.shipping_mode_supported.trim() : '';
      if (!shippingMode) {
        const desc = `${it.category || ''} ${it.type || ''}`.toLowerCase();
        if (desc.includes('palet') || desc.includes('pallet') || desc.includes('suelto') || desc.includes('colis') || desc.includes('caja')) {
          shippingMode = 'Paletizado / Suelto';
        } else if (desc.includes('camion') || desc.includes('camió') || desc.includes('cabeza') || desc.includes('tractor') || desc.includes('trailer') || desc.includes('furgoneta') || desc.includes('remolque') || desc.includes('vehiculo') || desc.includes('vehículo')) {
          shippingMode = 'Ro-Ro / Vehículo Rodado';
        } else if (desc.includes('flat rack') || desc.includes('plataforma') || desc.includes('mafi')) {
          shippingMode = 'Plataforma / Flat Rack';
        } else if (desc.includes('contenedor') || desc.includes('container') || desc.includes("20'") || desc.includes("40'")) {
          shippingMode = "Contenedor 20'/40'";
        } else if (weightVal > 15000 || len > 12 || wid > 2.5 || desc.includes('bastidor') || desc.includes('maquinaria') || desc.includes('grua') || desc.includes('grúa') || desc.includes('molino') || desc.includes('transformador')) {
          shippingMode = 'Breakbulk / Maquinaria Suelta';
        }
      }

      return {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        category: typeof it.category === 'string' ? it.category.trim() : '',
        type: typeof it.type === 'string' ? it.type.trim() : '',
        quantity: !isNaN(qty) && qty > 0 ? Math.round(qty) : 1,
        length: lengthVal,
        width: widthVal,
        height: heightVal,
        weight: weightVal,
        shipping_mode_supported: shippingMode,
        length_m: lengthVal,
        width_m: widthVal,
        height_m: heightVal,
        unit_weight_kg: weightVal,
      };
    });

    const fullDataUrl = `data:${mimeType};base64,${pureBase64}`;

    return new Response(JSON.stringify({
      success: true,
      items,
      documentMeta: {
        name: fileName,
        size: fileBuffer.length,
        itemsCount: items.length,
        uploadedAt: new Date().toISOString(),
        dataBase64: fullDataUrl,
      },
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Error crítico en parse-packing-list:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Error interno del servidor al procesar el documento',
      items: [],
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    });
  }
}

export default handler;
