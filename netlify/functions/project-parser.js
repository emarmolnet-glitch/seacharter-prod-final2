import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const VALID_SHIPPING_MODES = [
  'Paletizado / Suelto',
  "Contenedor 20'/40'",
  'Plataforma / Flat Rack',
  'Breakbulk / Maquinaria Suelta',
  'Ro-Ro / Vehículo Rodado',
];

function normalizeShippingMode(rawMode, desc = '', weightVal = 0, len = 0, wid = 0) {
  if (typeof rawMode === 'string') {
    const trimmed = rawMode.trim();
    if (VALID_SHIPPING_MODES.includes(trimmed)) {
      return trimmed;
    }
    const lower = trimmed.toLowerCase();
    if (lower.includes('palet') || lower.includes('pallet') || lower.includes('suelto') || lower.includes('loose')) {
      return 'Paletizado / Suelto';
    }
    if (lower.includes('contenedor') || lower.includes('container') || lower.includes("20'") || lower.includes("40'")) {
      return "Contenedor 20'/40'";
    }
    if (lower.includes('plataforma') || lower.includes('flat rack') || lower.includes('flatrack') || lower.includes('mafi')) {
      return 'Plataforma / Flat Rack';
    }
    if (lower.includes('ro-ro') || lower.includes('roro') || lower.includes('vehiculo') || lower.includes('vehículo') || lower.includes('rodado')) {
      return 'Ro-Ro / Vehículo Rodado';
    }
    if (lower.includes('breakbulk') || lower.includes('break bulk') || lower.includes('maquinaria') || lower.includes('heavy')) {
      return 'Breakbulk / Maquinaria Suelta';
    }
  }

  // Deducción logística contextual multilingüe (ES, EN, FR, DE, CA, IT, PT)
  const d = (desc || '').toLowerCase();
  if (
    d.includes('palet') || d.includes('pallet') || d.includes('palette') || d.includes('palete') ||
    d.includes('suelto') || d.includes('loose') || d.includes('colis') || d.includes('vrac') ||
    d.includes('caja') || d.includes('caisse') || d.includes('kiste') || d.includes('scatola') ||
    d.includes('fardo') || d.includes('bulto') || d.includes('collo') || d.includes('embalum')
  ) {
    return 'Paletizado / Suelto';
  }

  if (
    d.includes('camion') || d.includes('camió') || d.includes('caminhão') || d.includes('cabeza') ||
    d.includes('tractor') || d.includes('trailer') || d.includes('remolque') || d.includes('anhänger') ||
    d.includes('semirremolque') || d.includes('semi-trailer') || d.includes('furgoneta') || d.includes('van') ||
    d.includes('vehiculo') || d.includes('vehículo') || d.includes('veicolo') || d.includes('veículo') ||
    d.includes('autocarro') || d.includes('autoarticolato') || d.includes('lkw') || d.includes('zugmaschine') ||
    d.includes('cavalo mecânico') || d.includes('chassis') || d.includes('châssis') || d.includes('dumper') ||
    d.includes('dúmper') || d.includes('tombereau') || d.includes('kipper')
  ) {
    return 'Ro-Ro / Vehículo Rodado';
  }

  if (
    d.includes('flat rack') || d.includes('flatrack') || d.includes('flat-rack') ||
    d.includes('plataforma') || d.includes('platform') || d.includes('pritsche') || d.includes('mafi')
  ) {
    return 'Plataforma / Flat Rack';
  }

  if (
    d.includes('contenedor') || d.includes('container') || d.includes('conteneur') ||
    d.includes("20'") || d.includes("40'") || d.includes('high cube') || d.includes('open top')
  ) {
    return "Contenedor 20'/40'";
  }

  if (
    weightVal > 15000 || len > 12 || wid > 2.5 ||
    d.includes('bastidor') || d.includes('skid') || d.includes('maquinaria') || d.includes('machinery') ||
    d.includes('grua') || d.includes('grúa') || d.includes('crane') || d.includes('kran') ||
    d.includes('guindaste') || d.includes('molino') || d.includes('transformador') || d.includes('transformer') ||
    d.includes('transformateur') || d.includes('excavadora') || d.includes('excavator') || d.includes('bagger') ||
    d.includes('pelle') || d.includes('escavatore') || d.includes('escavadeira') || d.includes('generador') ||
    d.includes('generator') || d.includes('turbina') || d.includes('turbine')
  ) {
    return 'Breakbulk / Maquinaria Suelta';
  }

  return '';
}

