import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

if (typeof window !== 'undefined' && pdfjsLib?.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '5.4.624'}/pdf.worker.min.mjs`;
  } catch (_) {}
}

const CATEGORY_MAP = [
  {
    category: "Contenedores y Embalajes",
    hsCode: "8609.00",
    regex: /\b(conteneur|container|contenedor|flat\s*rack|open\s*top|caja|palet|pallet|palete|skid|colis|caisse|caixa)\b/i
  },
  {
    category: "Flota de Vehículos",
    hsCode: "8716.39 / 8701.20",
    regex: /\b(cami[oó]n|cabeza|tractor|trailer|tr[aá]iler|semirremolque|semiremolque|semi-remolque|g[oó]ndola|furgoneta|pick-up|pickup|truck|lorry|remorque)\b/i
  },
  {
    category: "Maquinaria y Equipos",
    hsCode: "8429.52 / 8474.20",
    regex: /\b(bomba|compresor|compressor|compresseur|motor|engine|moteur|trituradora|molino|crible|concasseur|broyeur|generador|generator|g[eé]n[eé]rateur|gr[uú]a|crane|grue)\b/i
  },
  {
    category: "Estructuras y Calderería",
    hsCode: "7308.90 / 8428.39",
    regex: /\b(convoyeur|transportador|pasarela|gangway|passerelle|tolva|tr[eéè]mie|silo|cabalete|cavalete|poutre|goulotte|chute|estructura|structure)\b/i
  },
  {
    category: "Material Eléctrico y Control",
    hsCode: "8504.23 / 8537.10",
    regex: /\b(transformador|transformer|transformateur|cuadro\s*el[eé]ctrico|quadro\s*el[eé]trico|tableau\s*[eé]lectrique|electrical\s*panel|inversor|inverter|onduleur|cable|c[aâ]ble|cabo|climatizador|climatiseur|air\s*conditioner)\b/i
  },
  {
    category: "Tuberías y Accesorios",
    hsCode: "7305.11 / 8481.80",
    regex: /\b(tubo|tuber[ií]a|pipe|tuyau|tubula[cç][aã]o|v[aá]lvula|valve|soupape|brida|flange|bride|codo|elbow|coude|spool|fitting|manguera|hose)\b/i
  },
  {
    category: "Utillaje y Herramientas",
    hsCode: "7318.15 / 7326.90",
    regex: /\b(utillaje|herramientas|tools|outillage|ferramentas|bul[oó]n|bolt|boulon|tuerca|nut|[eé]crou|porca|arandela|washer|rondelle|arruela|perno|tornillo|screw|vis|grillete|shackle|manille)\b/i
  },
  {
    category: "Equipos de Proceso",
    hsCode: "8419.50 / 8421.21",
    regex: /\b(bastidor|ósmosis|osmosis|osmose|desaladora|reactor|r[eé]acteur|intercambiador|heat\s*exchanger|[eé]changeur|columna|column|colonne|tanque|tank|cuve|reservat[oó]rio|filtro|filter|filtre)\b/i
  }
];

function classifyItem(description) {
  for (const entry of CATEGORY_MAP) {
    if (entry.regex.test(description)) {
      return { category: entry.category, hsCode: entry.hsCode };
    }
  }
  return { category: "Equipos de Proceso", hsCode: "8419.50 / 8421.21" };
}

function determineShippingMode(length_m, width_m, height_m, weight_kg) {
  const maxDim = Math.max(length_m, width_m, height_m);
  if (maxDim > 12 || weight_kg > 24000) return "Ro-Ro / Carga Proyecto";
  if (width_m > 2.4 || height_m > 2.6) return "40' Flat Rack / OT";
  if (weight_kg > 20000 || length_m > 11.5) return "40' HC Contenedor";
  return "20' ST Contenedor";
}

/**
 * Sanitización estricta: Descarta líneas con exceso de ruido o caracteres binarios corruptos.
 */
function sanitizeLine(line) {
  if (!line || typeof line !== 'string') return null;
  let cleaned = line.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  // Rechazar líneas con alta densidad de caracteres extraños/no legibles
  const validChars = cleaned.replace(/[0-9A-Za-z\u00C0-\u024F\s.,;:\/\\()\-%|°×"“”‘’&#_+=?¡¿]/g, '');
  if ((validChars.length / cleaned.length) > 0.15) {
    return null; // Demasiado ruido o texto binario mal decodificado
  }

  return cleaned;
}

function parseMeasuredNumber(raw) {
  if (typeof raw !== 'string') raw = String(raw ?? '');
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return NaN;

  if (/^\d+[.,]\d{3}$/.test(s)) {
    s = s.replace(',', '.');
    return parseFloat(s);
  }

  s = s.replace(/[.,](?=\d{3}(?:\D|$))/g, '');
  s = s.replace(',', '.');

  const parsed = parseFloat(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function interpretRow(line, rowIndex) {
  const cleanLine = sanitizeLine(line);
  if (!cleanLine) return null;

  if (/^(categoría|description|descripción|cant|dimensions|peso|modo|lista de embarque|proyecto:|origen:|peso total|página)/i.test(cleanLine)) {
    return null;
  }

  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)(?:\s*(mm|cm|m))?/i;
  const dimMatch = cleanLine.match(dimRegex);

  let l = 1.0, w = 1.0, h = 1.0;

  if (dimMatch) {
    const lRaw = parseMeasuredNumber(dimMatch[1]);
    const wRaw = parseMeasuredNumber(dimMatch[2]);
    const hRaw = parseMeasuredNumber(dimMatch[3]);
    const unit = dimMatch[4] ? dimMatch[4].toLowerCase() : null;

    if (Number.isFinite(lRaw) && Number.isFinite(wRaw) && Number.isFinite(hRaw)) {
      l = lRaw; w = wRaw; h = hRaw;
      if (unit === 'mm' || (!unit && (l > 40 || w > 40 || h > 40))) {
        l /= 1000; w /= 1000; h /= 1000;
      } else if (unit === 'cm') {
        l /= 100; w /= 100; h /= 100;
      }
    }
  }

  // SANITY CHECK ESTRICTO (Hard Limits): Descartar valores dimensionales absurdos (> 40 metros)
  if (l > 40 || w > 40 || h > 40 || l <= 0 || w <= 0 || h <= 0) {
    return null;
  }

  let weightKg = 1000;
  const tonMatch = cleanLine.match(/(\d+(?:[.,]\d+)?)\s*(t|tn|ton)\b/i);
  const kgMatch = cleanLine.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogramos)\b/i);

  if (tonMatch) {
    const val = parseMeasuredNumber(tonMatch[1]);
    if (Number.isFinite(val)) weightKg = val * 1000;
  } else if (kgMatch) {
    const val = parseMeasuredNumber(kgMatch[1]);
    if (Number.isFinite(val)) weightKg = val;
  } else {
    const allNums = cleanLine.match(/-?\d+(?:[.,]\d+)?/g) || [];
    const cleanNums = allNums.map(n => parseMeasuredNumber(n)).filter(n => Number.isFinite(n) && n > 0);
    const nonDimNums = cleanNums.filter(n => n !== l && n !== w && n !== h);
    if (nonDimNums.length > 0) {
      weightKg = Math.max(...nonDimNums);
      if (weightKg < 1) weightKg *= 1000;
    }
  }

  let quantity = 1;
  const qtyMatch = cleanLine.match(/\b(?:qty|cant|q):\s*(\d+)\b/i) || cleanLine.match(/^(\d{1,4})\s*\|\s*/);
  if (qtyMatch) {
    const parsedQty = parseInt(qtyMatch[1], 10);
    if (parsedQty > 0 && parsedQty < 100000) quantity = parsedQty;
  }

  let description = cleanLine
    .replace(dimRegex, '')
    .replace(/(\d+(?:[.,]\d+)?)\s*(t|tn|ton|kg|kgs|kilogramos)\b/gi, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  description = description.replace(/^[\d.,]+\s*/, '');
  if (!description || description.length < 2) {
    description = `Partida Industrial #${rowIndex + 1}`;
  }

  const length_m = Math.round(l * 1000) / 1000;
  const width_m = Math.round(w * 1000) / 1000;
  const height_m = Math.round(h * 1000) / 1000;
  const unit_weight_kg = Math.round(weightKg * 100) / 100;
  const volume_m3 = Math.round(length_m * width_m * height_m * 1000) / 1000;

  const { category, hsCode } = classifyItem(`${description} ${cleanLine}`);
  const shipping_mode_supported = determineShippingMode(length_m, width_m, height_m, unit_weight_kg);

  // Contrato híbrido completo con todas las aliases legacy que la UI espera
  return {
    id: `item-${Date.now()}-${rowIndex}-${Math.random().toString(36).substring(2, 7)}`,
    description: description,
    type: description,
    category: category,
    hsCode: hsCode,
    hs_code: hsCode,
    quantity: quantity,
    length_m: length_m,
    width_m: width_m,
    height_m: height_m,
    length: length_m,
    width: width_m,
    height: height_m,
    weight_kg: unit_weight_kg,
    unit_weight_kg: unit_weight_kg,
    weight: unit_weight_kg,
    volume_m3: volume_m3,
    shipping_mode_supported: shipping_mode_supported
  };
}

