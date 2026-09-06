import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const parsePackingListFile = async (file) => {
  if (!file) return [];
  const fileName = file.name.toLowerCase();

  try {
    let extractedLines = [];

    // CAPA 1: Enrutamiento estricto por extensión (Evita leer binarios como texto)
    if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        let lastY;
        let lineText = '';
        
        // Reconstrucción geométrica por coordenadas Y (mantiene orden de filas)
        for (let item of content.items) {
          if (lastY !== item.transform[5] && lastY !== undefined) {
            if (lineText.trim()) extractedLines.push(lineText.trim());
            lineText = '';
          }
          lineText += item.str + ' ';
          lastY = item.transform[5];
        }
        if (lineText.trim()) extractedLines.push(lineText.trim());
      }
    } 
    else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      extractedLines = json.map(row => row.filter(Boolean).join(" \t ")).filter(Boolean);
    } 
    else if (fileName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result && result.value) {
        extractedLines = result.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      }
    } 
    else {
      // Archivos de texto plano estrictos (TXT)
      const text = await file.text();
      if (text.startsWith('%PDF-')) {
        console.error("[Parser] Error: Se intentó procesar un PDF binario como texto plano.");
        return [];
      }
      extractedLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    }

    return processHeuristicLines(extractedLines);

  } catch (error) {
    console.error("[Project Cargo Parser] Error crítico procesando el archivo:", error);
    return [];
  }
};

/**
 * Motor heurístico universal para interpretar cualquier formato de línea
 */
const processHeuristicLines = (lines) => {
  const parsedPieces = [];

  // Exclusión estricta de cabeceras comerciales y legales internacionales
  const headerFilterRegex = /^(item|n[ºo]|descrip|designation|designaç|qty|cant|quant|colis|largo|ancho|alto|peso|poids|weight|dimension|packing list|brute|liquide|shippers|consignees|notify|port|vessel|captain|date|incoterms)/i;

  lines.forEach((line, index) => {
    if (headerFilterRegex.test(line)) return;
    if (line.length < 4) return; // Ignorar líneas con muy pocos caracteres

    // Extraer todos los números decimales o enteros de la línea
    const tokens = line.match(/-?\d+(?:[.,]\d+)?/g);
    
    // Si la línea no contiene al menos un número (para dimensiones o pesos), se descarta como texto plano irrelevante
    if (!tokens || tokens.length === 0) return;

    let l = 1, w = 1, h = 1, wt = 1000, qty = 1;

    // Búsqueda heurística de dimensiones (patrón de 3 números consecutivos razonables para carga)
    let foundDims = false;
    for (let i = 0; i <= tokens.length - 3; i++) {
      const n1 = parseFloat(tokens[i].replace(',', '.'));
      const n2 = parseFloat(tokens[i+1].replace(',', '.'));
      const n3 = parseFloat(tokens[i+2].replace(',', '.'));

      // Criterio físico: dimensiones lógicas de piezas industriales o contenedores en metros o mm
      if (n1 > 0 && n2 > 0 && n3 > 0 && n1 < 50000 && n2 < 50000 && n3 < 50000) {
        l = n1; w = n2; h = n3;
        if (l > 50) { l /= 1000; w /= 1000; h /= 1000; } // Conversión mm a metros
        foundDims = true;
        break;
      }
    }

    // Búsqueda heurística de peso (el número más alto de la línea o el que esté cerca de unidades de peso)
    const numericTokens = tokens.map(t => parseFloat(t.replace(',', '.')));
    const potentialWeights = numericTokens.filter(n => n > 50); // Criterio: un bulto pesa más de 50 kg
    
    if (potentialWeights.length > 0) {
      // Por lo general, el peso total o unitario de la línea es el número más alto significativo
      wt = Math.max(...potentialWeights);
      // Si el peso viene expresado en toneladas explícitamente y es pequeño, convertir a kg
      if (wt < 100 && /t\b|tn\b|tons?\b/i.test(line)) {
        wt *= 1000;
      }
    }

    // Búsqueda heurística de cantidad (números enteros pequeños al inicio de línea)
    const smallInts = numericTokens.filter(n => n > 0 && n < 100 && Number.isInteger(n));
    if (smallInts.length > 0 && smallInts[0] !== l && smallInts[0] !== w) {
      qty = smallInts[0];
    }

    // Limpieza de la descripción (eliminando números y símbolos aislados)
    let desc = line
      .replace(/-?\d+(?:[.,]\d+)?/g, '') // Quitar números
      .replace(/[/\\|#*_,;()\[\]]/g, ' ') // Quitar caracteres especiales
      .replace(/\s+/g, ' ')
      .trim();

    if (!desc || desc.length < 2) {
      desc = `Componente Industrial #${index + 1}`;
    }

    // Evaluación automática del modo de transporte basado en gálibo
    let shippingModeSop = "40' HC Contenedor";
    if (l > 11.9 || w > 2.3 || wt > 30000 || /ro-ro|project|camion|trailer|concasseur|groupe|mobile/i.test(line)) {
      shippingModeSop = "Ro-Ro / Carga Proyecto";
    } else if (l > 6 || w > 2.2 || wt > 15000) {
      shippingModeSop = "40' Flat Rack / OT";
    }

    parsedPieces.push({
      id: Date.now() + index + Math.random(),
      category: /camión|cabeza|góndola|furgoneta/i.test(desc) ? "Flota de Vehículos" : "Equipos de Proceso",
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
  });

  return parsedPieces;
};
