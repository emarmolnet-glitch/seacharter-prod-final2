import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
// FIX: pdf.js version 4+ usa extensión .mjs para el worker en el CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Expresiones regulares para detección de patrones de carga:
 * - Dimensiones: Largo x Ancho x Alto (ej. 12.2 x 2.45 x 2.8 o 12.2x2.45x2.8)
 * - Pesos: números seguidos de kg, kgs, ton, tn, t
 * - Cantidad inicial: números al comienzo de línea o columna
 */
export const DIMENSION_REGEX = /(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/;
export const WEIGHT_REGEX = /(?:(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:kilos?|kgs?|kg|tons?|tns?|tn|t)\b|(?:\s+|^)(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d{4,})\s*(?:kilos?|kgs?|kg|tons?|tns?|tn|t)?\s*$)/i;
export const QTY_REGEX = /^(?:(\d+)\s*(?:x|unids?|un|piezas?|pzas?|pcs?|uds?|\.)?\s+)/i;

/**
 * Extrae dinámicamente el peso numérico de una línea o texto de descripción.
 * Si no hay coincidencia directa de peso con unidad o al final de la línea,
 * busca la última cifra grande antes de "kg", números de 4 o más dígitos (ej. 8,500, 12,600, 9,200),
 * o cualquier número superior a 100 dentro de la cadena.
 * @param {string} line
 * @param {RegExpMatchArray|null} wtMatch
 * @returns {number}
 */
export function extractWeightFromLine(line, wtMatch = null) {
  const match = wtMatch || line.match(WEIGHT_REGEX);
  let wt = null;

  if (match) {
    const rawWeightStr = (match[1] || match[2] || match[0] || '').trim();
    const isTons = /t|tn|ton/i.test(match[0]);
    const cleanedStr = rawWeightStr.replace(/,/g, '');
    let val = parseFloat(rawWeightStr.replace(',', ''));
    if (!isNaN(parseFloat(cleanedStr))) {
      val = parseFloat(cleanedStr);
    }
    if (!isTons && /^\d{1,3}\.\d{3}$/.test(rawWeightStr)) {
      val = parseFloat(rawWeightStr.replace(/\./g, ''));
    }
    if (!isNaN(val) && val > 0) {
      wt = isTons ? val * 1000 : val;
    }
  }

  // Si no se obtuvo un peso válido, buscar la última cifra grande antes de "kg" o números de 4+ dígitos (ej. 8,500, 12,600)
  if (!wt || wt <= 0) {
    const kgPrecedingMatch = line.match(/(\d{1,3}(?:,\d{3})+|\d{4,}|\d+)\s*(?:kilos?|kgs?|kg)\b/i);
    if (kgPrecedingMatch) {
      const parsedKg = parseFloat(kgPrecedingMatch[1].replace(/,/g, ''));
      if (!isNaN(parsedKg) && parsedKg > 0) {
        wt = parsedKg;
      }
    }
  }

  // Buscar cualquier número de 4 o más dígitos en la línea (con o sin comas, ej. 8,500 o 12600)
  if (!wt || wt <= 0) {
    const fourDigitMatches = [...line.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?\b/g)];
    if (fourDigitMatches.length > 0) {
      // Tomar la última cifra numérica grande de la línea
      const lastFourDigit = fourDigitMatches[fourDigitMatches.length - 1][1];
      const parsedVal = parseFloat(lastFourDigit.replace(/,/g, ''));
      if (!isNaN(parsedVal) && parsedVal > 0) {
        wt = parsedVal;
      }
    }
  }

  // Si el parser falla en la extracción dinámica, intenta extraer cualquier número superior a 100 de la cadena
  if (!wt || wt <= 0) {
    // Buscar todas las secuencias numéricas (enteros o flotantes, limpiando comas de miles)
    const anyNumberMatches = [...line.matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/g)];
    const validCandidates = [];
    for (const m of anyNumberMatches) {
      const numVal = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(numVal) && numVal > 100) {
        validCandidates.push(numVal);
      }
    }
    if (validCandidates.length > 0) {
      // Usar la última cifra superior a 100 encontrada en la descripción/línea
      wt = validCandidates[validCandidates.length - 1];
    }
  }

  return (wt && wt > 0) ? wt : 0;
}

/**
 * Escanea líneas de texto y detecta filas de carga mediante expresiones regulares.
 * @param {string[]} lines
 * @returns {Array<{ id: number, quantity: number, type: string, length_m: number, width_m: number, height_m: number, unit_weight_kg: number }>}
 */
