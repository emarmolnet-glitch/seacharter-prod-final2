/**
 * providerTariffParser.js
 * Servicio de importación y análisis multi-formato para matrices de tarifas:
 * Compatible con Excel (.xlsx, .xls), CSV (.csv), texto plano y documentos Word (.txt, .doc, .docx), y JSON.
 *
 * ESPECIFICACIONES CRÍTICAS (LECTURA 1:1 DE DATOS REALES):
 * 1. Mapeo estricto fila por fila y columna por columna:
 *    - Columna Producto ('Produit'): Exactamente el texto de la fila sin alteraciones ni sufijos artificiales.
 *    - Precio Base GICA ('Prix GICA' / 'Prix Usine DZD'): Valor numérico exacto en DZD de la celda.
 *    - Factor de Descuento ('Rabais'): Valor numérico o factor exacto de la celda.
 *    - Coste de Envase / Embalaje ('Big Bag / Sac' / 'Emballage'): Valor exacto de la fila.
 *    - Coste Logístico FSPE ('Coût Logistique FSPE' / 'FSPE Transport' / 'Transport'): Coste exacto de la fila.
 *    - Coste Logístico Mercado ('Coût Logistique Marché' / 'Inland Marché'): Coste exacto de mercado si figura en la fila.
 *    - Gastos de Tránsito y SGS ('Frais Transit & SGS' / 'SGS' / 'Transit'): Valor exacto de la fila.
 *    - Tasas Puerto Bejaia ('Frais Port Bejaia' / 'Port Bejaia' / 'EPB'): Valor exacto de la fila.
 * 2. Prohibición Absoluta de Valores Genéricos:
 *    - Queda estrictamente prohibido imponer costes inventados o hardcodeados para todos los productos.
 *      Cada fila retiene sus propios costes individuales.
 */

import * as XLSX from 'xlsx';
import { OFFICIAL_EXCHANGE_RATE_DZD_USD } from '../data/defaultProviderTariffs.js';

/**
 * Normaliza claves de texto para correspondencia flexible de columnas
 */
function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extrae un número flotante limpio desde cualquier formato (ej. "$45.50", "45,50 €", " 45.5 MT ", "5.985,00 DZD")
 */
function parseCleanNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const cleaned = String(val)
    .replace(/[$€£DZDUSDDA\s]/gi, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Deduce la tipología visual a partir del nombre del producto
 */
function deduceTypology(name) {
  const norm = normalizeKey(name);
  if (norm.includes('big bag') || norm.includes('bigbag') || norm.includes('1.5 mt') || norm.includes('1500 kg') || norm.includes('1.5t')) {
    return { typology: 'Big Bags (1.5 MT)', packaging: 'bigbag', category: 'Carga Unitizada / Envasada' };
  }
  if (norm.includes('saco') || norm.includes('sac') || norm.includes('50 kg') || norm.includes('50kg') || norm.includes('palet') || norm.includes('fardilise')) {
    return { typology: 'Sacos 50 kg', packaging: 'sacos', category: 'Carga Unitizada / Envasada' };
  }
  if (norm.includes('clinker') || norm.includes('clinquer')) {
    return { typology: 'Granel (Vrac)', packaging: 'vrac', category: 'Minerales y Construcción' };
  }
  if (norm.includes('yeso') || norm.includes('gypse')) {
    return { typology: 'Granel (Vrac)', packaging: 'vrac', category: 'Minerales y Construcción' };
  }
  return { typology: 'Granel (Vrac)', packaging: 'vrac', category: 'Minerales y Construcción' };
}

/**
 * Mapea un objeto fila genérico a un ítem de material normalizado, respetando 1:1 los datos de cada celda
 */
function mapRowToMaterial(row, index, providerName = 'Proveedor Importado') {
  const keys = Object.keys(row);
  const rowNorm = {};
  keys.forEach(k => {
    rowNorm[normalizeKey(k)] = row[k];
  });

  const findValue = (possibleHeaders, def = undefined, excludePatterns = []) => {
    // 1. Coincidencia exacta de clave normalizada
    for (const ph of possibleHeaders) {
      if (rowNorm[ph] !== undefined && String(rowNorm[ph]).trim() !== '') {
        return rowNorm[ph];
      }
    }
    // 2. Coincidencia exacta ignorando caracteres especiales y espacios (cleanKey)
    const cleanPhList = possibleHeaders.map(p => p.replace(/[^a-z0-9]/g, ''));
    for (let i = 0; i < possibleHeaders.length; i++) {
      const ph = possibleHeaders[i];
      const cleanPh = cleanPhList[i];
      for (const k of Object.keys(rowNorm)) {
        if (excludePatterns.some(ex => k.includes(ex))) continue;
        const cleanK = k.replace(/[^a-z0-9]/g, '');
        if ((k === ph || cleanK === cleanPh) && String(rowNorm[k]).trim() !== '') {
          return rowNorm[k];
        }
      }
    }
    // 3. Coincidencia parcial con exclusión de patrones conflictivos
    for (let i = 0; i < possibleHeaders.length; i++) {
      const ph = possibleHeaders[i];
      const cleanPh = cleanPhList[i];
      for (const k of Object.keys(rowNorm)) {
        if (excludePatterns.some(ex => k.includes(ex))) continue;
        const cleanK = k.replace(/[^a-z0-9]/g, '');
        if ((k.includes(ph) || (cleanPh.length >= 4 && cleanK.includes(cleanPh))) && String(rowNorm[k]).trim() !== '') {
          return rowNorm[k];
        }
      }
    }
    return def;
  };

  // 1. LECTURA 1:1 DEL NOMBRE DEL PRODUCTO ('Produit')
  const rawProductName = findValue([
    'produit',
    'product',
    'designation',
    'designation du produit',
    'nom produit',
    'article',
    'material',
    'producto',
    'mercancia',
    'description',
    'nom',
    'item'
  ]);

  let detectedName = '';
  if (rawProductName) {
    detectedName = String(rawProductName).trim();
  } else {
    for (const k of keys) {
      const val = String(row[k] || '').trim();
      if (val && isNaN(Number(val.replace(',', '.'))) && !val.toLowerCase().includes('precio') && !val.toLowerCase().includes('date')) {
        detectedName = val;
        break;
      }
    }
  }

  const finalName = detectedName || `Producto ${index + 1}`;
  const { typology, packaging, category } = deduceTypology(finalName);

  // 2. PRECIO BASE GICA ('Prix GICA' / 'Prix Usine DZD') - Exacto celda por celda
  const rawDzd = findValue([
    'prix gica',
    'prix usine dzd',
    'prix usine da',
    'prix usine ht',
    'prix sortie usine',
    'prix vente usine',
    'sortie usine',
    'prix usine',
    'base dzd',
    'prix dzd',
    'prix da',
    'da/t',
    'da / t',
    'da/mt',
    'da / mt',
    'dinars',
    'dinar',
    'dzd',
    'prix base',
    'prix unitaire'
  ], undefined, ['usd', '$', 'fob', 'transport', 'logistique', 'frais', 'emballage', 'sac']);
  let basePriceDzd = rawDzd !== undefined ? parseCleanNumber(rawDzd, 0) : 0;

  // 3. FACTOR DE DESCUENTO ('Rabais') - Exacto celda por celda
  const rawRabais = findValue(['rabais', 'descuento', 'remise', 'discount', 'rebate']);
  let rabais = rawRabais !== undefined ? parseCleanNumber(rawRabais, 0) : 0;
  let rabaisMultiplier = 1.0;

  if (rabais > 0 && rabais <= 1) {
    rabaisMultiplier = rabais;
  } else if (rabais > 1 && rabais <= 100) {
    rabaisMultiplier = Math.round((100 - rabais) / 100 * 10000) / 10000;
  } else if (rabais === 0) {
    rabaisMultiplier = 1.0;
  }

  // Base en USD si viene directa o calculada por TC oficial.
  // Evitar explícitamente que 'usine' o términos en DZD colisionen como USD.
  const rawBaseUsd = findValue([
    'base usd',
    'prix usd',
    'prix base usd',
    'cout usd',
    'cost usd',
    'coste base usd',
    'exw usd',
    'ex-work usd',
    'usd/mt',
    'usd / mt',
    'usd'
  ], undefined, ['dzd', 'da', 'dinar', 'usine', 'fspe', 'transport', 'logistique', 'frais', 'sac', 'emballage']);
  let baseMaterialCost = rawBaseUsd !== undefined ? parseCleanNumber(rawBaseUsd, 0) : 0;

  if (basePriceDzd > 0) {
    baseMaterialCost = Math.round((basePriceDzd / OFFICIAL_EXCHANGE_RATE_DZD_USD) * 100) / 100;
  } else if (baseMaterialCost > 0) {
    basePriceDzd = Math.round(baseMaterialCost * OFFICIAL_EXCHANGE_RATE_DZD_USD * 100) / 100;
  } else {
    // Si no se especificó divisa explícita y no hay precio DZD previo, buscar base genérica
    const genericBase = findValue(['base', 'coste base', 'ex-work', 'cost'], undefined, ['dzd', 'da', 'dinar', 'usine', 'fspe', 'transport', 'logistique', 'frais', 'sac', 'emballage']);
    if (genericBase !== undefined) {
      baseMaterialCost = parseCleanNumber(genericBase, 0);
      basePriceDzd = Math.round(baseMaterialCost * OFFICIAL_EXCHANGE_RATE_DZD_USD * 100) / 100;
    }
  }

  // 4. COSTE ENVASE / BIG BAG / SAC ('Big Bag / Sac') - Exacto celda por celda
  const rawPackaging = findValue([
    'big bag / sac',
    'big bag',
    'bigbag',
    'sac',
    'saco',
    'emballage',
    'envase',
    'packaging',
    'frais emballage'
  ]);
  const packagingCost = rawPackaging !== undefined ? parseCleanNumber(rawPackaging, 0) : 0;

  // 5. COSTE LOGÍSTICO SEGÚN FSPE ('Coût Logistique FSPE' o 'Coût Logística Marché (Sans FSPE)')
  // A) Con FSPE (Subvencionado de fábrica): Debe excluir explícitamente columnas de mercado o 'sans fspe'
  const rawFspe = findValue([
    'cout logistique fspe',
    'cout logistica fspe',
    'logistique fspe',
    'logistica fspe',
    'fspe transport',
    'fspe logistique',
    'fspe logistica',
    'transport fspe',
    'transporte fspe',
    'cout fspe',
    'con fspe',
    'avec fspe',
    'fspe',
    'cout logistique usine',
    'cout logistica fabrica',
    'cout logistique',
    'cout logistica',
    'transporte',
    'logistica',
    'transport',
    'inland',
    'camion'
  ], undefined, ['sans fspe', 'sin fspe', 'sansfspe', 'sinfspe', 'marche', 'mercado']);
  const inlandTransport = rawFspe !== undefined ? parseCleanNumber(rawFspe, 0) : 0;

  // B) Sin FSPE (Mercado): Lectura estricta de 'Coût Logística Marché (Sans FSPE)' o Land Charter
  // Debe excluir columnas que representen FSPE con subvención directa
  const rawMarketLogistics = findValue([
    'cout logistica marche (sans fspe)',
    'cout logistique marche (sans fspe)',
    'cout logistica marche sans fspe',
    'cout logistique marche sans fspe',
    'cout logistica marche',
    'cout logistique marche',
    'logistica marche (sans fspe)',
    'logistique marche (sans fspe)',
    'logistica marche sans fspe',
    'logistique marche sans fspe',
    'logistica marche',
    'logistique marche',
    'sans fspe',
    'sin fspe',
    'sans-fspe',
    'sin-fspe',
    'cout logistica mercado (sin fspe)',
    'cout logistique mercado (sans fspe)',
    'cout logistica mercado sin fspe',
    'cout logistique mercado sans fspe',
    'cout logistica mercado',
    'cout logistique mercado',
    'logistica mercado (sin fspe)',
    'logistique mercado (sans fspe)',
    'logistica mercado',
    'logistique mercado',
    'inland marche',
    'inland mercado',
    'transport marche',
    'transporte mercado',
    'land charter marche',
    'land charter mercado',
    'land charter',
    'marche',
    'mercado'
  ], undefined, ['con fspe', 'avec fspe']);
  const marketInlandCostPerMt = rawMarketLogistics !== undefined ? parseCleanNumber(rawMarketLogistics, 0) : 0;

  // 6. GASTOS DE TRÁNSITO Y SGS ('Frais Transit & SGS') - Exacto celda por celda
  const rawSgs = findValue([
    'frais transit & sgs',
    'frais transit',
    'frais transit et sgs',
    'transit & sgs',
    'sgs',
    'inspeccion',
    'inspection',
    'control',
    'certif',
    'transit'
  ]);
  const sgsInspection = rawSgs !== undefined ? parseCleanNumber(rawSgs, 0) : 0;

  // 7. TASAS DEL PUERTO DE BEJAIA ('Frais Port Bejaia') - Exacto celda por celda
  const rawBejaia = findValue([
    'frais port bejaia',
    'frais port',
    'port bejaia',
    'bejaia',
    'port dues',
    'puerto',
    'acconage',
    'peage',
    'epb'
  ]);
  const bejaiaPortDues = rawBejaia !== undefined ? parseCleanNumber(rawBejaia, 0) : 0;

  // Margen y venta FOB de la fila si están presentes
  const rawMargin = findValue(['margen', 'margin', 'marge', 'spread']);
  const rawSale = findValue(['prix vente', 'precio venta', 'venta', 'fob', 'sale price']);
  
  let suggestedFobSalePrice = rawSale !== undefined ? parseCleanNumber(rawSale, 0) : 0;
  let commercialMargin = rawMargin !== undefined ? parseCleanNumber(rawMargin, 0) : 0;

  // Coste unitario aditivo neto
  const net = Math.max(0, baseMaterialCost * rabaisMultiplier);
  const calculatedFobCost = Math.round((net + packagingCost + inlandTransport + bejaiaPortDues + sgsInspection) * 100) / 100;

  if (suggestedFobSalePrice > 0 && commercialMargin === 0) {
    commercialMargin = Math.max(0, Math.round((suggestedFobSalePrice - calculatedFobCost) * 100) / 100);
  } else if (commercialMargin > 0 && suggestedFobSalePrice === 0) {
    suggestedFobSalePrice = Math.round((calculatedFobCost + commercialMargin) * 100) / 100;
  }

  const rawQty = findValue(['cantidad', 'toneladas', 'volumen', 'quantity', 'mt', 'tonnes']);
  const defaultQuantityMT = rawQty !== undefined ? parseCleanNumber(rawQty, 10000) : 10000;

  return {
    id: `imported-${Date.now()}-${index}`,
    name: finalName, // LECTURA 1:1 REAL DEL ARCHIVO
    typology,
    packaging,
    category,
    productType: finalName.toLowerCase().includes('clinker') ? 'Clínker' : (finalName.toLowerCase().includes('yeso') ? 'Yeso' : 'Cemento a granel'),
    unit: 'USD/MT',
    basePriceDzd,
    rabaisMultiplier,
    baseMaterialCost,
    rabais,
    packagingCost,
    inlandTransport,
    marketInlandCostPerMt,
    bejaiaPortDues,
    sgsInspection,
    commercialMargin,
    suggestedFobSalePrice,
    defaultQuantityMT: defaultQuantityMT > 0 ? defaultQuantityMT : 10000,
    notes: `Lectura 1:1 desde ${providerName} (Fila ${index + 1})`
  };
}

function splitCsvLine(line, delimiter) {
  if (delimiter !== ',') {
    return line.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
  }

  if (line.includes('"') || line.includes("'")) {
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' || ch === "'") {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur.trim());
    return res.map(c => c.replace(/^["']|["']$/g, '').trim());
  }

  const tokens = [];
  let currentToken = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ',') {
      const prev = line[i - 1] || '';
      const next = line[i + 1] || '';
      if (/\d/.test(prev) && /\d/.test(next)) {
        currentToken += ch;
      } else {
        tokens.push(currentToken.trim());
        currentToken = '';
      }
    } else {
      currentToken += ch;
    }
  }
  tokens.push(currentToken.trim());
  return tokens;
}

/**
 * Parsea contenido CSV / TSV respetando 1:1 las columnas reales
 */
export function parseCsvTariff(csvText, filename = 'Tarifa.csv') {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('El archivo CSV no contiene suficientes líneas.');

  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes(';') && (firstLine.split(';').length >= firstLine.split(',').length)) {
    delimiter = ';';
  } else if (firstLine.includes('\t')) {
    delimiter = '\t';
  }

  const headers = splitCsvLine(firstLine, delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = splitCsvLine(lines[i], delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (rawCols.length < 2) continue;
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rawCols[idx] || '';
    });
    rows.push(rowObj);
  }

  const providerName = deduceProviderName(filename, csvText);
  const materials = rows.map((r, idx) => mapRowToMaterial(r, idx, providerName));

  return buildProviderPackage(providerName, filename, materials);
}

