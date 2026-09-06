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
        
        let lastY;
        let text = '';
        
        // Reconstrucción geométrica: evita que columnas separadas se fusionen
        for (let item of content.items) {
          if (lastY !== item.transform[5] && lastY !== undefined) {
            text += '\n';
          }
          text += item.str + ' ';
          lastY = item.transform[5];
        }
        fullText += text + '\n';
      }
      return parseText(fullText);
      
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      return parseText(json.map(row => row.join(" ")).join("\n"));
      
    } else {
      const text = await file.text();
      // Cortafuegos: Abortar si el archivo leído como texto es en realidad un binario PDF
      if (text.startsWith('%PDF-')) {
        console.warn("[Project Cargo Parser] Bloqueo de seguridad: Evitada lectura de binario PDF como texto plano.");
        return [];
      }
      return parseText(text);
    }
  } catch (error) {
    console.error("[Project Cargo Parser] Error leyendo el archivo:", error);
    return [];
  }
};

const parseText = (text) => {
  const parsedPieces = [];
  
  // Regex calibrada para formatos estándar, con barras (L/100xW/100xH/100) o prefijo (dim 100x100x100)
  const dimRegex = /(?:dim\s*|L\/?\s*)?(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*L\/?\/?\s*)(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*H\/?\s*)(\d+(?:[.,]\d+)?)/gi;
  
  let match;
  let lastIndex = 0;
  
  const categoriesList = ["Equipos de Proceso", "Maquinaria y Talleres", "Utillaje y Herramientas", "Flota de Vehículos"];
  const projectKeywords = /bomba|bastidor|ósmosis|camión|cabeza|góndola|furgoneta|skid|transformador|concasseur|broyeur|crible|groupe mobile|contenneur|flat/i;
  
  while ((match = dimRegex.exec(text)) !== null) {
      let l = parseFloat(match[1].replace(',', '.'));
      let w = parseFloat(match[2].replace(',', '.'));
      let h = parseFloat(match[3].replace(',', '.'));
      
      // Conversión automática de milímetros a metros
      if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
      
      let chunk = text.substring(lastIndex, match.index);
      
      let detectedCategory = "Equipos de Proceso";
      for (const cat of categoriesList) {
          if (chunk.includes(cat)) {
              detectedCategory = cat;
              chunk = chunk.substring(chunk.indexOf(cat) + cat.length);
              break;
          }
      }

      // Extraer Cantidad (retrocediendo desde las dimensiones)
      const nums = chunk.match(/\b(\d+)\b/g);
      let qty = 1;
      if (nums && nums.length > 0) {
          const possibleQty = parseInt(nums[nums.length - 1], 10);
          if (possibleQty > 0 && possibleQty < 500) qty = possibleQty; 
      }
      
      // Limpieza de descripción
      let desc = chunk.replace(qty.toString(), '').replace(/[-–—|()]/g, ' ').replace(/\s+/g, ' ').trim();
      desc = desc.substring(Math.max(0, desc.length - 80)).trim();
      desc = desc.replace(/^[\d.,]+\s*/, '');
      if (!desc || desc.length < 3) desc = "Pieza Proyecto";

      // Capturar pesos y modo de envío en los siguientes 100 caracteres
      const lookAhead = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
      const weightMatches = lookAhead.match(/(\d+(?:[.,]\d+)?)\s*(?:kilos?|kgs?|tons?|tn|t)\b/i);
      
      let unitWt = 1000;
      
      if (weightMatches) {
          const val = parseFloat(weightMatches[1].replace(/,/g, ''));
          unitWt = /t|tn|ton/i.test(weightMatches[0]) ? val * 1000 : val;
          lastIndex = match.index + match[0].length + lookAhead.indexOf(weightMatches[0]) + weightMatches[0].length;
      } else {
          // Si no hay unidad (Kgs), buscar el primer número grande aislado
          const fallbackWeight = lookAhead.match(/\b(\d{3,}(?:[.,]\d+)?)\b/);
          if (fallbackWeight) {
              unitWt = parseFloat(fallbackWeight[1].replace(/,/g, ''));
              lastIndex = match.index + match[0].length + lookAhead.indexOf(fallbackWeight[0]) + fallbackWeight[0].length;
          } else {
              unitWt = projectKeywords.test(desc) ? 5000 : 1000;
              lastIndex = dimRegex.lastIndex;
          }
      }

      // Determinar el Modo de Envío sugerido
      let shippingModeSop = "40' HC Contenedor";
      if (l > 11.9 || w > 2.3 || unitWt > 30000 || /ro-ro|carga proyecto|camion|tractor|groupe mobile|concasseur/i.test(desc)) {
          shippingModeSop = "Ro-Ro / Carga Proyecto";
      } else if (/flat rack|ot\b|contenneur|flat/i.test(lookAhead) || /flat rack|ot\b|contenneur|flat/i.test(desc)) {
          shippingModeSop = "40' Flat Rack / OT";
      } else if (/20' st|iso 20/i.test(lookAhead)) {
          shippingModeSop = "20' ST Contenedor";
      }

      parsedPieces.push({
          id: Date.now() + Math.random(),
          category: detectedCategory,
          quantity: qty,
          type: desc,
          length: parseFloat(l.toFixed(2)),
          width: parseFloat(w.toFixed(2)),
          height: parseFloat(h.toFixed(2)),
          weight: parseFloat(unitWt.toFixed(2)),
          length_m: parseFloat(l.toFixed(2)),
          width_m: parseFloat(w.toFixed(2)),
          height_m: parseFloat(h.toFixed(2)),
          unit_weight_kg: parseFloat(unitWt.toFixed(2)),
          shipping_mode_supported: shippingModeSop
      });
  }
  return parsedPieces;
};
