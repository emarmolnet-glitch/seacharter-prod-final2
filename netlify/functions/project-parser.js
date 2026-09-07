import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const VALID_CATEGORIES = [
  'Mercancía Ensacada / Dry Bulk',
  'Maquinaria / Equipos Industriales',
  'Vehículo / Unidades Rodadas',
  'Estructura Metálica',
  'Carga General / General Cargo',
  'Suministros / Supplies',
];

const VALID_SHIPPING_MODES = [
  'Big Bags / Granel',
  'Contenedor (FCL / LCL)',
  'Breakbulk / Maquinaria Suelta',
  'Plataforma / Flat Rack',
  'Ro-Ro / Vehículo Rodado',
];

function normalizeStr(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hasWord(str, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(str);
}

function normalizeCategory(rawCategory, desc = '', type = '') {
  if (typeof rawCategory === 'string') {
    const trimmed = rawCategory.trim();
    if (VALID_CATEGORIES.includes(trimmed)) {
      return trimmed;
    }
  }

  const combined = normalizeStr(`${rawCategory || ''} ${type || ''} ${desc || ''}`);

  // 1. Mercancía Ensacada / Dry Bulk
  if (
    combined.includes('ensacad') || combined.includes('dry bulk') || hasWord(combined, 'bulk') ||
    combined.includes('granel') || combined.includes('big bag') || combined.includes('bigbag') ||
    combined.includes('fibc') || combined.includes('saco') || combined.includes('cereal') ||
    combined.includes('trigo') || hasWord(combined, 'wheat') || combined.includes('maiz') ||
    hasWord(combined, 'corn') || combined.includes('cebada') || hasWord(combined, 'barley') ||
    hasWord(combined, 'soja') || hasWord(combined, 'soya') || combined.includes('grano') ||
    hasWord(combined, 'grain') || combined.includes('cemento') || hasWord(combined, 'cement') ||
    combined.includes('clinker') || combined.includes('clinquer') || combined.includes('yeso') ||
    combined.includes('gypsum') || hasWord(combined, 'cal') || hasWord(combined, 'lime') ||
    combined.includes('fertilizante') || combined.includes('fertilizer') || combined.includes('abono') ||
    combined.includes('urea') || combined.includes('pellet') || combined.includes('biomasa') ||
    combined.includes('carbon') || hasWord(combined, 'coal') || combined.includes('mineral') ||
    combined.includes('bauxita') || hasWord(combined, 'arena') || hasWord(combined, 'sand') ||
    combined.includes('grava') || hasWord(combined, 'gravel') || hasWord(combined, 'vrac')
  ) {
    return 'Mercancía Ensacada / Dry Bulk';
  }

  // 2. Estructura Metálica
  if (
    combined.includes('estructura metalica') || combined.includes('estructura de acero') ||
    combined.includes('steel structure') || combined.includes('metal structure') ||
    combined.includes('viga') || hasWord(combined, 'beam') || hasWord(combined, 'beams') || combined.includes('girder') ||
    hasWord(combined, 'pilar') || combined.includes('perfil') || combined.includes('profile') ||
    combined.includes('tuberia') || combined.includes('tuberias') || hasWord(combined, 'pipe') ||
    hasWord(combined, 'pipes') || combined.includes('pipeline') || hasWord(combined, 'tubo') ||
    hasWord(combined, 'tubos') || hasWord(combined, 'chapa') || hasWord(combined, 'chapas') ||
    combined.includes('steel plate') || combined.includes('bobina de acero') || combined.includes('steel coil') ||
    combined.includes('bobina') || hasWord(combined, 'coil') || hasWord(combined, 'coils') ||
    combined.includes('varilla') || combined.includes('rebar') || combined.includes('alambron') ||
    combined.includes('hierro') || hasWord(combined, 'iron') || combined.includes('acero') ||
    hasWord(combined, 'steel') || hasWord(combined, 'stahl') || hasWord(combined, 'acier') ||
    hasWord(combined, 'ferro') || hasWord(combined, 'aco') || combined.includes('cercha') ||
    combined.includes('celosia') || combined.includes('truss') || combined.includes('torre metalica') ||
    combined.includes('andamio') || combined.includes('scaffolding') || combined.includes('pasarela metalica') ||
    hasWord(combined, 'metal') || hasWord(combined, 'siderurgico') || hasWord(combined, 'estructura')
  ) {
    return 'Estructura Metálica';
  }

  // 3. Vehículo / Unidades Rodadas
  if (
    combined.includes('vehiculo') || combined.includes('vehicle') || combined.includes('unidad rodada') ||
    combined.includes('unidades rodadas') || combined.includes('rodado') || combined.includes('rodada') ||
    combined.includes('rolling unit') || combined.includes('automovil') || hasWord(combined, 'coche') ||
    hasWord(combined, 'auto') || combined.includes('camion') || hasWord(combined, 'truck') ||
    hasWord(combined, 'lkw') || combined.includes('autocarro') || combined.includes('caminhao') ||
    combined.includes('cabeza tractora') || combined.includes('tractora') || combined.includes('tractor unit') ||
    combined.includes('zugmaschine') || combined.includes('cavalo mecanico') || combined.includes('remolque') ||
    hasWord(combined, 'trailer') || combined.includes('anhanger') || combined.includes('semirremolque') ||
    combined.includes('semi-trailer') || combined.includes('furgoneta') || hasWord(combined, 'van') ||
    hasWord(combined, 'vans') || combined.includes('fourgonnette') || combined.includes('autobus') ||
    hasWord(combined, 'bus') || combined.includes('autocar') || combined.includes('dumper') ||
    combined.includes('tombereau') || combined.includes('kipper') || combined.includes('volquete') ||
    combined.includes('chasis') || combined.includes('chassis') || combined.includes('ro-ro') ||
    combined.includes('roro')
  ) {
    return 'Vehículo / Unidades Rodadas';
  }

  // 4. Suministros / Supplies
  if (
    combined.includes('suministro') || combined.includes('supplies') || hasWord(combined, 'supply') ||
    combined.includes('repuesto') || combined.includes('spare part') || hasWord(combined, 'spare') ||
    hasWord(combined, 'spares') || combined.includes('recambio') || combined.includes('herramienta') ||
    hasWord(combined, 'tool') || hasWord(combined, 'tools') || combined.includes('ferreteria') ||
    combined.includes('hardware') || combined.includes('valvula') || hasWord(combined, 'valve') ||
    hasWord(combined, 'valves') || combined.includes('filtro') || hasWord(combined, 'filter') ||
    hasWord(combined, 'filters') || combined.includes('tornillo') || combined.includes('tuerca') ||
    combined.includes('perno') || hasWord(combined, 'bolt') || hasWord(combined, 'bolts') ||
    hasWord(combined, 'screw') || hasWord(combined, 'screws') || hasWord(combined, 'nut') ||
    hasWord(combined, 'nuts') || hasWord(combined, 'cable') || hasWord(combined, 'cables') ||
    combined.includes('wiring') || combined.includes('rodamiento') || combined.includes('bearing') ||
    combined.includes('junta') || combined.includes('gasket') || hasWord(combined, 'seal') ||
    hasWord(combined, 'seals') || combined.includes('consumible') || combined.includes('avituallamiento') ||
    combined.includes('provision') || combined.includes('lubricante') || hasWord(combined, 'aceite') ||
    combined.includes('accesorio') || combined.includes('fitting')
  ) {
    return 'Suministros / Supplies';
  }

  // 5. Maquinaria / Equipos Industriales
  if (
    combined.includes('maquinaria') || combined.includes('machinery') || combined.includes('machine') ||
    combined.includes('maquina') || combined.includes('equipo industrial') || combined.includes('equipos industriales') ||
    combined.includes('industrial equipment') || combined.includes('equipos de proceso') || combined.includes('equipo de proceso') ||
    combined.includes('process equipment') || combined.includes('transformador') || combined.includes('transformer') ||
    combined.includes('transformateur') || combined.includes('generador') || combined.includes('generator') ||
    combined.includes('genset') || combined.includes('turbina') || combined.includes('turbine') ||
    combined.includes('caldera') || combined.includes('boiler') || combined.includes('chaudiere') ||
    combined.includes('compresor') || combined.includes('compressor') || combined.includes('bomba') ||
    hasWord(combined, 'pump') || hasWord(combined, 'pumps') || combined.includes('motor') ||
    hasWord(combined, 'engine') || combined.includes('excavadora') || combined.includes('excavator') ||
    combined.includes('bagger') || combined.includes('pelle') || combined.includes('escavatore') ||
    combined.includes('escavadeira') || combined.includes('pala cargadora') || combined.includes('wheel loader') ||
    combined.includes('radlader') || combined.includes('grua') || hasWord(combined, 'crane') ||
    hasWord(combined, 'kran') || combined.includes('guindaste') || combined.includes('molino') ||
    combined.includes('crusher') || combined.includes('trituradora') || combined.includes('chancadora') ||
    combined.includes('bastidor') || combined.includes('skid') || combined.includes('osmosis') ||
    combined.includes('prensa') || hasWord(combined, 'torno') || combined.includes('fresadora') ||
    combined.includes('reactor') || combined.includes('intercambiador') || combined.includes('planta') ||
    combined.includes('heavy equipment')
  ) {
    return 'Maquinaria / Equipos Industriales';
  }

  // 6. Carga General / General Cargo (default y para mercancía suelta/palets/cajas)
  return 'Carga General / General Cargo';
}

function normalizeShippingMode(rawMode, desc = '', weightVal = 0, len = 0, wid = 0, heightVal = 0, category = '') {
  if (typeof rawMode === 'string') {
    const trimmed = rawMode.trim();
    if (VALID_SHIPPING_MODES.includes(trimmed)) {
      return trimmed;
    }

    const m = normalizeStr(trimmed);

    // Ro-Ro / Vehículo Rodado
    if (
      m.includes('ro-ro') || m.includes('roro') || m.includes('rodad') ||
      m.includes('vehiculo') || m.includes('rolling')
    ) {
      return 'Ro-Ro / Vehículo Rodado';
    }

    // Plataforma / Flat Rack
    if (
      m.includes('plataforma') || m.includes('flat rack') || m.includes('flatrack') ||
      m.includes('flat-rack') || m.includes('mafi') || m.includes('platform')
    ) {
      return 'Plataforma / Flat Rack';
    }

    // Contenedor (FCL / LCL) - detectado antes de "suelto" para evitar que "Paletizado / Suelto" caiga en Breakbulk
    if (
      m.includes('contenedor') || m.includes('container') || m.includes('fcl') ||
      m.includes('lcl') || m.includes("20'") || m.includes("40'") ||
      m.includes('palet') || m.includes('pallet')
    ) {
      return 'Contenedor (FCL / LCL)';
    }

    // Breakbulk / Maquinaria Suelta (evaluado antes de "bulk" para evitar falsos positivos con "breakbulk")
    if (
      m.includes('breakbulk') || m.includes('break bulk') || m.includes('break-bulk') ||
      m.includes('maquinaria suelta') || m.includes('carga suelta') || m.includes('heavy lift') ||
      (!m.includes('palet') && (hasWord(m, 'suelto') || hasWord(m, 'suelta') || hasWord(m, 'loose')))
    ) {
      return 'Breakbulk / Maquinaria Suelta';
    }

    // Big Bags / Granel
    if (
      m.includes('big bag') || m.includes('bigbag') || m.includes('granel') ||
      m.includes('dry bulk') || hasWord(m, 'bulk') || m.includes('saco') ||
      m.includes('fibc') || hasWord(m, 'vrac') || m.includes('ensacad')
    ) {
      return 'Big Bags / Granel';
    }
  }

  // Deducción contextual multilingüe (ES, EN, FR, DE, CA, IT, PT) y por parámetros físicos
  const d = normalizeStr(`${desc || ''} ${category || ''}`);

  // 1. Vehículos o unidades rodadas (incluso pesados como dumpers o camiones de 30t van por Ro-Ro)
  if (
    category === 'Vehículo / Unidades Rodadas' ||
    d.includes('camion') || d.includes('camio') || d.includes('caminhao') || d.includes('cabeza tractora') ||
    d.includes('tractor') || hasWord(d, 'trailer') || d.includes('remolque') || d.includes('anhanger') ||
    d.includes('semirremolque') || d.includes('semi-trailer') || d.includes('furgoneta') || hasWord(d, 'van') ||
    d.includes('vehiculo') || d.includes('veicolo') || d.includes('veiculo') || d.includes('autocarro') ||
    d.includes('autoarticolato') || hasWord(d, 'lkw') || d.includes('zugmaschine') || d.includes('cavalo mecanico') ||
    d.includes('chassis') || d.includes('dumper') || d.includes('tombereau') || d.includes('kipper') ||
    d.includes('volquete') || d.includes('automovil') || hasWord(d, 'coche') || d.includes('autobus') || hasWord(d, 'bus')
  ) {
    return 'Ro-Ro / Vehículo Rodado';
  }

  // 2. Plataforma / Flat Rack explícito en descripción o contexto
  if (
    d.includes('flat rack') || d.includes('flatrack') || d.includes('flat-rack') ||
    d.includes('plataforma') || d.includes('platform') || d.includes('pritsche') || d.includes('mafi')
  ) {
    return 'Plataforma / Flat Rack';
  }

  // 3. Granel y sacos / Big Bags
  if (
    category === 'Mercancía Ensacada / Dry Bulk' ||
    d.includes('big bag') || d.includes('bigbag') || d.includes('granel') || d.includes('dry bulk') ||
    hasWord(d, 'bulk') || d.includes('saco') || d.includes('fibc') || hasWord(d, 'vrac') || d.includes('ensacad')
  ) {
    return 'Big Bags / Granel';
  }

  // 4. Breakbulk / Maquinaria Suelta por peso o dimensiones sobredimensionadas (maquinaria, transformadores, turbinas, vigas largas)
  if (
    weightVal > 15000 || len > 12 || wid > 2.5 || heightVal > 2.6 ||
    d.includes('bastidor') || d.includes('skid') || d.includes('maquinaria') || d.includes('machinery') ||
    d.includes('grua') || hasWord(d, 'crane') || hasWord(d, 'kran') || d.includes('guindaste') ||
    d.includes('molino') || d.includes('transformador') || d.includes('transformer') ||
    d.includes('transformateur') || d.includes('excavadora') || d.includes('excavator') ||
    d.includes('bagger') || d.includes('pelle') || d.includes('escavatore') || d.includes('escavadeira') ||
    d.includes('generador') || d.includes('generator') || d.includes('turbina') || d.includes('turbine') ||
    d.includes('caldera') || d.includes('breakbulk') || d.includes('break bulk') || d.includes('heavy lift')
  ) {
    return 'Breakbulk / Maquinaria Suelta';
  }

  // 5. Contenedor (FCL / LCL) para cajas, palets, suministros o carga general estandarizada
  return 'Contenedor (FCL / LCL)';
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
      let rawData = body?.fileBase64 ?? body?.pdfBase64 ?? body?.data ?? body?.file ?? '';
      fileName = body?.fileName || body?.name || headerFileName || 'Documento_Proyecto.pdf';
      mimeType = body?.mimeType || body?.type || '';

      if ((!rawData || typeof rawData !== 'string' || !rawData.trim()) && (body?.text || body?.content || body?.description)) {
        const textStr = String(body.text || body.content || body.description);
        rawData = Buffer.from(textStr, 'utf8').toString('base64');
        if (!mimeType) mimeType = 'text/plain';
        fileName = fileName || 'input.txt';
      }

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
- category: Clasifica OBLIGATORIAMENTE la mercancía en una de las siguientes categorías oficiales del catálogo controlado (ESTÁ ESTRICTAMENTE PROHIBIDO generar valores personalizados fuera de estos catálogos):
  * "Mercancía Ensacada / Dry Bulk" (para mercancías ensacadas, sacos, big bags, graneles secos, minerales, cereales, etc.)
  * "Maquinaria / Equipos Industriales" (para maquinaria de construcción, equipos industriales, equipos de proceso, transformadores, generadores, turbinas, etc.)
  * "Vehículo / Unidades Rodadas" (para camiones, cabezas tractoras, remolques, turismos, furgonetas, dumpers, etc.)
  * "Estructura Metálica" (para vigas, perfiles, tubos, tuberías, bobinas de acero, celosías, etc.)
  * "Carga General / General Cargo" (para carga general, mercancía paletizada, cajas, bultos estándar, etc.)
  * "Suministros / Supplies" (para repuestos, herramientas, consumibles, accesorios, ferretería, etc.)
  Si no se puede determinar, clasifícalo obligatoriamente en "Carga General / General Cargo".
- type: Detalle exacto y profesional de la mercancía tal como aparece en el documento, traducido y normalizado al español. Si no aparece, devuélvelo como "".
- quantity: Número de unidades (entero positivo). Si el documento agrupa varias líneas idénticas (mismo tipo, mismas dimensiones y mismo peso unitario), suma las cantidades de forma lógica; si tienen variaciones en dimensiones, peso o especificaciones, mantenlas como filas independientes. Por defecto 1 si no se indica.
- length: Medida en metros (número decimal). Si el documento indica dimensiones en centímetros o milímetros, conviértelas obligatoriamente a metros (ej: 6000 mm -> 6.0; 240 cm -> 2.4). Si hay múltiples elementos con distintas dimensiones, NUNCA los promedies: colócalos por separado con sus medidas reales en líneas distintas. Si no aparece, pon 0.
- width: Ancho en metros (número decimal). Si no aparece, pon 0.
- height: Alto en metros (número decimal). Si no aparece, pon 0.
- weight: Peso unitario en kilogramos (kg, número decimal o entero). Si en el documento viene expresado en toneladas (MT/t), conviértelo a kg multiplicando por 1000 (ej: 12.6 t -> 12600). Si hay varios elementos bajo la misma categoría o descripción pero con distinto peso real, respeta el peso independiente de cada línea (ESTÁ ESTRICTAMENTE PROHIBIDO unificar o promediar pesos si varían en el documento). Si no aparece el peso, pon obligatoriamente 0.
- shipping_mode_supported: Clasifica OBLIGATORIAMENTE el modo de transporte adecuado seleccionando estrictamente uno de los siguientes valores oficiales del catálogo controlado (ESTÁ ESTRICTAMENTE PROHIBIDO generar valores personalizados fuera de estos catálogos):
  * "Big Bags / Granel" (para big bags, sacos, graneles secos, ensacados)
  * "Contenedor (FCL / LCL)" (para contenedores FCL/LCL, mercancía paletizada o en cajas contenerizable)
  * "Breakbulk / Maquinaria Suelta" (para maquinaria pesada, piezas sobredimensionadas, carga suelta de proyecto)
  * "Plataforma / Flat Rack" (para equipos que requieren plataforma, flat rack o mafi trailer)
  * "Ro-Ro / Vehículo Rodado" (para vehículos rodados, camiones, unidades autopropulsadas o remolques)
  (Si el documento no lo menciona explícitamente, dedúcelo de manera lógica según las dimensiones, peso y naturaleza descrita de la carga, seleccionando obligatoriamente uno de estos 5 valores oficiales).

CERO DATOS PREGRABADOS:
Está totalmente prohibido inventar datos o usar funciones de respaldo con datos fijos (como plantas desaladoras o ítems por defecto). Si un campo numérico no aparece en el documento, devuelve 0; si es texto, cadena vacía "". Todo debe salir exclusivamente de la lectura real del documento analizado. Si el documento no contiene partidas de carga, devuelve una lista de items vacía [].

Devuelve la respuesta EXCLUSIVAMENTE en formato JSON cumpliendo con esta estructura:
{
  "success": true,
  "items": [
    {
      "category": "Maquinaria / Equipos Industriales",
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

      const rawCategory = typeof it.category === 'string' ? it.category.trim() : '';
      const typeVal = typeof it.type === 'string' ? it.type.trim() : '';
      const desc = `${rawCategory} ${typeVal}`.trim();

      const category = normalizeCategory(rawCategory, desc, typeVal);
      const shippingMode = normalizeShippingMode(it.shipping_mode_supported, desc, weightVal, lengthVal, widthVal, heightVal, category);

      return {
        id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        category,
        type: typeVal,
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

handler.VALID_CATEGORIES = VALID_CATEGORIES;
handler.VALID_SHIPPING_MODES = VALID_SHIPPING_MODES;
handler.normalizeCategory = normalizeCategory;
handler.normalizeShippingMode = normalizeShippingMode;

export default handler;