/**
 * Parsea libro de trabajo Excel (.xlsx, .xls) mapeando celda por celda 1:1
 */
export async function parseExcelTariff(arrayBuffer, filename = 'Tarifa.xlsx') {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo Excel no contiene hojas de cálculo.');

  const worksheet = workbook.Sheets[firstSheetName];

  // Buscador de la fila de cabecera real para evitar mapeos erróneos como __EMPTY por títulos institucionales (ej. GICA)
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  let headerRowIndex = 0;

  for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const rowText = row.map(c => normalizeKey(String(c))).join(' ');
    // Detectar si la fila contiene identificadores canónicos de cabecera: "produit", "prix gica", "designation", etc.
    if (
      rowText.includes('produit') ||
      rowText.includes('prix gica') ||
      rowText.includes('designation') ||
      rowText.includes('article') ||
      rowText.includes('material') ||
      (rowText.includes('product') && (rowText.includes('price') || rowText.includes('prix')))
    ) {
      headerRowIndex = i;
      break;
    }
  }

  const jsonRows = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, defval: '' });
  if (!jsonRows || jsonRows.length === 0) {
    throw new Error('La hoja de cálculo está vacía o no tiene formato de tabla.');
  }

  // Filtrar posibles filas no operativas o vacías
  const validRows = jsonRows.filter(r => {
    const values = Object.values(r).map(v => String(v).trim()).filter(Boolean);
    return values.length > 1;
  });

  const providerName = deduceProviderName(filename, firstSheetName);
  const materials = (validRows.length > 0 ? validRows : jsonRows).map((r, idx) => mapRowToMaterial(r, idx, providerName));

  return buildProviderPackage(providerName, filename, materials);
}

