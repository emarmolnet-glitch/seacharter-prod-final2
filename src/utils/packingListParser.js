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
  if (maxDim > 12 || weight_kg > 24000) {
    return "Ro-Ro / Carga Proyecto";
  }
  if (width_m > 2.4 || height_m > 2.6) {
    return "40' Flat Rack / OT";
  }
  if (weight_kg > 20000 || length_m > 11.5) {
    return "40' HC Contenedor";
  }
  return "20' ST Contenedor";
}

function sanitizeLine(line) {
  if (!line || typeof line !== 'string') return null;
  let cleaned = line
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned;
}

function parseMeasuredNumber(raw) {
  if (typeof raw !== 'string') raw = String(raw ?? '');
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return NaN;

  s = s.replace(/[.,](?=\d{3}(?:\D|$))/g, '');
  s = s.replace(',', '.');

  const parsed = parseFloat(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function interpretRow(line, rowIndex, warnings) {
  const cleanLine = sanitizeLine(line);
  if (!cleanLine) return null;

  if (/^(categoría|description|descripción|cant|dimensions|peso|modo|lista de embarque|proyecto:|origen:|peso total|página)/i.test(cleanLine)) {
    return null;
  }

  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)(?:\s*(mm|cm|m))?/i;
  const dimMatch = cleanLine.match(dimRegex);
  if (!dimMatch) return null;

  const lRaw = parseMeasuredNumber(dimMatch[1]);
  const wRaw = parseMeasuredNumber(dimMatch[2]);
  const hRaw = parseMeasuredNumber(dimMatch[3]);
  const unit = dimMatch[4] ? dimMatch[4].toLowerCase() : null;

  if (!Number.isFinite(lRaw) || !Number.isFinite(wRaw) || !Number.isFinite(hRaw)) return null;

  let l = lRaw, w = wRaw, h = hRaw;
  if (unit === 'mm' || (!unit && (l > 40 || w > 40 || h > 40))) {
    l /= 1000; w /= 1000; h /= 1000;
  } else if (unit === 'cm') {
    l /= 100; w /= 100; h /= 100;
  }

  if (l < 0.05 || l > 40 || w < 0.05 || w > 40 || h < 0.05 || h > 40) {
    return null;
  }

  const dimIndex = cleanLine.indexOf(dimMatch[0]);
  const leftPart = cleanLine.substring(0, dimIndex).trim();
  const rightPart = cleanLine.substring(dimIndex + dimMatch[0].length).trim();

  const leftTokens = leftPart.split('|').map(t => t.trim()).filter(Boolean);
  let description = "";
  let quantity = 1;

  if (leftTokens.length >= 2) {
    const lastToken = leftTokens[leftTokens.length - 1];
    if (/^\d{1,4}$/.test(lastToken)) {
      quantity = parseInt(lastToken, 10);
      description = leftTokens.slice(0, leftTokens.length - 1).join(' - ');
    } else {
      description = leftTokens.join(' - ');
    }
  } else {
    description = leftPart;
  }

  description = description
    .replace(/^(Equipos de Proceso|Maquinaria y Talleres|Utillaje y Herramientas|Flota de Veh[ií]culos|Estructuras y Calderer[ií]a|Material El[eé]ctrico y Control|Tuber[ií]as y Accesorios)\b/gi, '')
    .replace(/^\d+\s*/, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description || description.length < 2) {
    description = `Partida Industrial #${rowIndex + 1}`;
  }

  const rightTokens = rightPart.split('|').map(t => t.trim()).filter(Boolean);
  let weightKg = 1000;

  const numbersInRight = rightTokens
    .map(t => parseMeasuredNumber(t.replace(/(kg|kgs|t|tn)\b/gi, '')))
    .filter(n => Number.isFinite(n) && n > 0 && n < 500000);

  if (numbersInRight.length > 0) {
    weightKg = numbersInRight[0];
    if (numbersInRight.length >= 2 && Math.abs(numbersInRight[0] * quantity - numbersInRight[1]) < numbersInRight[1] * 0.15) {
      weightKg = numbersInRight[0];
    } else if (numbersInRight.length >= 2 && numbersInRight[0] > numbersInRight[1]) {
      weightKg = numbersInRight[1];
    }
  }

  const length_m = Math.round(l * 1000) / 1000;
  const width_m = Math.round(w * 1000) / 1000;
  const height_m = Math.round(h * 1000) / 1000;
  const weight_kg = Math.round(weightKg * 100) / 100;
  const volume_m3 = Math.round(length_m * width_m * height_m * 1000) / 1000;

  if (weight_kg < 1 || weight_kg > 150000) return null;

  const { category, hsCode } = classifyItem(`${description} ${cleanLine}`);
  const shipping_mode_supported = determineShippingMode(length_m, width_m, height_m, weight_kg);

  return {
    description,
    category,
    hsCode,
    length_m,
    width_m,
    height_m,
    weight_kg,
    volume_m3,
    shipping_mode_supported
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
    const Y_THRESHOLD = 4;

    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;

      const x = item.transform[4];
      const y = item.transform[5];
      const width = item.width || 0;
      const height = item.height || 10;
      const centerY = y + height / 2;

      let line = linesMap.find(
        (entry) => Math.abs(entry.centerY - centerY) <= Y_THRESHOLD
      );

      if (!line) {
        line = { centerY, items: [] };
        linesMap.push(line);
      }

      line.items.push({
        x,
        str: item.str.trim(),
        width
      });
    }

    linesMap.sort((a, b) => b.centerY - a.centerY);

    for (const line of linesMap) {
      line.items.sort((a, b) => a.x - b.x);

      let lineStr = '';
      let previousEnd = null;

      for (const item of line.items) {
        if (previousEnd !== null) {
          const deltaX = item.x - previousEnd;
          if (deltaX > 8) {
            lineStr += ' | ';
          } else {
            lineStr += ' ';
          }
        }
        lineStr += item.str;
        previousEnd = item.x + (item.width || item.str.length * 6);
      }

      const trimmedLine = lineStr.trim();
      if (trimmedLine) {
        rawFragments.push(trimmedLine);
      }
    }
  }

  // ACUMULADOR DE FILAS (Row Stitching): Agrupa fragmentos multilineales en registros lógicos únicos
  const logicalRows = [];
  let currentBuffer = [];

  for (const fragment of rawFragments) {
    if (/^(lista de embarque|proyecto:|origen:|peso total|categoría|description)/i.test(fragment)) {
      continue;
    }

    currentBuffer.push(fragment);

    const hasDimensions = /(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)/i.test(fragment);

    if (hasDimensions || currentBuffer.length >= 5) {
      logicalRows.push(currentBuffer.join(' | '));
      currentBuffer = [];
    }
  }

  if (currentBuffer.length > 0) {
    logicalRows.push(currentBuffer.join(' | '));
  }

  return logicalRows;
}