function detectFileMimeType(fileName, buffer, headerContentType) {
  if (buffer && buffer.length >= 4) {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'image/jpeg';
    }
    if (buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
  }

  if (headerContentType && !headerContentType.includes('application/octet-stream') && !headerContentType.includes('multipart')) {
    const cleanHeader = headerContentType.split(';')[0].trim();
    if (cleanHeader) return cleanHeader;
  }

  const lowerName = (fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) return 'text/plain';

  return 'application/pdf';
}

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
    const rawContentType = (
      (typeof req?.headers?.get === 'function' ? req.headers.get('content-type') : null) ||
      req?.headers?.['content-type'] ||
      req?.headers?.['Content-Type'] ||
      ''
    );
    const contentType = rawContentType.toLowerCase();

    let headerFileName = (
      (typeof req?.headers?.get === 'function' ? (req.headers.get('x-file-name') || req.headers.get('content-disposition')) : null) ||
      req?.headers?.['x-file-name'] ||
      req?.headers?.['X-File-Name'] ||
      req?.headers?.['content-disposition'] ||
      ''
    );
    if (headerFileName.includes('filename=')) {
      const match = headerFileName.match(/filename=["']?([^"';]+)["']?/i);
      if (match && match[1]) {
        headerFileName = match[1].trim();
      }
    }

    // 3. Soportar lectura dual de entrada (JSON con Base64 o flujo binario directo)
    let body = null;
    let isJsonRequest = false;

    if (contentType.includes('application/json')) {
      isJsonRequest = true;
      if (typeof req.json === 'function') {
        try {
          body = await req.json();
        } catch (_) {
          body = null;
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
              body = null;
            }
          }
        }
      } else if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        body = req.body;
      }
    }

    let fileBuffer = null;
    let pureBase64 = '';
    let fileName = headerFileName || 'Documento_Proyecto.pdf';
    let mimeType = '';

    if (isJsonRequest || (body && typeof body === 'object')) {
      const rawData = body?.fileBase64 ?? body?.pdfBase64 ?? body?.data ?? body?.file ?? '';
      fileName = body?.fileName || body?.name || headerFileName || 'Documento_Proyecto.pdf';
      mimeType = body?.mimeType || body?.type || '';

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
      pureBase64 = rawData.includes(',') ? rawData.split(',')[1].trim() : rawData.trim();
      fileBuffer = Buffer.from(pureBase64, 'base64');

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
    } else {
      // Lectura de flujo binario directo
      let rawBinaryBuffer = null;
      if (typeof req.arrayBuffer === 'function') {
        try {
          const ab = await req.arrayBuffer();
          if (ab && ab.byteLength > 0) {
            rawBinaryBuffer = Buffer.from(ab);
          }
        } catch (_) {}
      } else if (Buffer.isBuffer(req.body)) {
        rawBinaryBuffer = req.body;
      } else if (typeof req.body === 'string') {
        if (req.isBase64Encoded) {
          try {
            rawBinaryBuffer = Buffer.from(req.body, 'base64');
          } catch (_) {}
        } else {
          rawBinaryBuffer = Buffer.from(req.body, 'binary');
        }
      }

      // Comprobar si el flujo binario recibido era en realidad un JSON sin cabecera Content-Type
      if (rawBinaryBuffer && rawBinaryBuffer.length > 0) {
        try {
          const textCandidate = rawBinaryBuffer.toString('utf8').trim();
          if (textCandidate.startsWith('{') && textCandidate.endsWith('}')) {
            const parsed = JSON.parse(textCandidate);
            if (parsed && typeof parsed === 'object') {
              body = parsed;
              const rawData = body.fileBase64 || body.pdfBase64 || body.data || body.file || '';
              fileName = body.fileName || body.name || headerFileName || 'Documento_Proyecto.pdf';
              mimeType = body.mimeType || body.type || '';

              if (rawData && typeof rawData === 'string' && rawData.trim()) {
                pureBase64 = rawData.includes(',') ? rawData.split(',')[1].trim() : rawData.trim();
                fileBuffer = Buffer.from(pureBase64, 'base64');
              }
            }
          }
        } catch (_) {}
      }

      if (!fileBuffer) {
        if (!rawBinaryBuffer || rawBinaryBuffer.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No se encontró el archivo Base64 o flujo binario en el cuerpo de la petición.',
            items: [],
          }), {
            status: 400,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
            },
          });
        }
        fileBuffer = rawBinaryBuffer;
        pureBase64 = fileBuffer.toString('base64');
      }
    }

    mimeType = detectFileMimeType(fileName, fileBuffer, rawContentType);

    const apiKey = (typeof Netlify !== 'undefined' && (Netlify.env?.get?.('GEMINI_API_KEY') || Netlify.env?.get?.('GOOGLE_API_KEY') || Netlify.env?.get?.('GOOGLE_GENAI_API_KEY')))
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.GOOGLE_GENAI_API_KEY;

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