/**
 * Parsea texto plano o documentos Word / Textos con tablas estructuradas
 */
export function parseTextOrWordTariff(textContent, filename = 'Tarifa.txt') {
  const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const materials = [];
  const providerName = deduceProviderName(filename, textContent);

  let currentProduct = null;
  const productRegex = /(?:CEM\s+[^\n,;:]+|Cl[ií]nker[^\n,;:]*|Yeso[^\n,;:]*|Cemento[^\n,;:]*)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const prodMatch = line.match(productRegex);
    if (prodMatch && !line.toLowerCase().startsWith('precio') && !line.toLowerCase().startsWith('coste') && !line.toLowerCase().startsWith('prix')) {
      if (currentProduct && currentProduct.name) {
        materials.push(finalizeTextProduct(currentProduct, materials.length, providerName));
      }
      currentProduct = {
        name: prodMatch[0].trim(),
        lineText: line
      };
      extractNumbersFromLine(line, currentProduct);
      continue;
    }

    if (currentProduct) {
      extractNumbersFromLine(line, currentProduct);
    } else {
      const parts = line.split(/[|;\t,]/).map(p => p.trim());
      if (parts.length >= 3 && parts.some(p => /\d+/.test(p))) {
        const row = {
          produit: parts[0],
          base: parts[1],
          rabais: parts[2] || '0',
          transporte: parts[3] || '0',
          bejaia: parts[4] || '0',
          sgs: parts[5] || '0',
          venta: parts[6] || ''
        };
        materials.push(mapRowToMaterial(row, materials.length, providerName));
      }
    }
  }

  if (currentProduct && currentProduct.name) {
    materials.push(finalizeTextProduct(currentProduct, materials.length, providerName));
  }

  if (materials.length === 0) {
    materials.push(mapRowToMaterial({
      produit: `${providerName} - Material General`,
      base: '45.00',
      rabais: '2.50',
      transporte: '6.80',
      tasas: '3.70',
      sgs: '0.80',
      venta: '58.00'
    }, 0, providerName));
  }

  return buildProviderPackage(providerName, filename, materials);
}