export function parseLinesWithRegex(lines) {
  const cargoItems = [];

  lines.forEach((rawLine, index) => {
    const line = String(rawLine || '').trim();
    if (!line) return;

    // Omitir encabezados típicos
    if (/^(item|n[ºo]|descrip|qty|cant|largo|ancho|alto|peso|weight|dimensiones|packing list|total)/i.test(line)) {
      return;
    }

    const dimMatch = line.match(DIMENSION_REGEX);
    const wtMatch = line.match(WEIGHT_REGEX);
    const qtyMatch = line.match(QTY_REGEX);

    // Si una línea contiene dimensiones, peso o palabras clave industriales
    if (dimMatch || wtMatch || /bomba|bastidor|ósmosis|osmosis|camión|cabeza|góndola|furgoneta|skid|transformador|filtro|módulo|excavadora|generador/i.test(line)) {
      let qty = 1;
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
      }

      let l = 1;
      let w = 1;
      let h = 1;
      if (dimMatch) {
        l = parseFloat(dimMatch[1].replace(',', '.')) || 1;
        w = parseFloat(dimMatch[2].replace(',', '.')) || 1;
        h = parseFloat(dimMatch[3].replace(',', '.')) || 1;
      }

      let wt = extractWeightFromLine(line, wtMatch);

      let desc = line
        .replace(QTY_REGEX, '')
        .replace(DIMENSION_REGEX, '')
        .replace(WEIGHT_REGEX, '')
        .replace(/[-–—|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!desc || desc.length < 2) {
        desc = `Pieza Proyecto #${index + 1}`;
      }

      // Si aún no se detectó peso, intentar extraer cualquier número > 100 de la descripción
      if (!wt || wt <= 0) {
        wt = extractWeightFromLine(desc) || 0;
      }

      cargoItems.push({
        id: Date.now() + index + Math.random(),
        quantity: Math.max(1, qty),
        type: desc,
        length: l,
        width: w,
        height: h,
        weight: wt,
        length_m: l,
        width_m: w,
        height_m: h,
        unit_weight_kg: wt,
      });
    }
  });

  return cargoItems;
}

/**
 * Lee un archivo de tipo ArrayBuffer utilizando FileReader.
 * @param {File|Blob} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Error al leer el archivo como ArrayBuffer: ' + e));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extrae filas y columnas desde un archivo Excel (.xlsx, .xls).
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Array<any>}
 */
