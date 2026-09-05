import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const parsePackingListFile = async (file) => {
  if (!file) return [];
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(" ") + " ";
      }
      return parseText(fullText);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      return parseText(json.map(row => row.join(" ")).join("\n"));
    } else {
      return parseText(await file.text());
    }
  } catch (error) {
    console.error("[Project Cargo Parser] Error leyendo el archivo:", error);
    throw error;
  }
};

const parseText = (text) => {
  const parsedPieces = [];
  // Radar de dimensiones: Encuentra cualquier formato 12.00x2.30x2.50
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/gi;
  
  let match;
  let lastIndex = 0;
  
  while ((match = dimRegex.exec(text)) !== null) {
      const l = parseFloat(match[1].replace(',', '.'));
      const w = parseFloat(match[2].replace(',', '.'));
      const h = parseFloat(match[3].replace(',', '.'));
      
      // Aislar el bloque de texto justo anterior a la dimensión
      let chunk = text.substring(lastIndex, match.index);
      
      // Extraer Cantidad (el último número suelto antes de la dimensión)
      const nums = chunk.match(/\b(\d+)\b/g);
      let qty = 1;
      if (nums && nums.length > 0) {
          const possibleQty = parseInt(nums[nums.length - 1], 10);
          if (possibleQty < 50) qty = possibleQty; 
      }
      
      // Limpiar el nombre de la pieza
      let desc = chunk.replace(qty.toString(), '').replace(/[-–—|]/g, ' ').replace(/\s+/g, ' ').trim();
      desc = desc.substring(Math.max(0, desc.length - 60)).trim(); // Quedarse solo con lo último
      desc = desc.replace(/^[\d.,]+\s*/, ''); // Quitar restos de peso del item anterior
      if (!desc || desc.length < 3) desc = "Pieza Proyecto";

      // Mirar hacia adelante para capturar el peso (ej. 8,500)
      const lookAhead = text.substring(match.index + match[0].length, match.index + match[0].length + 40);
      const weightMatch = lookAhead.match(/\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)\b/);
      let wt = 1000;
      
      if (weightMatch) {
          wt = parseFloat(weightMatch[1].replace(/,/g, ''));
          lastIndex = match.index + match[0].length + weightMatch.index + weightMatch[0].length;
      } else {
          lastIndex = dimRegex.lastIndex;
      }

      parsedPieces.push({
          id: Date.now() + Math.random(),
          quantity: qty,
          type: desc,
          length: l,
          width: w,
          height: h,
          weight: wt
      });
  }
  return parsedPieces;
};
