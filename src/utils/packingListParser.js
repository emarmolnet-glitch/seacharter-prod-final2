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

  return { category: "Otros", hsCode: "0000.00" };
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

  const ALLOWED_SYMBOLS = new Set([
    '.', ',', ';', ':', '(', ')', '/', '\\', '-', '+', '%', '|',
    'º', '°', 'Ø', 'ø', '×', '"', '“', '”', '‘', '’', '&', '@',
    '#', '=', '_', '*', '¿', '?', '¡', '!'
  ]);

  let meaningfulChars = 0;
  let noiseChars = 0;

  for (const char of cleaned) {
    if (/\s/.test(char)) continue;

    if (/[0-9A-Za-z\u00C0-\u024F]/.test(char)) {
      meaningfulChars += 1;
    } else if (ALLOWED_SYMBOLS.has(char)) {
      meaningfulChars += 1;
    } else {
      noiseChars += 1;
    }
  }

  const totalCount = meaningfulChars + noiseChars;
  if (totalCount === 0) return null;

  const noiseRatio = noiseChars / totalCount;
  if (noiseRatio > 0.35) return null;

  return cleaned;
}

function parseMeasuredNumber(raw) {
  if (typeof raw !== 'string') raw = String(raw ?? '');
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return NaN;

  const groupedDecimal = /^\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(s);
  const groupedInteger = /^\d{1,3}(?:[.,]\d{3})+$/.test(s);

  if (groupedDecimal || groupedInteger) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    let decimalSeparator = '.';

    if (lastComma > -1 && lastDot > -1) {
      decimalSeparator = lastComma > lastDot ? ',' : '.';
    } else if (lastComma > -1) {
      decimalSeparator = ',';
    } else {
      decimalSeparator = '.';
    }

    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    let normalized = s.split(thousandsSeparator).join('');

    if (decimalSeparator === ',') {
      normalized = normalized.replace(',', '.');
    }

    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  if (/^\d+,\d{1,2}$/.test(s)) {
    return parseFloat(s.replace(',', '.'));
  }

  if (/^\d+\.\d{1,2}$/.test(s)) {
    return parseFloat(s);
  }

  return parseFloat(s);
}

function isNumericToken(token) {
  if (!token || typeof token !== 'string') return false;
  return /^\d[\d.,\s]*$/.test(token.trim()) && Number.isFinite(parseMeasuredNumber(token));
}

function hasWeightUnit(token) {
  return /\b(kg|kgs|kilogramos|lb|lbs)\b/i.test(token || '');
}

function toKg(value, unit) {
  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit === 'lb' || normalizedUnit === 'lbs') {
    return value * 0.4536;
  }

  return value;
}

function extractExplicitWeight(line, tokens) {
  const weightRegex = /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogramos|lb|lbs)\b/i;

  const lineMatch = line.match(weightRegex);

  if (lineMatch) {
    const parsedValue = parseMeasuredNumber(lineMatch[1]);
    const unit = lineMatch[2].toLowerCase();

    if (!Number.isFinite(parsedValue)) return null;

    const usedIndices = new Set();
    const unitTokenIndex = tokens.findIndex((token) => hasWeightUnit(token));

    if (unitTokenIndex >= 0) {
      usedIndices.add(unitTokenIndex);

      const token = tokens[unitTokenIndex];

      if (/^(kg|kgs|kilogramos|lb|lbs)$/i.test(token)) {
        if (
          unitTokenIndex > 0 &&
          /^\d[\d.,\s]*$/.test(tokens[unitTokenIndex - 1])
        ) {
          usedIndices.add(unitTokenIndex - 1);
        }
      }
    } else {
      const rawWithoutSpaces = lineMatch[1].replace(/\s+/g, '');

      tokens.forEach((token, idx) => {
        if (token.replace(/\s+/g, '') === rawWithoutSpaces) {
          usedIndices.add(idx);
        }
      });
    }

    return {
      valueKg: toKg(parsedValue, unit),
      usedIndices
    };
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const inlineMatch = token.match(
      /^(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogramos|lb|lbs)$/i
    );

    if (inlineMatch) {
      const parsedValue = parseMeasuredNumber(inlineMatch[1]);
      const unit = inlineMatch[2].toLowerCase();

      if (Number.isFinite(parsedValue)) {
        return {
          valueKg: toKg(parsedValue, unit),
          usedIndices: new Set([i])
        };
      }
    }
  }

  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (
      /^\d[\d.,\s]*$/.test(tokens[i]) &&
      /^(kg|kgs|kilogramos|lb|lbs)$/i.test(tokens[i + 1])
    ) {
      const parsedValue = parseMeasuredNumber(tokens[i]);
      const unit = tokens[i + 1].toLowerCase();

      if (Number.isFinite(parsedValue)) {
        return {
          valueKg: toKg(parsedValue, unit),
          usedIndices: new Set([i, i + 1])
        };
      }
    }
  }

  return null;
}