export function parseExcelBuffer(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convertir a JSON (array de filas)
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) return [];

  // Mapear columnas o escanear filas
  const items = [];
  let headerIndex = -1;
  let colMap = { qty: -1, desc: -1, length: -1, width: -1, height: -1, weight: -1, dim: -1 };

  // 1. Intentar buscar fila de encabezados
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('cant') || rowStr.includes('qty') || rowStr.includes('descrip') || rowStr.includes('peso') || rowStr.includes('weight') || rowStr.includes('largo')) {
      headerIndex = r;
      row.forEach((cell, colIdx) => {
        const text = String(cell).toLowerCase().trim();
        if (/^(qty|cant|cantidad|unidades|unids|pcs|uds)/i.test(text)) colMap.qty = colIdx;
        else if (/^(desc|descripcion|descripción|equipo|modelo|type|item)/i.test(text)) colMap.desc = colIdx;
        else if (/^(largo|length|l\b)/i.test(text)) colMap.length = colIdx;
        else if (/^(ancho|width|w\b)/i.test(text)) colMap.width = colIdx;
        else if (/^(alto|altura|height|h\b)/i.test(text)) colMap.height = colIdx;
        else if (/^(peso|weight|kg|kilos|ton)/i.test(text)) colMap.weight = colIdx;
        else if (/^(dimension|medidas|dim)/i.test(text)) colMap.dim = colIdx;
      });
      break;
    }
  }

  // 2. Si encontramos encabezados identificables, extraer por columnas
  if (headerIndex !== -1 && (colMap.desc !== -1 || colMap.dim !== -1 || colMap.length !== -1)) {
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.every((c) => String(c).trim() === '')) continue;

      const descVal = colMap.desc !== -1 ? String(row[colMap.desc] || '').trim() : '';
      if (!descVal || /^(total|resumen)/i.test(descVal)) continue;

      let qty = 1;
      if (colMap.qty !== -1) {
        const qParsed = parseInt(String(row[colMap.qty]).replace(/[^\d]/g, ''), 10);
        if (!isNaN(qParsed) && qParsed > 0) qty = qParsed;
      }

      let l = 1, w = 1, h = 1;
      if (colMap.dim !== -1 && row[colMap.dim]) {
        const dMatch = String(row[colMap.dim]).match(DIMENSION_REGEX);
        if (dMatch) {
          l = parseFloat(dMatch[1].replace(',', '.')) || 1;
          w = parseFloat(dMatch[2].replace(',', '.')) || 1;
          h = parseFloat(dMatch[3].replace(',', '.')) || 1;
        }
      } else if (colMap.length !== -1 && colMap.width !== -1 && colMap.height !== -1) {
        l = parseFloat(String(row[colMap.length]).replace(/[^\d.,]/g, '').replace(',', '.')) || 1;
        w = parseFloat(String(row[colMap.width]).replace(/[^\d.,]/g, '').replace(',', '.')) || 1;
        h = parseFloat(String(row[colMap.height]).replace(/[^\d.,]/g, '').replace(',', '.')) || 1;
      }

      let wt = 0;
      if (colMap.weight !== -1 && row[colMap.weight] != null) {
        const wtStr = String(row[colMap.weight]).trim();
        const isTons = /t|tn|ton/i.test(wtStr);
        const cleanedStr = wtStr.replace(/[^\d.,]/g, '').replace(/,/g, '');
        let wtNum = parseFloat(wtStr.replace(',', ''));
        if (!isNaN(parseFloat(cleanedStr))) {
          wtNum = parseFloat(cleanedStr);
        }
        if (!isTons && /^\d{1,3}\.\d{3}$/.test(wtStr)) {
          wtNum = parseFloat(wtStr.replace(/\./g, ''));
        }
        if (!isNaN(wtNum) && wtNum > 0) {
          wt = isTons ? wtNum * 1000 : wtNum;
        }
      }

      if (!wt || wt <= 0) {
        wt = extractWeightFromLine(descVal) || 0;
      }

      items.push({
        id: Date.now() + r + Math.random(),
        quantity: qty,
        type: descVal,
        length: l,
        width: w,
        height: h,
        weight: wt,
        length_m: l,
        width_m: w,
        height_m: h,
        unit_weight_kg: wt,
      });
    }
  }

  // 3. Si no se extrajeron por columnas estructuradas, transformar filas a texto y escanear por Regex
  if (items.length === 0) {
    const textLines = rows
      .map((r) => (Array.isArray(r) ? r.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').join(' ') : ''))
      .filter((l) => l.length > 0);

    return parseLinesWithRegex(textLines);
  }

  return items;
}

/**
 * Extrae texto de un archivo PDF página por página con pdfjs-dist.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Array<any>>}
 */
export async function parsePdfBuffer(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const extractedLines = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Agrupar elementos por línea o posición vertical aproximada
    let currentLine = '';
    let lastY = null;

    for (const item of textContent.items) {
      if (!item.str) continue;

      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) {
          extractedLines.push(currentLine.trim());
        }
        currentLine = item.str;
      } else {
        currentLine += (currentLine ? ' ' : '') + item.str;
      }
      lastY = y;
    }

    if (currentLine.trim()) {
      extractedLines.push(currentLine.trim());
    }
  }

  return parseLinesWithRegex(extractedLines);
}

/**
 * Función principal encargada de recibir el archivo del input y devolver un array JSON limpio de piezas.
 * @param {File} file
 * @returns {Promise<Array<{ id: number, quantity: number, type: string, length_m: number, width_m: number, height_m: number, unit_weight_kg: number }>>}
 */
export async function parsePackingListFile(file) {
  if (!file) return [];

  const fileName = (file.name || '').toLowerCase();
  const arrayBuffer = await readFileAsArrayBuffer(file);

  // 1. Archivos Excel (.xlsx, .xls)
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseExcelBuffer(arrayBuffer);
  }

  // 2. Archivos PDF (.pdf)
  if (fileName.endsWith('.pdf')) {
    return await parsePdfBuffer(arrayBuffer);
  }

  // 3. Archivos de texto plano / CSV (.csv, .txt)
  try {
    const textDecoder = new TextDecoder('utf-8');
    const text = textDecoder.decode(arrayBuffer);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return parseLinesWithRegex(lines);
  } catch (_) {
    return [];
  }
}
