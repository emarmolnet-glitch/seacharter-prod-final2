import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// FIX CRÍTICO: pdf.js versión 4+ exige la extensión .mjs para el worker. Esto elimina el error 404 y el bloqueo de CSP.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const parsePackingListFile = async (file) => {
  if (!file) return [];
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith('.pdf')) {
      return await parsePDF(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      return await parseExcel(file);
    } else {
      const text = await file.text();
      return parseText(text);
    }
  } catch (error) {
    console.error("[Project Cargo Parser] Error leyendo el archivo:", error);
    throw error;
  }
};

const parsePDF = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return parseText(fullText);
};

const parseExcel = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  const lines = json.map(row => row.join(" ")).join("\n");
  return parseText(lines);
};

const parseText = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const parsedPieces = [];

  // Detección de dimensiones LxWxH
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|\s+x\s+)(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|\s+x\s+)(\d+(?:[.,]\d+)?)/i;
  // Detección de pesos robusta: captura números con comas (ej. 8,500) antes de kg/ton
  const weightRegex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)\s*(?:kilos?|kg|tons?|tn|t)\b/i;
  const qtyRegex = /^(?:(\d+)\s*(?:x|unids?|un|piezas?|pzas?|pcs?|uds?|\.)?\s+)/i;

  lines.forEach((line, index) => {
    // Ignorar cabeceras
    if (/^(item|n[ºo]|descrip|qty|cant|largo|ancho|alto|peso|weight|dimensiones)/i.test(line)) return;

    const dimMatch = line.match(dimRegex);
    const wtMatch = line.match(weightRegex);
    const qtyMatch = line.match(qtyRegex);

    // Detección algorítmica: si tiene medidas, pesos o palabras clave industriales, es una pieza
    if (dimMatch || wtMatch || /bomba|bastidor|ósmosis|osmosis|camión|cabeza|góndola|furgoneta|skid|transformador|filtro|módulo/i.test(line)) {
      let qty = 1;
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
      }

      let l = 1, w = 1, h = 1;
      if (dimMatch) {
        l = parseFloat(dimMatch[1].replace(',', '.')) || 1;
        w = parseFloat(dimMatch[2].replace(',', '.')) || 1;
        h = parseFloat(dimMatch[3].replace(',', '.')) || 1;
      }

      let wt = null;
      if (wtMatch) {
        // Limpiamos las comas (ej: 8,500 -> 8500)
        const cleanNumStr = wtMatch[1].replace(/,/g, '');
        const val = parseFloat(cleanNumStr);
        wt = /t|tn|ton/i.test(wtMatch[0]) ? val * 1000 : val;
      } else {
        // Fallback: si no dice "kg" pero vemos un número grande (ej. 12,600), lo asumimos como peso
        const fallbackWtMatch = line.match(/\b(\d{3,}(?:[.,]\d{3})*)\b/);
        if (fallbackWtMatch) {
          const cleanNumStr = fallbackWtMatch[1].replace(/,/g, '');
          const val = parseFloat(cleanNumStr);
          if (val > 100) wt = val;
        }
      }

      // Si todo falla, asignamos un peso simbólico bajo
      if (!wt) wt = 1000;

      let desc = line
        .replace(qtyRegex, '')
        .replace(dimRegex, '')
        .replace(weightRegex, '')
        .replace(/[-–—|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!desc || desc.length < 2) desc = `Bulto Proyecto #${index + 1}`;

      parsedPieces.push({
        id: Date.now() + index + Math.random(),
        quantity: qty,
        type: desc,
        length_m: l,
        width_m: w,
        height_m: h,
        unit_weight_kg: wt,
      });
    }
  });

  return parsedPieces;
};