function extractCombinedDimensions(line, tokens) {
  const combinedRegex = /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*)\s*(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*)\s*(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)(?:\s*(mm|cm|m|mts|metros))?/i;

  const match = line.match(combinedRegex);
  if (!match) return null;

  const rawValues = [match[1], match[2], match[3]];
  const values = rawValues.map((value) => parseMeasuredNumber(value));

  if (values.some((value) => !Number.isFinite(value))) return null;

  const usedTokens = [];
  for (const token of tokens) {
    if (/x|X|×|\*/.test(token)) {
      usedTokens.push(token);
      break;
    }
  }

  return {
    values,
    unit: match[4] || null,
    usedTokens,
    unitIndex: -1
  };
}

function toLengths(rawValues, unit, warnings, rowIndex) {
  if (rawValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }

  let values = rawValues.slice();

  if (unit) {
    const normalizedUnit = unit.toLowerCase();

    if (normalizedUnit === 'mm') {
      values = values.map((value) => value / 1000);
    } else if (normalizedUnit === 'cm') {
      values = values.map((value) => value / 100);
    }
  } else {
    // Sin unidad explícita, si algún valor supera 40 no puede estar en metros.
    // En ese caso asumimos milímetros.
    if (values.some((value) => value > 40)) {
      values = values.map((value) => value / 1000);
    }
  }

  const length_m = Math.round(values[0] * 1000) / 1000;
  const width_m = Math.round(values[1] * 1000) / 1000;
  const height_m = Math.round(values[2] * 1000) / 1000;

  if (length_m < 0.05 || length_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: Largo ${length_m} m fuera del rango permitido.`);
    return null;
  }

  if (width_m < 0.05 || width_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: Ancho ${width_m} m fuera del rango permitido.`);
    return null;
  }

  if (height_m < 0.05 || height_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: Alto ${height_m} m fuera del rango permitido.`);
    return null;
  }

  return { length_m, width_m, height_m };
}

function extractSeparateDimensions(tokens, weightUsedIndices) {
  const used = new Set(weightUsedIndices || []);
  const candidates = [];
  let run = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (!used.has(i) && /^\d[\d.,\s]*$/.test(token)) {
      run.push(i);
    } else {
      if (run.length >= 3) {
        const nextToken = tokens[i];
        const unitIndex = /^(mm|cm|m|mts|metros)$/i.test(nextToken || '') ? i : -1;

        candidates.push({
          indices: run.slice(-3),
          unit: unitIndex >= 0 ? tokens[unitIndex] : null,
          unitIndex
        });
      }

      run = [];
    }
  }

  if (run.length >= 3) {
    candidates.push({
      indices: run.slice(-3),
      unit: null,
      unitIndex: -1
    });
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[candidates.length - 1];
  const usedTokens = chosen.indices.map((idx) => tokens[idx]);

  return {
    values: usedTokens.map((token) => parseMeasuredNumber(token)),
    unit: chosen.unit,
    usedTokens,
    unitIndex: chosen.unitIndex
  };
}

function extractDimensions(line, tokens, weightUsedIndices, warnings, rowIndex) {
  const combined = extractCombinedDimensions(line, tokens);

  if (combined) {
    const lengths = toLengths(
      combined.values,
      combined.unit,
      warnings,
      rowIndex
    );

    if (!lengths) return null;

    return {
      ...lengths,
      usedTokens: combined.usedTokens,
      unitIndex: combined.unitIndex
    };
  }

  const separate = extractSeparateDimensions(tokens, weightUsedIndices);

  if (!separate) return null;

  const lengths = toLengths(
    separate.values,
    separate.unit,
    warnings,
    rowIndex
  );

  if (!lengths) return null;

  return {
    ...lengths,
    usedTokens: separate.usedTokens,
    unitIndex: separate.unitIndex
  };
}

function extractQuantity(tokens, dimensionUsedTokens, weightUsedIndices) {
  const dimensionUsed = new Set(dimensionUsedTokens);
  const weightUsed = new Set(weightUsedIndices || []);

  const candidates = [];

  tokens.forEach((token, idx) => {
    if (weightUsed.has(idx)) return;
    if (dimensionUsed.has(token)) return;

    if (/^\d{1,6}$/.test(token)) {
      const amount = parseInt(token, 10);

      if (amount > 0 && amount < 100000) {
        candidates.push({ amount, index: idx });
      }
    }
  });

  if (candidates.length === 0) {
    return { quantity: 1, usedIndex: -1 };
  }

  const dimensionIndices = [];

  tokens.forEach((token, idx) => {
    if (dimensionUsed.has(token)) {
      dimensionIndices.push(idx);
    }
  });

  const firstDimensionIndex =
    dimensionIndices.length > 0 ? Math.min(...dimensionIndices) : tokens.length;

  const beforeDimensions = candidates.filter(
    (candidate) => candidate.index < firstDimensionIndex
  );

  const chosen = beforeDimensions.length
    ? beforeDimensions[beforeDimensions.length - 1]
    : candidates[0];

  return {
    quantity: chosen.amount,
    usedIndex: chosen.index
  };
}

function inferWeightFromLastNumericToken(tokens) {
  const numericIndices = [];

  tokens.forEach((token, idx) => {
    if (isNumericToken(token)) {
      numericIndices.push(idx);
    }
  });

  if (numericIndices.length < 3) return null;

  const lastIndex = numericIndices[numericIndices.length - 1];

  return {
    index: lastIndex,
    raw: tokens[lastIndex],
    value: parseMeasuredNumber(tokens[lastIndex])
  };
}

function buildDescription(
  line,
  tokens,
  dimensionUsedTokens,
  weightUsedIndices,
  quantityIndex,
  rowIndex
) {
  const dimensionUsed = new Set(dimensionUsedTokens);
  const weightUsed = new Set(weightUsedIndices || []);

  const description = tokens
    .filter((token, idx) => !weightUsed.has(idx))
    .filter((token) => !dimensionUsed.has(token))
    .filter((token) => !/^(mm|cm|m|mts|metros)$/i.test(token))
    .filter((_, idx) => idx !== quantityIndex)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (description && !/^[\d.,\s]+$/.test(description)) {
    return description;
  }

  const fallback = line
    .replace(/\|/g, ' ')
    .replace(
      /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*)\s*(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(?:x|X|×|\*)\s*(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)(?:\s*(?:mm|cm|m|mts|metros))?/gi,
      ' '
    )
    .replace(
      /(\d{1,3}(?:[.,]\d{3})*|\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogramos|lb|lbs)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (fallback && !/^[\d.,\s]+$/.test(fallback)) {
    return fallback;
  }

  return `Partida de Carga #${rowIndex + 1}`;
}

