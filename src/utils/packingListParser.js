import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// FIX: Usar .mjs para que funcione el worker de PDF en versiones nuevas
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const parsePackingListFile = async (file) => {
  if (!file) return [];
  const fileName = file.name.toLowerCase();

  try {
    if (fileName.endsWith('.pdf')) return await parsePDF(file);
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) return await parseExcel(file);
    return parseText(await file.text());
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

    // MAGIA: Ordenar el texto por coordenada Y para reconstruir las filas de la tabla
    const items = content.items.sort((a, b) => {
      if (Math.abs(b.transform[5] - a.transform[5]) > 5) return b.transform[5] - a.transform[5];
      return a.transform[4] - b.transform[4];
    });

    let lastY = -1;
    let currentLine = "";
    items.forEach(item => {
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        fullText += currentLine.trim() + "\n";
        currentLine = "";
      }
      currentLine += item.str + " ";
      lastY = item.transform[5];
    });
    fullText += currentLine.trim() + "\n";
  }
  return parseText(fullText);
};

const parseExcel = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  return parseText(json.map(row => row.join(" ")).join("\n"));
};

const parseText = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const parsedPieces = [];
  
  // Buscar el patrón de dimensiones: ej. 12.00x2.30x2.50
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/i;

  lines.forEach((line, index) => {
    // Ignorar las cabeceras de la tabla
    if (/^(item|n[ºo]|descrip|qty|cant|largo|ancho|alto|peso|weight|dimensiones|categoría)/i.test(line)) return;

    const dimMatch = line.match(dimRegex);
    if (dimMatch) {
      // 1. Extraer dimensiones
      const l = parseFloat(dimMatch[1].replace(',', '.'));
      const w = parseFloat(dimMatch[2].replace(',', '.'));
      const h = parseFloat(dimMatch[3].replace(',', '.'));

      // 2. Partir la línea usando las dimensiones como pivote central
      const parts = line.split(dimMatch[0]);
      const leftSide = parts[0].trim(); // Aquí está el nombre y la cantidad
      const rightSide = parts[1] ? parts[1].trim() : ''; // Aquí están los pesos (8,500 y 34,000)

      // 3. Extraer el Peso (el primer número de la derecha)
      const rightNumbers = rightSide.match(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\b/g);
      let wt = 1000;
      if (rightNumbers && rightNumbers.length > 0) {
        wt = parseFloat(rightNumbers[0].replace(/,/g, '')); // Quita las comas de "8,500" -> 8500
      }

      // 4. Extraer la Cantidad y Descripción de la izquierda
      const leftNumbers = leftSide.match(/\b\d+\b/g);
      let qty = 1;
      let desc = leftSide;
      
      if (leftNumbers && leftNumbers.length > 0) {
        qty = parseInt(leftNumbers[leftNumbers.length - 1], 10);
        // Quitar el número de la descripción
        desc = leftSide.replace(new RegExp(`\\b${qty}\\b\\s*$`), '').trim();
      }

      if (!desc || desc.length < 2) desc = `Bulto #${index + 1}`;

      // Añadir la pieza lista al estado
      parsedPieces.push({
        id: Date.now() + index + Math.random(),
        quantity: qty,
        type: desc.replace(/[-–—|]/g, '').trim(),
        length: l,
        width: w,
        height: h,
        weight: wt,
      });
    }
  });

  return parsedPieces;
};
