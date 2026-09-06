import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Diccionario multilingüe ampliado (Español, Inglés, Francés, Portugués) para Project Cargo y Logística Global
const CATEGORY_DICTIONARY = [
  {
    category: "Contenedores y Embalajes",
    pattern: /contenneur|container|contenedor|contentor|dry|hc\b|flat rack|open top|reefer|iso\b|box|caja|cajón|caisse|caixote|palet|pallet|palete|skid|bulto|colis|package/i
  },
  {
    category: "Flota de Vehículos",
    pattern: /camión|cabeza|tractor|truck|lorry|góndola|remolque|semirremolque|trailer|furgoneta|van|coche|car|pick-up|vehículos|vehículo|auto|autobús|chasis rodante|véhicule|camion|remorque/i
  },
  {
    category: "Maquinaria y Equipos",
    pattern: /maquinaria|machinery|machine|máquina|planta|plant|soldadura|welding|bomba|pump|pompe|compresor|compressor|motor|engine|moteur|trituradora|crusher|concasseur|molino|mill|crible|screen|generador|generator|générateur|grupo móvil|crane|grúa|grue/i
  },
  {
    category: "Estructuras y Calderería",
    pattern: /convoyeur|conveyor|transportador|pasarela|walkway|passerelle|estructura|structure|tolva|hopper|tr[èe]mie|silo|cabalete|escalera|ladder|échell?e|barandilla|perfil|poutre|chasis|goulotte|cangilón|placa de impacto|blindaje|armored/i
  },
  {
    category: "Material Eléctrico y Control",
    pattern: /transformador|transformer|transformateur|cuadro eléctrico|electrical panel|tableau|inversor|inverter|cable|automático|electricidad|climatizador|batería|battery|detector|imán|magnet|motor eléctrico/i
  },
  {
    category: "Tuberías y Accesorios",
    pattern: /tubo|pipe|tuyau|tubería|piping|válvula|valve|soupape|brida|flange|bride|codo|elbow|spool|fitting|manguera|hose|flexible|acople|colector|manifold/i
  },
  {
    category: "Utillaje y Herramientas",
    pattern: /utillaje|tools|outillage|herramienta|alineadores|llaves|wrench|spanner|ensayos|testing|maletín|consumible|bulón|bolt|boulon|tuerca|nut|écrou|arandela|washer|perno|tornillo|grillete|shackle|pasador/i
  },
  {
    category: "Equipos de Proceso",
    pattern: /bastidor|rack|ósmosis|osmosis|skid|reactor|intercambiador|heat exchanger|columna|column|tanque|tank|cuve|recipiente|vessel|separador|filtro|filter|decantador/i
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

    return processUniversalTable(extractedLines);

  } catch (error) {
    console.error("[Project Cargo Parser] Error crítico procesando el archivo:", error);
    return [];
  }
};

/**
 * Procesador heurístico universal optimizado para proyectos industriales, marítimos y logísticos multilingües
 */
const processUniversalTable = (lines) => {
  const parsedPieces = [];

  // Filtro de cabeceras en español, inglés, francés y portugués
  const headerFilterRegex = /^(item|n[ºo]|descrip|designation|designaç|qty|cant|quant|colis|largo|ancho|alto|peso|poids|weight|dimension|packing list|brute|liquide|proyecto|origen|peso total|categoría|description|shippers|consignees|notify|port|vessel|captain|date|incoterms)/i;
  
  // Soporte para dimensiones métricas estándar y formatos con prefijos (dim, L/...)
  const dimRegex = /(?:dim\s*|L\/?\s*)?(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)/i;

  lines.forEach((line, index) => {
    if (headerFilterRegex.test(line)) return;
    if (line.length < 4) return;

    const dimMatch = line.match(dimRegex);
    const hasContainerKeyword = /contenneur|container|contenedor|contentor|dry\b|hc\b|flat rack|open top/i.test(line);

    // Si la línea no tiene dimensiones ni palabra clave de contenedor, se evalúa si aporta valor o se omite
    if (!dimMatch && !hasContainerKeyword) return;

    let l = 2.4, w = 2.3, h = 2.6; // Valores por defecto orientativos para contenedores si faltan cotas
    if (dimMatch) {
      l = parseFloat(dimMatch[1].replace(',', '.'));
      w = parseFloat(dimMatch[2].replace(',', '.'));
      h = parseFloat(dimMatch[3].replace(',', '.'));
      if (l > 50) { l /= 1000; w /= 1000; h /= 1000; } // Conversión milímetros a metros
    } else if (/40'/i.test(line)) {
      l = 12.19; w = 2.44; h = 2.59;
    } else if (/20'/i.test(line)) {
      l = 6.06; w = 2.44; h = 2.59;
    }

    const numericTokens = line.match(/-?\d+(?:[.,]\d+)?/g) || [];
    const cleanNumbers = numericTokens.map(n => parseFloat(n.replace(',', '.')));

    // Extracción inteligente de cantidad (busca enteros pequeños)
    let qty = 1;
    const smallInts = cleanNumbers.filter(n => n > 0 && n < 100 && Number.isInteger(n) && n !== l && n !== w && n !== h);
    if (smallInts.length > 0) {
      qty = smallInts[0];
    }

    // Extracción inteligente de peso unitario
    let unitWt = 1000;
    const potentialWeights = cleanNumbers.filter(n => n >= 50 && n !== l && n !== w && n !== h && n !== qty);
    if (potentialWeights.length > 0) {
      unitWt = Math.min(...potentialWeights);
      if (unitWt > 50000 && potentialWeights.length > 1) {
        const reasonableWeights = potentialWeights.filter(n => n <= 30000);
        if (reasonableWeights.length > 0) unitWt = Math.min(...reasonableWeights);
      }
    }

    // Limpieza profunda de la descripción del artículo
    let desc = line
      .replace(dimRegex, '')
      .replace(/-?\d+(?:[.,]\d+)?/g, ' ')
      .replace(/[/\\|#*_,;()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!desc || desc.length < 2) {
      desc = `Partida / Bulto Industrial #${index + 1}`;
    }

    // Resolución de categoría mediante el diccionario ampliado
    let category = resolveCategory(desc);

    // Asignación inteligente del modo de transporte y estiba
    let shippingModeSop = "40' HC Contenedor";
    if (l > 11.9 || w > 2.3 || unitWt > 30000 || /ro-ro|proyecto|camión|semirremolque|trailer/i.test(desc)) {
      shippingModeSop = "Ro-Ro / Carga Proyecto";
    } else if (l > 6 || w > 2.2 || unitWt > 12000 || /flat rack/i.test(desc)) {
      shippingModeSop = "40' Flat Rack / OT";
    } else if (/20'|iso 20|st\b/i.test(line)) {
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