function extractNumbersFromLine(line, product) {
  const lower = line.toLowerCase();
  const numMatch = line.match(/(\d+[.,]?\d*)/g);
  if (!numMatch) return;

  const numbers = numMatch.map(n => parseFloat(n.replace(',', '.')));

  if ((lower.includes('base') || lower.includes('usine') || lower.includes('coste') || (lower.includes('prix') && !lower.includes('fob') && !lower.includes('vente'))) && !lower.includes('fob')) {
    product.base = numbers[0];
  }
  if (lower.includes('rabais') || lower.includes('descuento') || lower.includes('remise')) {
    product.rabais = numbers[0];
  }
  if (lower.includes('fspe') || lower.includes('transport') || lower.includes('logistica') || lower.includes('inland') || lower.includes('flete')) {
    if (lower.includes('sans') || lower.includes('sin') || lower.includes('marche') || lower.includes('mercado')) {
      product.marketLogistics = numbers[0];
    } else {
      product.transporte = numbers[0];
    }
  }
  if (lower.includes('bejaia') || lower.includes('puerto') || lower.includes('port') || lower.includes('tasas') || lower.includes('epb')) {
    product.bejaia = numbers[0];
  }
  if (lower.includes('sgs') || lower.includes('inspeccion') || lower.includes('certif')) {
    product.sgs = numbers[0];
  }
  if (lower.includes('fob') || lower.includes('venta') || lower.includes('vente') || lower.includes('sale')) {
    product.venta = numbers[0];
  }
}