async function extractLinesFromPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rawFragments = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items || [];

    const linesMap = [];
    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;

      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width || 0;
      const height = item.height || 10;
      const centerY = y + height / 2;

      let line = linesMap.find((entry) => Math.abs(entry.centerY - centerY) <= 6);
      if (!line) {
        line = { centerY, items: [] };
        linesMap.push(line);
      }
      line.items.push({ x, str: item.str.trim(), width });
    }

    linesMap.sort((a, b) => b.centerY - a.centerY);

    for (const line of linesMap) {
      line.items.sort((a, b) => a.x - b.x);
      let lineStr = '';
      let previousEnd = null;

      for (const item of line.items) {
        if (previousEnd !== null) {
          lineStr += (item.x - previousEnd > 12) ? ' | ' : ' ';
        }
        lineStr += item.str;
        previousEnd = item.x + (item.width || item.str.length * 6);
      }

      const trimmedLine = lineStr.trim();
      if (trimmedLine) rawFragments.push(trimmedLine);
    }
  }

  const logicalRows = [];
  let currentBuffer = [];

  for (const fragment of rawFragments) {
    if (/^(lista de embarque|proyecto:|origen:|peso total|página)/i.test(fragment)) continue;
    currentBuffer.push(fragment);
    if (currentBuffer.length >= 2 || /(\d+(?:[.,]\d+)?)\s*[xX×*]/i.test(fragment)) {
      logicalRows.push(currentBuffer.join(' | '));
      currentBuffer = [];
    }
  }
  if (currentBuffer.length > 0) logicalRows.push(currentBuffer.join(' | '));

  return logicalRows;
}

