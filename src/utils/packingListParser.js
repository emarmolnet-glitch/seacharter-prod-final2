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
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/gi;
  
  let match;
  let lastIndex = 0;
  
  // Categorías conocidas en la desaladora de referencia
  const categoriesList = ["Equipos de Proceso", "Maquinaria y Talleres", "Utillaje y Herramientas", "Flota de Vehículos"];
  
  while ((match = dimRegex.exec(text)) !== null) {
      const l = parseFloat(match[1].replace(',', '.'));
      const w = parseFloat(match[2].replace(',', '.'));
      const h = parseFloat(match[3].replace(',', '.'));
      
      let chunk = text.substring(lastIndex, match.index);
      
      // Detectar categoría si aparece en el fragmento previo
      let detectedCategory = "Equipos de Proceso";
      for (const cat of categoriesList) {
          if (chunk.includes(cat)) {
              detectedCategory = cat;
              chunk = chunk.substring(chunk.indexOf(cat) + cat.length);
              break;
          }
      }

      // Extraer Cantidad
      const nums = chunk.match(/\b(\d+)\b/g);
      let qty = 1;
      if (nums && nums.length > 0) {
          const possibleQty = parseInt(nums[nums.length - 1], 10);
          if (possibleQty < 50) qty = possibleQty; 
      }
      
      let desc = chunk.replace(qty.toString(), '').replace(/[-–—|]/g, ' ').replace(/\s+/g, ' ').trim();
      desc = desc.substring(Math.max(0, desc.length - 80)).trim();
      desc = desc.replace(/^[\d.,]+\s*/, '');
      if (!desc || desc.length < 3) desc = "Pieza Proyecto";

      // Capturar pesos y modo de envío hacia adelante
      const lookAhead = text.substring(match.index + match[0].length, match.index + match[0].length + 80);
      const weightMatches = lookAhead.match(/\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)\b/g);
      let unitWt = 1000;
      
      if (weightMatches && weightMatches.length > 0) {
          unitWt = parseFloat(weightMatches[0].replace(/,/g, ''));
          lastIndex = match.index + match[0].length + lookAhead.indexOf(weightMatches[0]) + weightMatches[0].length;
      } else {
          lastIndex = dimRegex.lastIndex;
      }

      // Detectar Modo de Envío Soportado en el texto subsiguiente
      let shippingModeSop = "40' HC Contenedor";
      if (/flat rack|ot\b/i.test(lookAhead)) shippingModeSop = "40' Flat Rack / OT";
      else if (/ro-ro|carga proyecto|camion|tractor/i.test(lookAhead)) shippingModeSop = "Ro-Ro / Carga Proyecto";
      else if (/20' st|iso 20/i.test(lookAhead)) shippingModeSop = "20' ST Contenedor";

      parsedPieces.push({
          id: Date.now() + Math.random(),
          category: detectedCategory,
          quantity: qty,
          type: desc,
          length: l,
          width: w,
          height: h,
          weight: unitWt,
          shipping_mode_supported: shippingModeSop
      });
  }
  return parsedPieces;
};
