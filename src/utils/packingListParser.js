import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Matriz de clasificación multisectorial ampliada para Project Cargo y Logística Industrial
const CATEGORY_DICTIONARY = [
  {
    category: "Flota de Vehículos",
    pattern: /camión|cabeza|tractor|góndola|remolque|semirremolque|furgoneta|coche|pick-up|vehículos|vehículo|auto|autobús|trailer|chasis rodante/i
  },
  {
    category: "Maquinaria y Talleres",
    pattern: /maquinaria|máquina|planta|soldadura|bomba|compresor|motor|trituradora|molino|crible|concasseur|broyeur|generador|grupo móvil|crane|grúa|trituración/i
  },
  {
    category: "Estructuras Metálicas",
    pattern: /convoyeur|transportador|pasarela|estructura|tolva|silo|cabalete|escalera|barandilla|perfil|poutre|chasis|goulotte|cangilón|placa de impacto|blindaje|tr[èe]mie/i
  },
  {
    category: "Material Eléctrico y Control",
    pattern: /transformador|cuadro eléctrico|panel|inversor|cable|automático|electricidad|climatizador|batería|detector|imán|motor eléctrico|armario eléctrico/i
  },
  {
    category: "Tuberías y Accesorios",
    pattern: /tubo|tubería|válvula|brida|codo|spool|fitting|manguera|flexible|acople|colector/i
  },
  {
    category: "Utillaje y Herramientas",
    pattern: /utillaje|herramienta|caja|alineadores|llaves|ensayos|maletín|consumible|bulón|tuerca|arandela|perno|tornillo|grillete|pasador|bague/i
  },
  {
    category: "Equipos de Proceso",
    pattern: /bastidor|ósmosis|osmosis|skid|reactor|intercambiador|columna|tanque|recipiente|separador|filtro|decantador/i
  }
];

const resolveCategory = (description) => {
  for (const entry of CATEGORY_DICTIONARY) {
    if (entry.pattern.test(description)) {
      return entry.category;
    }
  }
  return "Equipos de Proceso";
};

export const parsePackingListFile = async (file) => {
  if (!file) return [];
  const fileName = file.name.toLowerCase();

  try {
    let extractedLines = [];

    if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        const linesMap = [];
        content.items.forEach(item => {
          const x = item.transform[4];
          const y = item.transform[5];
          let line = linesMap.find(l => Math.abs(l.y - y) < 6);
          if (!line) {
            line = { y: y, items: [] };
            linesMap.push(line);
          }
          line.items.push({ x: x, str: item.str });
        });

        linesMap.sort((a, b) => b.y - a.y);

        linesMap.forEach(line => {
          line.items.sort((a, b) => a.x - b.x);
          const lineStr = line.items.map(i => i.str).join(' ').trim();
          if (lineStr) extractedLines.push(lineStr);
        });
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
      const text = await file.text();
      if (text.startsWith('%PDF-')) {
        console.error("[Parser] Error: Se intentó procesar un PDF binario como texto plano.");
        return [];
      }
      extractedLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    }

    return processStructuredTable(extractedLines);

  } catch (error) {
    console.error("[Project Cargo Parser] Error crítico procesando el archivo:", error);
    return [];
  }
};

const processStructuredTable = (lines) => {
  const parsedPieces = [];

  const headerFilterRegex = /^(item|n[ºo]|descrip|designation|designaç|qty|cant|quant|colis|largo|ancho|alto|peso|poids|weight|dimension|packing list|brute|liquide|proyecto|origen|peso total|categoría|description)/i;
  const dimRegex = /(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/i;

  lines.forEach((line, index) => {
    if (headerFilterRegex.test(line)) return;
    if (line.length < 5) return;

    const dimMatch = line.match(dimRegex);
    if (!dimMatch) return;

    let l = parseFloat(dimMatch[1].replace(',', '.'));
    let w = parseFloat(dimMatch[2].replace(',', '.'));
    let h = parseFloat(dimMatch[3].replace(',', '.'));

    if (l > 50) { l /= 1000; w /= 1000; h /= 1000; }

    const numericTokens = line.match(/-?\d+(?:[.,]\d+)?/g) || [];
    const cleanNumbers = numericTokens.map(n => parseFloat(n.replace(',', '.')));

    let qty = 1;
    const smallInts = cleanNumbers.filter(n => n > 0 && n < 100 && Number.isInteger(n) && n !== l && n !== w && n !== h);
    if (smallInts.length > 0) {
      qty = smallInts[0];
    }

    let unitWt = 1000;
    const potentialWeights = cleanNumbers.filter(n => n >= 100 && n !== l && n !== w && n !== h && n !== qty);
    if (potentialWeights.length > 0) {
      unitWt = Math.min(...potentialWeights);
      if (unitWt > 50000 && potentialWeights.length > 1) {
        const reasonableWeights = potentialWeights.filter(n => n <= 30000);
        if (reasonableWeights.length > 0) unitWt = Math.min(...reasonableWeights);
      }
    }

    let desc = line
      .replace(dimRegex, '')
      .replace(/-?\d+(?:[.,]\d+)?/g, ' ')
      .replace(/[/\\|#*_,;()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!desc || desc.length < 2) {
      desc = `Partida Industrial #${index + 1}`;
    }

    let category = resolveCategory(desc);

    let shippingModeSop = "40' HC Contenedor";
    if (l > 11.9 || w > 2.3 || unitWt > 30000 || /ro-ro|proyecto|camión|semirremolque/i.test(desc)) {
      shippingModeSop = "Ro-Ro / Carga Proyecto";
    } else if (l > 6 || w > 2.2 || unitWt > 12000) {
      shippingModeSop = "40' Flat Rack / OT";
    } else if (/20'|iso 20/i.test(line)) {
      shippingModeSop = "20' ST Contenedor";
    }

    parsedPieces.push({
      id: Date.now() + index + Math.random(),
      category: category,
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
  });

  return parsedPieces;
};