async function extractLinesFromSpreadsheet(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  return rows.filter(r => Array.isArray(r) && r.length > 0).map(r => r.map(c => c !== null && c !== undefined ? String(c).trim() : '').filter(Boolean).join(' | ')).filter(Boolean);
}

async function extractLinesFromWord(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result?.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

export async function parsePackingList(file) {
  const warnings = [];
  const stats = { total_lines_processed: 0, valid_items: 0, discarded_items: 0 };

  if (!file) {
    return { success: false, items: [], warnings: ['No se ha proporcionado archivo.'], stats };
  }

  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();
  let rawLines = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
      rawLines = await extractLinesFromPdf(arrayBuffer);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') || fileType.includes('spreadsheet')) {
      rawLines = await extractLinesFromSpreadsheet(arrayBuffer);
    } else if (fileName.endsWith('.docx')) {
      rawLines = await extractLinesFromWord(arrayBuffer);
    } else {
      const text = new TextDecoder('utf-8').decode(arrayBuffer);
      rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    }
  } catch (error) {
    return { success: false, items: [], warnings: [`Error de lectura: ${error?.message}`], stats };
  }

  stats.total_lines_processed = rawLines.length;
  const validItems = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const item = interpretRow(rawLines[i], i);
    if (item) validItems.push(item);
  }

  stats.valid_items = validItems.length;
  stats.discarded_items = Math.max(0, stats.total_lines_processed - stats.valid_items);

  return { success: true, items: validItems, warnings, stats };
}

export default parsePackingList;