function interpretRow(line, rowIndex, warnings) {
  const tokens = line.includes('|')
    ? line.split('|').map((token) => token.trim()).filter(Boolean)
    : line.split(/\s{2,}|\t/).map((token) => token.trim()).filter(Boolean);

  if (tokens.length < 2) return null;

  const explicitWeight = extractExplicitWeight(line, tokens);
  let weightKg = null;
  let weightUsedIndices = new Set();

  if (explicitWeight) {
    weightKg = explicitWeight.valueKg;
    weightUsedIndices = explicitWeight.usedIndices;
  } else {
    const inferredWeight = inferWeightFromLastNumericToken(tokens);

    if (inferredWeight) {
      weightKg = inferredWeight.value;
      weightUsedIndices = new Set([inferredWeight.index]);

      warnings.push(
        `Fila ${rowIndex + 1}: no se detectó unidad de peso. Se asumió kg para el valor "${inferredWeight.raw}".`
      );
    }
  }

  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const dimensions = extractDimensions(
    line,
    tokens,
    weightUsedIndices,
    warnings,
    rowIndex
  );

  if (!dimensions) return null;

  const quantityInfo = extractQuantity(
    tokens,
    dimensions.usedTokens,
    weightUsedIndices
  );

  const unitWeightKg = weightKg / quantityInfo.quantity;

  const length_m = Math.round(dimensions.length_m * 1000) / 1000;
  const width_m = Math.round(dimensions.width_m * 1000) / 1000;
  const height_m = Math.round(dimensions.height_m * 1000) / 1000;
  const weight_kg = Math.round(unitWeightKg * 100) / 100;
  const volume_m3 =
    Math.round(length_m * width_m * height_m * 1000) / 1000;

  if (length_m < 0.05 || length_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: largo ${length_m} m fuera de rango.`);
    return null;
  }

  if (width_m < 0.05 || width_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: ancho ${width_m} m fuera de rango.`);
    return null;
  }

  if (height_m < 0.05 || height_m > 40) {
    warnings.push(`Fila ${rowIndex + 1}: alto ${height_m} m fuera de rango.`);
    return null;
  }

  if (weight_kg < 1 || weight_kg > 150000) {
    warnings.push(
      `Fila ${rowIndex + 1}: peso unitario ${weight_kg} kg fuera de rango.`
    );
    return null;
  }

  if (volume_m3 > 500) {
    warnings.push(
      `Fila ${rowIndex + 1}: volumen ${volume_m3} m³ excede el máximo permitido.`
    );
    return null;
  }

  const description = buildDescription(
    line,
    tokens,
    dimensions.usedTokens,
    weightUsedIndices,
    quantityInfo.usedIndex,
    rowIndex
  );

  const { category, hsCode } = classifyItem(`${description} ${line}`);
  const shipping_mode_supported = determineShippingMode(
    length_m,
    width_m,
    height_m,
    weight_kg
  );

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
  const finalLines = [];
  const seenHeaderFooterLines = new Set();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    const content = await page.getTextContent();
    const items = content.items || [];

    const linesMap = [];
    const Y_THRESHOLD = 3;

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

          if (deltaX > 10) {
            lineStr += ' | ';
          } else {
            lineStr += ' ';
          }
        }

        lineStr += item.str;
        previousEnd = item.x + (item.width || item.str.length * 6);
      }

      const trimmedLine = lineStr.trim();

      if (!trimmedLine) continue;

      const normalizedY = line.centerY / pageHeight;
      const isHeaderFooter =
        normalizedY > 0.82 || normalizedY < 0.15;

      if (isHeaderFooter) {
        if (seenHeaderFooterLines.has(trimmedLine)) {
          continue;
        }

        seenHeaderFooterLines.add(trimmedLine);
      }

      finalLines.push(trimmedLine);
    }
  }

  return finalLines;
}