async function extractLinesFromSpreadsheet(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const lines = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const cells = row.map((cell) => cell !== null && cell !== undefined ? String(cell).trim() : '');
    if (cells.some((cell) => cell.length > 0)) {
      lines.push(cells.join(' | '));
    }
  }
  return lines;
}

async function extractLinesFromWord(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = result?.value || '';
  return rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function parsePackingList(file) {
  const warnings = [];
  const stats = { total_lines_processed: 0, valid_items: 0, discarded_items: 0 };

  if (!file) {
    warnings.push('No se ha proporcionado ningún archivo para procesar.');
    return { items: [], warnings, stats };
  }

  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();
  let rawLines = [];

  try {
    const arrayBuffer = await file.arrayBuffer();

    if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
      rawLines = await extractLinesFromPdf(arrayBuffer);
    } else if (
      fileName.endsWith('.xlsx') || fileName.endsWith('.xlsm') || fileName.endsWith('.xls') || fileName.endsWith('.csv') ||
      fileType.includes('spreadsheet') || fileType.includes('excel') || fileType === 'text/csv'
    ) {
      rawLines = await extractLinesFromSpreadsheet(arrayBuffer);
    } else if (fileName.endsWith('.docx') || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      rawLines = await extractLinesFromWord(arrayBuffer);
    } else {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(arrayBuffer);
      rawLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }
  } catch (error) {
    warnings.push(`Error crítico al leer el archivo: ${error?.message || 'formato no soportado.'}`);
    return { items: [], warnings, stats };
  }

  stats.total_lines_processed = rawLines.length;
  const validItems = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const item = interpretRow(rawLines[i], i, warnings);
    if (item) {
      validItems.push(item);
    }
  }

  stats.valid_items = validItems.length;
  stats.discarded_items = stats.total_lines_processed - stats.valid_items;

  return { items: validItems, warnings, stats };
}

export default parsePackingList;

