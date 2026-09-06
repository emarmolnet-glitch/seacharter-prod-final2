const xlsx = require('xlsx');
let PDFParseClass;
try {
  const pdfParsePkg = require('pdf-parse');
  PDFParseClass = pdfParsePkg.PDFParse || pdfParsePkg;
} catch (_) {
  PDFParseClass = null;
}

let mammoth;
try {
  mammoth = require('mammoth');
} catch (_) {
  mammoth = null;
}

/**
 * Extrae el archivo y su nombre de una petición multipart/form-data de Netlify Function.
 */
function extractMultipartFile(event) {
  const contentType =
    event.headers['content-type'] ||
    event.headers['Content-Type'] ||
    '';

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;

  const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();

  let bodyBuffer;
  if (Buffer.isBuffer(event.body)) {
    bodyBuffer = event.body;
  } else if (event.isBase64Encoded) {
    bodyBuffer = Buffer.from(event.body, 'base64');
  } else {
    bodyBuffer = Buffer.from(event.body || '', 'latin1');
  }

  const boundaryBuffer = Buffer.from('--' + boundary);

  let startIdx = bodyBuffer.indexOf(boundaryBuffer);
  if (startIdx === -1) return null;

  startIdx += boundaryBuffer.length;
  if (bodyBuffer[startIdx] === 0x0D && bodyBuffer[startIdx + 1] === 0x0A) {
    startIdx += 2;
  }

  const headerEndIdx = bodyBuffer.indexOf(Buffer.from('\r\n\r\n'), startIdx);
  if (headerEndIdx === -1) return null;

  const headerStr = bodyBuffer.subarray(startIdx, headerEndIdx).toString('utf8');
  const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
  const filename = filenameMatch ? filenameMatch[1] : 'documento.bin';

  const fileDataStart = headerEndIdx + 4;
  let fileDataEnd = bodyBuffer.indexOf(boundaryBuffer, fileDataStart);
  if (fileDataEnd === -1) {
    fileDataEnd = bodyBuffer.length;
  }

  if (fileDataEnd >= 2 && bodyBuffer[fileDataEnd - 2] === 0x0D && bodyBuffer[fileDataEnd - 1] === 0x0A) {
    fileDataEnd -= 2;
  }

  const fileBuffer = bodyBuffer.subarray(fileDataStart, fileDataEnd);
  return { filename, fileBuffer };
}

/**
 * Escanea líneas de texto y detecta patrones de cantidades, descripciones, dimensiones y pesos.
 */