async function extractLinesFromSpreadsheet(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: ''
  });

  const lines = [];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;

    const cells = row.map((cell) =>
      cell !== null && cell !== undefined ? String(cell).trim() : ''
    );

    if (cells.some((cell) => cell.length > 0)) {
      lines.push(cells.join(' | '));
    }
  }

  return lines;
}

async function extractLinesFromWord(arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = result?.value || '';

  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function parsePackingList(file) {
  const warnings = [];
  const stats = {
    total_lines_processed: 0,
    valid_items: 0,
    discarded_items: 0
  };

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
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xlsm') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.csv') ||
      fileType.includes('spreadsheet') ||
      fileType.includes('excel') ||
      fileType === 'text/csv'
    ) {
      rawLines = await extractLinesFromSpreadsheet(arrayBuffer);
    } else if (
      fileName.endsWith('.docx') ||
      fileType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      rawLines = await extractLinesFromWord(arrayBuffer);
    } else {
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, 5));
      const headerString = String.fromCharCode(...headerBytes);

      if (headerString.startsWith('%PDF')) {
        rawLines = await extractLinesFromPdf(arrayBuffer);
      } else if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) {
        if (fileName.endsWith('.docx')) {
          rawLines = await extractLinesFromWord(arrayBuffer);
        } else {
          rawLines = await extractLinesFromSpreadsheet(arrayBuffer);
        }
      } else {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const text = decoder.decode(arrayBuffer);

        rawLines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      }
    }
  } catch (error) {
    warnings.push(
      `Error crítico al leer el archivo ${file.name || ''}: ${
        error?.message || 'archivo corrupto o formato no soportado.'
      }`
    );

    return { items: [], warnings, stats };
  }

  stats.total_lines_processed = rawLines.length;

  if (stats.total_lines_processed === 0) {
    warnings.push(
      'El documento procesado no contiene líneas de texto legibles.'
    );
    return { items: [], warnings, stats };
  }

  const sanitizedLines = [];
  let sanitizedLinesDiscarded = 0;

  for (const rawLine of rawLines) {
    const cleanLine = sanitizeLine(rawLine);

    if (cleanLine) {
      sanitizedLines.push(cleanLine);
    } else {
      sanitizedLinesDiscarded += 1;
    }
  }

  if (
    stats.total_lines_processed > 0 &&
    sanitizedLinesDiscarded / stats.total_lines_processed > 0.3
  ) {
    warnings.push(
      `Advertencia de calidad: se descartaron más del 30% de las líneas originales por ruido de texto (${sanitizedLinesDiscarded}/${stats.total_lines_processed}).`
    );
  }

  const validItems = [];

  for (let i = 0; i < sanitizedLines.length; i += 1) {
    const item = interpretRow(sanitizedLines[i], i, warnings);

    if (item) {
      validItems.push(item);
    }
  }

  stats.valid_items = validItems.length;
  stats.discarded_items = stats.total_lines_processed - stats.valid_items;

  return {
    items: validItems,
    warnings,
    stats
  };
}

export default parsePackingList;