DETECCIÓN AUTOMÁTICA DE IDIOMAS Y NORMALIZACIÓN LOGÍSTICA:
Detecta automáticamente el idioma de origen del documento (inglés, francés, alemán, catalán, italiano, portugués o español).
Traduce y normaliza obligatoriamente todos los términos técnicos, descripciones de mercancías, categorías y tipos de embalaje al ESPAÑOL profesional de la logística marítima y portuaria (por ejemplo: 'digger/excavator' -> 'Excavadora', 'tombereau' -> 'Dúmper / Camión volquete', 'Radlader' -> 'Pala cargadora sobre ruedas', 'carró' -> 'Carro / Remolque', 'trattore stradale' -> 'Cabeza tractora', 'guindaste' -> 'Grúa'). Todos los valores de 'category' y 'type' deben entregarse obligatoriamente normalizados en español.

APLICA UN FILTRADO INTELIGENTE EN TRES FASES ESTRICTAS:
1. ENCABEZADO: Identifica e ignora por completo los metadatos de la empresa emisora/receptora, fechas, números de contrato, referencias generales, direcciones, identificadores fiscales y logotipos. Ninguno de estos datos debe ser extraído como ítem de carga.
2. CUERPO DEL DOCUMENTO: Es la fuente principal donde se detalla la carga de forma tabular o descriptiva. Extrae con la máxima fidelidad y rigor técnico cada ítem o línea real de carga.
3. PIE DE PÁGINA / FINAL: Identifica e ignora los totales globales (ej. Total Bruto, Total Bultos, Sumas acumuladas, Peso Total General), notas legales, condiciones generales y firmas para evitar duplicidades de ítems.

REGLAS DE NEGOCIO ESTRICTAS PARA CADA ÍTEM EXTRAÍDO:
- category: Clasifica estrictamente el tipo de mercancía en una categoría logística profesional en español (ej: "Maquinaria", "Vehículo", "Equipos de Proceso", "Mercancía Paletizada", "Suministros", "Estructura Metálica"). Si no aparece, devuélvelo como "".
- type: Detalle exacto y profesional de la mercancía tal como aparece en el documento, traducido y normalizado al español. Si no aparece, devuélvelo como "".
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

      const desc = `${it.category || ''} ${it.type || ''}`.trim();
      const shippingMode = normalizeShippingMode(it.shipping_mode_supported, desc, weightVal, lengthVal, widthVal);

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
    console.error('Error crítico en project-parser:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Error interno del servidor al procesar el documento',
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
