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
        
        // Reconstrucción geométrica: crea saltos de línea reales cuando cambia la coordenada Y
        for (let item of content.items) {
          if (lastY !== item.transform[5] && lastY !== undefined) {
            text += '\n';
          }
          text += item.str + ' ';
          lastY = item.transform[5];
        }
        fullText += text + '\n';
      }
      
      const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      return parseLines(lines);
      
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      const lines = json.map(row => row.join(" \t ")).filter(Boolean);
      return parseLines(lines);
      
    } else {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      return parseLines(lines);
    }
  } catch (error) {
    console.error("[Project Cargo Parser] Error leyendo el archivo:", error);
    throw error;
  }
};

const parseLines = (lines) => {
  const parsedPieces = [];
  
  // 1. Regex ampliado para formatos irregulares (ej. L/5470xL/2440xH/2965 o 12.2 x 2.45 x 2.8)
  const dimRegex = /(?:L\/?\s*)?(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*L\/?\/?\s*)(\d+(?:[.,]\d+)?)\s*(?:[xX*×]\s*|x?\s*H\/?\s*)(\d+(?:[.,]\d+)?)(?:\s*(?:m|mts|metros|mm))?/i;
  
  // 2. Regex de peso con soporte para kgs y formatos internacionales
  const weightRegex = /(\d+(?:[.,]\d+)?)\s*(?:kilos?|kgs?|tons?|tn|t)\b/i;
  
  // 3. Regex de cantidad con soporte para "colis" (bultos en francés)
  const qtyRegex = /^(?:(\d+)\s*(?:x|unids?|un|piezas?|pzas?|pcs?|uds?|colis|\.)?\s+)/i;
  
  // 4. Diccionario de equipos ampliado a Francés/Portugués
  const projectKeywords = /bomba|bastidor|ósmosis|osmosis|camión|cabeza|góndola|furgoneta|skid|transformador|filtro|módulo|excavadora|generador|convoyeur|groupe|mobile|cavalete|passerele|tr[èe]mie|crible|concasseur|contenneur|ch[âa]ssis|roulets|grattoirs|bandas/i;

  lines.forEach((line, index) => {
    // Ignorar encabezados en varios idiomas (Poids, Designation, Quant, Colis, etc.)
    if (/^(item|n[ºo]|descrip|designation|designaç|qty|cant|quant|colis|largo|ancho|alto|peso|poids|weight|dimension|packing list|brute|liquide)/i.test(line)) {
      return;
    }

    const dimMatch = line.match(dimRegex);
    const wtMatch = line.match(weightRegex);
    const isProjectCargo = projectKeywords.test(line);

    if (dimMatch || wtMatch || isProjectCargo) {
      let qty = 1;
      const qtyMatch = line.match(qtyRegex);
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
      }

      let l = 1, w = 1, h = 1, wt = 0;

      if (dimMatch) {
        l = parseFloat(dimMatch[1].replace(',', '.')) || 1;
        w = parseFloat(dimMatch[2].replace(',', '.')) || 1;
        h = parseFloat(dimMatch[3].replace(',', '.')) || 1;
        // Conversión automática de milímetros a metros
        if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }
      }

      if (wtMatch) {
        const val = parseFloat(wtMatch[1].replace(',', '.'));
        wt = /t|tn|ton/i.test(wtMatch[0]) ? val * 1000 : val;
      }

      // Fallback para tablas donde los números no tienen "Kg" escrito al lado
      if (wt === 0) {
        const numbers = line.split(/\s+/).map(n => parseFloat(n.replace(',', '.'))).filter(n => !isNaN(n));
        
        const largeNumbers = numbers.filter(n => n >= 100);
        if (largeNumbers.length > 0) {
          wt = Math.max(...largeNumbers); // Asumimos que el número más grande es el peso
        } else if (isProjectCargo) {
          wt = 5000; // Peso heurístico para maquinaria si no hay datos
        } else {
          wt = 1000;
        }

        const smallNumbers = numbers.filter(n => n > 0 && n < 100 && Number.isInteger(n));
        if (!qtyMatch && smallNumbers.length > 0) {
          qty = smallNumbers[0];
        }
      }

      // Limpieza de la descripción
      let desc = line.replace(qtyRegex, '').replace(dimRegex, '').replace(weightRegex, '').replace(/[-–—|]/g, ' ').replace(/\s+/g, ' ').trim();
      desc = desc.replace(/^[\d.,]+\s*/, ''); // Limpiar números sueltos al inicio
      if (!desc || desc.length < 3) desc = `Pieza Proyecto #${index + 1}`;

      // Detección de Categoría
      let category = "Equipos de Proceso";
      if (/camión|cabeza|góndola|furgoneta/i.test(desc)) category = "Flota de Vehículos";
      else if (/herramienta|utillaje/i.test(desc)) category = "Utillaje y Herramientas";

      // Detección del modo de envío soportado según dimensiones y peso
      let shippingModeSop = "40' HC Contenedor";
      if (l > 11.9 || w > 2.3 || wt > 30000) {
        shippingModeSop = "Breakbulk / Ro-Ro";
      } else if (/flat rack|ot\b/i.test(desc)) {
        shippingModeSop = "40' Flat Rack / OT";
      } else if (/ro-ro/i.test(desc)) {
        shippingModeSop = "Ro-Ro / Carga Proyecto";
      }

      // Enviar el objeto formateado para tu ForwarderWorkspace
      parsedPieces.push({
        id: Date.now() + index + Math.random(),
        category: category,
        quantity: qty,
        type: desc,
        length: parseFloat(l.toFixed(2)),
        width: parseFloat(w.toFixed(2)),
        height: parseFloat(h.toFixed(2)),
        weight: parseFloat(wt.toFixed(2)),
        length_m: parseFloat(l.toFixed(2)),
        width_m: parseFloat(w.toFixed(2)),
        height_m: parseFloat(h.toFixed(2)),
        unit_weight_kg: parseFloat(wt.toFixed(2)),
        shipping_mode_supported: shippingModeSop
      });
    }
  });

  return parsedPieces;
};