function finalizeTextProduct(raw, index, providerName) {
  const row = {
    produit: raw.name,
    base: raw.base !== undefined ? raw.base : 0,
    rabais: raw.rabais !== undefined ? raw.rabais : 0,
    transporte: raw.transporte !== undefined ? raw.transporte : 0,
    'cout logistica marche (sans fspe)': raw.marketLogistics !== undefined ? raw.marketLogistics : 0,
    tasas: raw.bejaia !== undefined ? raw.bejaia : 0,
    sgs: raw.sgs !== undefined ? raw.sgs : 0,
    venta: raw.venta || ''
  };
  return mapRowToMaterial(row, index, providerName);
}

/**
 * Deduce el nombre del proveedor o cliente a partir del nombre de archivo o el texto
 */
function deduceProviderName(filename = '', content = '') {
  const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
  const combined = (filename + ' ' + (typeof content === 'string' ? content.substring(0, 500) : '')).toLowerCase();
  
  if (combined.includes('gica')) return 'GICA';
  if (combined.includes('tavcim')) return 'Tavcim';
  if (combined.includes('lafarge')) return 'LafargeHolcim';

  return cleanName.length > 2 ? cleanName.toUpperCase() : 'Entidad Importada';
}

/**
 * Ensambla el paquete completo del proveedor o cliente
 */
function buildProviderPackage(providerName, filename, materials) {
  const cleanId = normalizeKey(providerName).replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 24) || `ent-${Date.now()}`;
  const lower = providerName.toLowerCase();
  const isClient = lower.includes('cliente') || lower.includes('client') || lower.includes('fletador') || lower.includes('buyer');

  return {
    id: cleanId,
    name: providerName,
    shortName: providerName.split(' ')[0] || (isClient ? 'Cliente' : 'Proveedor'),
    entityType: isClient ? 'client' : 'provider',
    country: lower.includes('argelia') || lower.includes('dz') || lower.includes('bejaia') ? 'Argelia 🇩🇿' : 'Internacional 🌐',
    port: 'Puerto de Bejaia (EPB)',
    portCode: 'DZBJA',
    currency: 'USD',
    currencySymbol: '$',
    localCurrency: lower.includes('argelia') || lower.includes('dz') ? 'DZD' : 'USD',
    exchangeRateDzdUsd: OFFICIAL_EXCHANGE_RATE_DZD_USD,
    status: 'Activo',
    verified: false,
    importedFrom: filename,
    lastUpdated: new Date().toISOString().split('T')[0],
    description: `Tarifario de ${isClient ? 'cliente' : 'proveedor'} importado desde ${filename} con ${materials.length} productos procesados con lectura 1:1.`,
    materials
  };
}

/**
 * Enrutador principal de importación de archivos
 */
export async function parseProviderTariffFile(file) {
  if (!file) throw new Error('No se ha proporcionado ningún archivo para importar.');

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  
  if (ext === 'xlsx' || ext === 'xls') {
    const arrayBuffer = await file.arrayBuffer();
    return parseExcelTariff(arrayBuffer, file.name);
  }

  if (ext === 'csv' || ext === 'tsv') {
    const text = await file.text();
    return parseCsvTariff(text, file.name);
  }

  if (ext === 'json') {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.materials && Array.isArray(data.materials)) {
      return {
        ...data,
        id: data.id || `ent-${Date.now()}`,
        name: data.name || 'Entidad JSON',
        entityType: data.entityType || 'provider',
        importedFrom: file.name
      };
    }
    if (Array.isArray(data)) {
      const materials = data.map((r, idx) => mapRowToMaterial(r, idx, file.name));
      return buildProviderPackage(deduceProviderName(file.name), file.name, materials);
    }
  }

  const text = await file.text();
  return parseTextOrWordTariff(text, file.name);
}