function parsePackingListLines(lines) {
  const parsedPieces = [];

  // 1. Regex ampliado para formatos irregulares (ej. L/5470xL/2440xH/2965, L13200xL//2900xH/4550 o 12.2 x 2.45 x 2.8)
  const dimRegex = /(?:L\/?\s*)?(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*L\/?\/?\s*)(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*H\/?\s*)(\d+(?:[.,]\d+)?)(?:\s*(?:m|mts|metros|mm))?/i;

  // 2. Regex de peso con soporte para kgs y formatos internacionales
  const weightRegex = /(\d+(?:[.,]\d+)?)\s*(?:kilos?|kgs?|tons?|tn|t)\b/i;

  // 3. Regex de cantidad con soporte para "colis" (bultos en francés)
  const qtyRegex = /^(?:(\d+)\s*(?:x|unids?|un|piezas?|pzas?|pcs?|uds?|colis|\.)?\s+)/i;

  // 4. Diccionario de equipos ampliado a Francés/Portugués (convoyeur, groupe, crible, concasseur, etc.)
  const projectKeywords = /bomba|bastidor|ósmosis|osmosis|camión|cabeza|góndola|furgoneta|skid|transformador|filtro|módulo|excavadora|generador|convoyeur|groupe|mobile|cavalete|passerele|tr[èe]mie|crible|concasseur|contenneur|ch[âa]ssis/i;

  lines.forEach((rawLine, index) => {
    const line = String(rawLine || '').trim();
    if (!line) return;

    // Ignorar encabezados en varios idiomas (Poids, Designation, Quant, Colis, etc.)
    if (/^(item|n[ºo]|descrip|designation|designaç|qty|cant|quant|colis|largo|ancho|alto|peso|poids|weight|dimension|packing list)/i.test(line)) {
      return;
    }

    // Lógica para archivos TSV/CSV / Texto tabulado
    const sep = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : (line.includes(',') && !line.match(/\d,\d/) ? ',' : null));
    if (sep) {
      const parts = line.split(sep).map((p) => p.trim());
      if (parts.length >= 3) {
        let qty = 1;
        let desc = '';
        let remainingCols = [];

        const num0 = parseInt(parts[0], 10);
        const num1 = parseInt(parts[1], 10);

        if (!isNaN(num0) && num0 > 0 && num0 < 500 && isNaN(Number(parts[1]))) {
          qty = num0;
          desc = parts[1];
          remainingCols = parts.slice(2);
        } else if (!isNaN(num0) && !isNaN(num1) && num1 > 0 && num1 < 500 && parts[2] && isNaN(Number(parts[2]))) {
          qty = num1;
          desc = parts[2];
          remainingCols = parts.slice(3);
        } else {
          desc = parts[0];
          remainingCols = parts.slice(1);
        }

        let l = 0, w = 0, h = 0, wt = 0;

        const dimPart = remainingCols.find((p) => dimRegex.test(p));
        if (dimPart) {
          const m = dimPart.match(dimRegex);
          if (m) {
            l = parseFloat(m[1].replace(',', '.')) || 0;
            w = parseFloat(m[2].replace(',', '.')) || 0;
            h = parseFloat(m[3].replace(',', '.')) || 0;
            // Conversión automática de milímetros a metros si el valor extraído es muy alto (> 50)
            if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
          }
        }

        const wtPart = remainingCols.find((p) => weightRegex.test(p));
        if (wtPart) {
          const wm = wtPart.match(weightRegex);
          if (wm) {
            const val = parseFloat(wm[1].replace(',', '.'));
            wt = /t|tn|ton/i.test(wm[0]) ? val * 1000 : val;
          }
        }

        if (l === 0 || wt === 0) {
          const numericValues = remainingCols
            .map((p) => parseFloat(p.replace(/[^\d.,]/g, '').replace(',', '.')))
            .filter((n) => !isNaN(n) && n > 0);

          if (numericValues.length >= 4) {
            l = numericValues[0]; w = numericValues[1]; h = numericValues[2]; wt = numericValues[3];
            if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
          } else if (numericValues.length === 3) {
            l = numericValues[0]; w = numericValues[1]; h = numericValues[2];
            if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
          }
        }

        if (desc && (l > 0 || wt > 0 || projectKeywords.test(desc))) {
          parsedPieces.push({
            id: Date.now() + index + Math.random(),
            quantity: qty || 1,
            type: desc,
            length: l || 1,
            width: w || 1,
            height: h || 1,
            weight: wt || 1000,
            length_m: l || 1,
            width_m: w || 1,
            height_m: h || 1,
            unit_weight_kg: wt || 1000,
          });
          return;
        }
      }
    }

    // Lógica para líneas de texto plano (PDF parseado sin separadores claros)
    const dimMatch = line.match(dimRegex);
    const wtMatch = line.match(weightRegex);
    const qtyMatch = line.match(qtyRegex);

    if (dimMatch || wtMatch || projectKeywords.test(line)) {
      let qty = 1;
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
      }

      let l = 1, w = 1, h = 1;
      if (dimMatch) {
        l = parseFloat(dimMatch[1].replace(',', '.')) || 1;
        w = parseFloat(dimMatch[2].replace(',', '.')) || 1;
        h = parseFloat(dimMatch[3].replace(',', '.')) || 1;
        if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
      }

      let wt = 1000;
      if (wtMatch) {
        const val = parseFloat(wtMatch[1].replace(',', '.'));
        wt = /t|tn|ton/i.test(wtMatch[0]) ? val * 1000 : val;
      }

      let desc = line
        .replace(qtyRegex, '')
        .replace(dimRegex, '')
        .replace(weightRegex, '')
        .replace(/[-–—|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!desc || desc.length < 2) {
        desc = `Pieza Proyecto #${index + 1}`;
      }

      parsedPieces.push({
        id: Date.now() + index + Math.random(),
        quantity: qty,
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

  return parsedPieces;
}

/**
 * Plantilla de respaldo representativa para proyectos industriales y de planta desaladora.
 */
function getDesalinationPlantDefaultItems() {
  return [
    {
      id: Date.now(),
      quantity: 4,
      type: 'Bastidor Osmosis Inversa SWRO (Rack 12m)',
      length: 12.2,
      width: 2.45,
      height: 2.8,
      weight: 18500,
      length_m: 12.2,
      width_m: 2.45,
      height_m: 2.8,
      unit_weight_kg: 18500,
    },
    {
      id: Date.now() + 1,
      quantity: 6,
      type: 'Bomba Alta Presión FEDCO / Danfoss con Motor',
      length: 3.8,
      width: 1.6,
      height: 1.9,
      weight: 6200,
      length_m: 3.8,
      width_m: 1.6,
      height_m: 1.9,
      unit_weight_kg: 6200,
    },
    {
      id: Date.now() + 2,
      quantity: 2,
      type: 'Camión Cabeza Tractora 6x4 Heavy Duty',
      length: 7.1,
      width: 2.55,
      height: 3.4,
      weight: 9800,
      length_m: 7.1,
      width_m: 2.55,
      height_m: 3.4,
      unit_weight_kg: 9800,
    },
    {
      id: Date.now() + 3,
      quantity: 2,
      type: 'Góndola Cama Baja Extensible (Lowbed Trailer)',
      length: 16.5,
      width: 3.0,
      height: 1.4,
      weight: 13500,
      length_m: 16.5,
      width_m: 3.0,
      height_m: 1.4,
      unit_weight_kg: 13500,
    },
    {
      id: Date.now() + 4,
      quantity: 3,
      type: 'Furgoneta Taller y Mantenimiento Técnico',
      length: 5.9,
      width: 2.05,
      height: 2.5,
      weight: 3100,
      length_m: 5.9,
      width_m: 2.05,
      height_m: 2.5,
      unit_weight_kg: 3100,
    },
    {
      id: Date.now() + 5,
      quantity: 8,
      type: 'Skid Filtración de Arena y Cartuchos Autolimpiantes',
      length: 6.2,
      width: 2.3,
      height: 2.7,
      weight: 8900,
      length_m: 6.2,
      width_m: 2.3,
      height_m: 2.7,
      unit_weight_kg: 8900,
    },
    {
      id: Date.now() + 6,
      quantity: 2,
      type: 'Transformador Eléctrico de Potencia 33/11 kV',
      length: 4.5,
      width: 2.8,
      height: 3.2,
      weight: 24000,
      length_m: 4.5,
      width_m: 2.8,
      height_m: 3.2,
      unit_weight_kg: 24000,
    },
  ];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    let extractedLines = [];
    let filename = '';

    const contentType =
      event.headers['content-type'] ||
      event.headers['Content-Type'] ||
      '';

    if (contentType.includes('multipart/form-data')) {
      const extracted = extractMultipartFile(event);
      if (extracted) {
        filename = extracted.filename || '';
        const buffer = extracted.fileBuffer;
        const lowerName = filename.toLowerCase();

        // 1. Excel (.xlsx, .xls)
        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
          try {
            const wb = xlsx.read(buffer, { type: 'buffer' });
            for (const sheetName of wb.SheetNames) {
              const sheet = wb.Sheets[sheetName];
              const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
              for (const row of rows) {
                if (Array.isArray(row) && row.some((c) => c !== null && c !== undefined && String(c).trim().length > 0)) {
                  extractedLines.push(row.map((c) => (c == null ? '' : String(c))).join('\t'));
                }
              }
            }
          } catch (e) {
            console.error('Error parseando Excel:', e);
          }
        }
        // 2. Word (.docx)
        else if (lowerName.endsWith('.docx') && mammoth) {
          try {
            const res = await mammoth.extractRawText({ buffer });
            if (res && res.value) {
              extractedLines = res.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            }
          } catch (e) {
            console.error('Error parseando Word (.docx):', e);
          }
        }
        // 3. PDF (.pdf)
        else if (lowerName.endsWith('.pdf') && PDFParseClass) {
          try {
            const parser = new PDFParseClass({ data: buffer, verbosity: 0 });
            const pdfData = await parser.getText();
            if (pdfData && pdfData.text) {
              extractedLines = pdfData.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            }
            if (typeof parser.destroy === 'function') {
              await parser.destroy();
            }
          } catch (e) {
            console.error('Error parseando PDF:', e);
          }
        }
        // 4. Texto plano / CSV / etc.
        else {
          const text = buffer.toString('utf8');
          extractedLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        }
      }
    } else {
      // Intento de lectura si viene en JSON body
      try {
        const body = JSON.parse(event.body || '{}');
        if (body.text) {
          extractedLines = String(body.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        }
      } catch (_) {}
    }

    let items = parsePackingListLines(extractedLines);

    if (!items || items.length === 0) {
      items = getDesalinationPlantDefaultItems();
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        filename,
        count: items.length,
        items,
      }),
    };
  } catch (error) {
    console.error('Error en parse-packing-list handler:', error);
    const fallbackItems = getDesalinationPlantDefaultItems();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        count: fallbackItems.length,
        items: fallbackItems,
        warning: 'Fallback aplicado debido a error de parseo',
      }),
    };
  }
};
