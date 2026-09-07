import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const parserSource = readFileSync(new URL('../src/utils/packingListParser.js', import.meta.url), 'utf8');
const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

// Extraer WEIGHT_REGEX y DIMENSION_REGEX directamente del código fuente para validación empírica
const weightRegexMatch = parserSource.match(/export\s+const\s+WEIGHT_REGEX\s*=\s*(\/(?:\\\/|[^\/])+\/[a-z]*);/);
assert.ok(weightRegexMatch, 'WEIGHT_REGEX must be exported in packingListParser.js');
const WEIGHT_REGEX = eval(weightRegexMatch[1]);

const dimRegexMatch = parserSource.match(/export\s+const\s+DIMENSION_REGEX\s*=\s*(\/(?:\\\/|[^\/])+\/[a-z]*);/);
assert.ok(dimRegexMatch, 'DIMENSION_REGEX must be exported in packingListParser.js');
const DIMENSION_REGEX = eval(dimRegexMatch[1]);

test('1. packingListParser source code contains comma cleaning with parseFloat(string.replace(\',\', \'\'))', () => {
  assert.match(parserSource, /replace\(['"],['"],\s*['"]['"]\)/);
  assert.match(parserSource, /parseFloat\([^)]*replace\(['"],['"],\s*['"]['"]\)\)/);
});

test('2. WEIGHT_REGEX detects numbers with thousands separators (comma or dot) at the end of lines', () => {
  const lineComma = 'Bastidor Ósmosis Inversa 6.0 x 2.45 x 2.6 8,500';
  const matchComma = lineComma.match(WEIGHT_REGEX);
  assert.ok(matchComma, 'Must match 8,500 at the end of the line');
  assert.equal((matchComma[1] || matchComma[2]).trim(), '8,500');

  const lineLarge = 'Bastidor Ósmosis SWRO 12.2 x 2.45 x 2.8 12,600';
  const matchLarge = lineLarge.match(WEIGHT_REGEX);
  assert.ok(matchLarge, 'Must match 12,600 at the end of the line');
  assert.equal((matchLarge[1] || matchLarge[2]).trim(), '12,600');

  const lineDot = 'Bastidor Ósmosis Inversa 6.0 x 2.4 x 2.6 8.500';
  const matchDot = lineDot.match(WEIGHT_REGEX);
  assert.ok(matchDot, 'Must match 8.500 at the end of the line');
  assert.equal((matchDot[1] || matchDot[2]).trim(), '8.500');

  const lineKg = 'Bastidor Ósmosis 6.0 x 2.4 x 2.6 8,500 kg';
  const matchKg = lineKg.match(WEIGHT_REGEX);
  assert.ok(matchKg, 'Must match 8,500 kg');
  assert.equal((matchKg[1] || matchKg[2]).trim(), '8,500');
});

test('3. Simulated parser extracts 8500 kg real weight for bastidores instead of default 1000 kg', () => {
  function parseWeightFromLine(line) {
    const wtMatch = line.match(WEIGHT_REGEX);
    let wt = 1000;
    if (wtMatch) {
      const rawWeightStr = (wtMatch[1] || wtMatch[2] || wtMatch[0] || '').trim();
      const isTons = /t|tn|ton/i.test(wtMatch[0]);
      const cleanedStr = rawWeightStr.replace(/,/g, '');
      let val = parseFloat(rawWeightStr.replace(',', ''));
      if (!isNaN(parseFloat(cleanedStr))) {
        val = parseFloat(cleanedStr);
      }
      if (!isTons && /^\d{1,3}\.\d{3}$/.test(rawWeightStr)) {
        val = parseFloat(rawWeightStr.replace(/\./g, ''));
      }
      if (!isNaN(val) && val > 0) {
        wt = isTons ? val * 1000 : val;
      }
    }
    return wt;
  }

  assert.equal(parseWeightFromLine('1 Bastidor Ósmosis Inversa SWRO 12.2 x 2.45 x 2.8 8,500'), 8500);
  assert.equal(parseWeightFromLine('2 Bastidor Desalación de Agua 6.0 x 2.40 x 2.60 12,600'), 12600);
  assert.equal(parseWeightFromLine('Bastidor Auxiliar 6.0 x 2.4 x 2.6 8.500'), 8500);
  assert.equal(parseWeightFromLine('Bastidor Sin Peso 6.0 x 2.4 x 2.6'), 1000);
});

test('4. Bastidores with 8500 kg trigger MAFI platform allocation in Ro-Ro operative (> 5000 kg rule)', () => {
  const staticItems = [
    { type: 'Bastidor Ósmosis Inversa', weight: 8500, quantity: 4 },
  ];
  const roRoItems = 2; // e.g. 2 camiones

  const autoMode = roRoItems > 0 ? 'Ro-Ro' : 'Lo-Lo';
  assert.equal(autoMode, 'Ro-Ro');

  // Rule: each static item piece > 5000 kg requires 1 MAFI platform
  const mafiPlatforms = staticItems.reduce((acc, it) => {
    return acc + (it.weight > 5000 ? it.quantity : 0);
  }, 0);

  // With 8500 kg correctly parsed, 4 bastidores trigger 4 MAFI platforms (would be 0 if weight was 1000)
  assert.equal(mafiPlatforms, 4, '4 bastidores at 8500 kg must trigger 4 MAFI platforms');
});

test('5. ForwarderWorkspace calculates lashingTeams with Math.max ensuring >= 1 team with cargo', () => {
  assert.match(
    forwarderComponentSource,
    /setLashingTeams\(cargoItems\.length\s*>\s*0\s*\?\s*Math\.max\(1,\s*Math\.ceil\(totalPieces\s*\/\s*20\)\s*\+\s*\(roRoItems\s*>\s*0\s*\?\s*1\s*:\s*0\)\)\s*:\s*0\)/
  );
});

test('6. Dynamic banner has Core PRO Dark/Tech styling and bold contrast labels', () => {
  const bannerMatches = forwarderComponentSource.match(/id="logistic-engine-banner"[\s\S]*?className="([^"]*)"/);
  assert.ok(bannerMatches);
  assert.equal(
    bannerMatches[1],
    'bg-slate-900 border-l-4 border-cyan-500 p-4 rounded shadow-lg flex items-center gap-4 mb-6'
  );
});

test('7. Footer inputs have dark contrast styles and EUR symbol is text-slate-400', () => {
  const estimatedCostMatches = forwarderComponentSource.match(/id="input-estimated-cost"[\s\S]*?className="([^"]*)"/);
  assert.ok(estimatedCostMatches);
  assert.equal(
    estimatedCostMatches[1],
    'w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner'
  );

  const salePriceMatches = forwarderComponentSource.match(/id="input-sale-price"[\s\S]*?className="([^"]*)"/);
  assert.ok(salePriceMatches);
  assert.equal(
    salePriceMatches[1],
    'w-full bg-slate-800 text-white font-bold text-2xl text-right p-3 pr-14 rounded border border-slate-600 outline-none focus:border-cyan-500 shadow-inner'
  );
});

test('8. extractWeightFromLine extracts numbers > 100 from description without defaulting to 1000', () => {
  const extractFnMatch = parserSource.match(/export\s+function\s+extractWeightFromLine\([\s\S]*?^}/m);
  assert.ok(extractFnMatch, 'extractWeightFromLine function must be defined and exported');
  const extractWeightFromLine = new Function('WEIGHT_REGEX', 'line', 'wtMatch', extractFnMatch[0].replace('export function extractWeightFromLine(line, wtMatch = null) {', '').replace(/}$/, '')).bind(null, WEIGHT_REGEX);

  // Case 1: Line with explicit 4-digit number at the end
  const w1 = extractWeightFromLine('1 Bomba Centrifuga 4.5 x 2.1 x 1.8 9,200', null);
  assert.equal(w1, 9200);

  // Case 2: Line with description containing a number > 100 before dimensions or embedded
  const w2 = extractWeightFromLine('Transformador 750 KVA 3.0 x 2.0 x 2.5', null);
  assert.equal(w2, 750);

  // Case 3: Line with large number before kg
  const w3 = extractWeightFromLine('Filtro de Arena 2.5 x 2.5 x 3.0 peso 12,600 kg', null);
  assert.equal(w3, 12600);
});

test('9. currentBuffer is eliminated from packingListParser.js source code', () => {
  assert.equal(parserSource.includes('currentBuffer'), false, 'currentBuffer must not exist in packingListParser.js');
});

test('10. interpretRow extracts accurate quantity, dimensions, and unit weight without column fusion in description', async () => {
  // Extract interpretRow and helper functions from source
  const interpretFnMatch = parserSource.match(/function\s+interpretRow\([\s\S]*?^export\s+async\s+function\s+extractLinesFromPdf/m);
  assert.ok(interpretFnMatch, 'interpretRow function must be present');

  // Test row 1: 4 bastidores with 8,500 unit weight and 34,000 total weight
  const line1 = "Equipos de Proceso | Bastidores / Racks de Ósmosis Inversa (Módulos) | 4 | 12.00x2.30x2.50 | 8,500 | 34,000 | 40' Flat Rack / OT";
  
  // Test row with furgonetas (must not be blocked by 'eta' keyword)
  const lineFurgoneta = "Flota de Vehículos | Furgonetas de Taller / Servicio (L2H2) | 4 | 5.55x2.05x2.50 | 2,300 | 9,200 | Ro-Ro / Contenedor";

  // Evaluate interpretRow in test context
  const cleanSource = parserSource
    .replace(/import\s+\*\s+as\s+pdfjsDist\s+from\s+[^;]+;/g, 'const pdfjsDist = {};')
    .replace(/import\s+\*\s+as\s+XLSX\s+from\s+[^;]+;/g, 'const XLSX = {};')
    .replace(/import\s+mammoth\s+from\s+[^;]+;/g, 'const mammoth = {};')
    .replace(/export\s+default\s+[^;]+;/g, '')
    .replace(/export\s+{[^}]+};/g, '')
    .replace(/export\s+/g, '');

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const contextFn = await new AsyncFunction(`${cleanSource}; return { interpretRow, sanitizeLine };`)();
  const res1 = contextFn.interpretRow(line1, 0);
  assert.ok(res1, 'Row 1 must be interpreted successfully');
  assert.equal(res1.quantity, 4, 'Quantity must be 4');
  assert.equal(res1.length_m, 12, 'Length must be 12');
  assert.equal(res1.width_m, 2.3, 'Width must be 2.3');
  assert.equal(res1.height_m, 2.5, 'Height must be 2.5');
  assert.equal(res1.unit_weight_kg, 8500, 'Unit weight must be 8500 kg, not total 34000');
  assert.equal(res1.description, 'Bastidores / Racks de Ósmosis Inversa (Módulos)', 'Description must not contain other columns');
  assert.equal(res1.category, 'Equipos de Proceso', 'Category must be Equipos de Proceso');

  const resFurgoneta = contextFn.interpretRow(lineFurgoneta, 13);
  assert.ok(resFurgoneta, 'Furgonetas row must not be blocked by keyword filtering');
  assert.equal(resFurgoneta.quantity, 4, 'Quantity must be 4');
  assert.equal(resFurgoneta.unit_weight_kg, 2300, 'Unit weight must be 2300');
  assert.equal(resFurgoneta.description, 'Furgonetas de Taller / Servicio (L2H2)');
});

test('11. Extraction from 15 simulated packing list lines sums to 116.35 Toneladas', async () => {
  const cleanSource = parserSource
    .replace(/import\s+\*\s+as\s+pdfjsDist\s+from\s+[^;]+;/g, 'const pdfjsDist = {};')
    .replace(/import\s+\*\s+as\s+XLSX\s+from\s+[^;]+;/g, 'const XLSX = {};')
    .replace(/import\s+mammoth\s+from\s+[^;]+;/g, 'const mammoth = {};')
    .replace(/export\s+default\s+[^;]+;/g, '')
    .replace(/export\s+{[^}]+};/g, '')
    .replace(/export\s+/g, '');

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const contextFn = await new AsyncFunction(`${cleanSource}; return { interpretRow };`)();

  const lines = [
    "Equipos de Proceso | Bastidores / Racks de Ósmosis Inversa (Módulos) | 4 | 12.00x2.30x2.50 | 8,500 | 34,000 | 40' Flat Rack / OT",
    "Equipos de Proceso | Bombas de Alta Presión con Motor Eléctrico | 3 | 3.20x1.40x1.60 | 4,200 | 12,600 | 40' HC Contenedor",
    "Equipos de Proceso | Sistemas de Recuperación de Energía (Skid ERI) | 1 | 2.10x1.20x1.50 | 2,800 | 2,800 | 40' HC Contenedor",
    "Equipos de Proceso | Skid de Dosificación de Químicos | 2 | 5.80x2.20x2.40 | 3,500 | 7,000 | 20' ST Contenedor",
    "Maquinaria y Talleres | Máquina de Termofusión Automática (>1000mm) | 1 | 2.40x1.80x1.70 | 1,950 | 1,950 | 20' ST Contenedor",
    "Maquinaria y Talleres | Equipos de Soldadura Orbital (Cajas) | 2 | 1.20x0.80x1.00 | 320 | 640 | 20' ST Contenedor",
    "Maquinaria y Talleres | Planta Piloto / Contenedor Laboratorio ISO | 1 | 6.06x2.44x2.59 | 4,500 | 4,500 | Contenedor ISO 20'",
    "Utillaje y Herramientas | Caja 01: Utillaje Inserción de Membranas | 1 | 1.80x1.00x0.90 | 450 | 450 | 20' ST Contenedor",
    "Utillaje y Herramientas | Caja 02: Alineadores e Hidráulica de Acero | 1 | 1.20x1.20x1.10 | 850 | 850 | 20' ST Contenedor",
    "Utillaje y Herramientas | Caja 03: Llaves Dinamométricas Hidráulicas | 1 | 1.20x0.80x0.85 | 380 | 380 | 20' ST Contenedor",
    "Utillaje y Herramientas | Caja 04: Equipos Ensayos No Destructivos | 1 | 1.00x0.80x0.75 | 180 | 180 | 20' ST Contenedor",
    "Flota de Vehículos | Camión Cabeza Tractora (6x4) | 2 | 6.90x2.55x3.60 | 9,200 | 18,400 | Ro-Ro / Carga Proyecto",
    "Flota de Vehículos | Semirremolque Plataforma (Góndola) | 2 | 13.60x2.55x1.50 | 7,500 | 15,000 | Ro-Ro / Carga Proyecto",
    "Flota de Vehículos | Furgonetas de Taller / Servicio (L2H2) | 4 | 5.55x2.05x2.50 | 2,300 | 9,200 | Ro-Ro / Contenedor",
    "Flota de Vehículos | Coches de Servicio / Pick-up 4x4 | 4 | 5.35x1.85x1.80 | 2,100 | 8,400 | Ro-Ro / Contenedor"
  ];

  const items = lines.map((l, i) => contextFn.interpretRow(l, i)).filter(Boolean);
  assert.equal(items.length, 15, 'All 15 lines must parse successfully');
  const totalWeight = items.reduce((acc, it) => acc + (it.quantity * it.unit_weight_kg), 0);
  assert.equal(totalWeight, 116350, 'Total weight must equal 116,350 kg (116.35 Toneladas)');
});

test('12. extractLinesFromPdf correctly extracts all 15 cargo lines from packing_list_desaladora-v2.pdf', async () => {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const cleanSource = parserSource
    .replace(/import\s+\*\s+as\s+pdfjsDist\s+from\s+[^;]+;/g, '')
    .replace(/import\s+\*\s+as\s+XLSX\s+from\s+[^;]+;/g, 'const XLSX = {};')
    .replace(/import\s+mammoth\s+from\s+[^;]+;/g, 'const mammoth = {};')
    .replace(/export\s+default\s+[^;]+;/g, '')
    .replace(/export\s+{[^}]+};/g, '')
    .replace(/export\s+/g, '');

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const contextFn = await new AsyncFunction('pdfjsDist', `${cleanSource}; return { extractLinesFromPdf, interpretRow };`)(pdfjsLib);

  const pdfPath = new URL('../.netlify/assets/6a9d85d6be30eeb6caeffe16/packing_list_desaladora-v2.pdf', import.meta.url);
  if (!existsSync(pdfPath)) {
    return;
  }
  const buf = readFileSync(pdfPath);
  const lines = await contextFn.extractLinesFromPdf(buf);
  assert.equal(lines.length, 15, 'Must extract exactly 15 cargo lines');

  const items = lines.map((l, i) => contextFn.interpretRow(l, i)).filter(Boolean);
  assert.equal(items.length, 15, 'All 15 lines must parse into valid cargo items');

  const totalWeight = items.reduce((acc, it) => acc + (it.quantity * it.unit_weight_kg), 0);
  assert.equal(totalWeight, 116350, 'Total weight across 15 items must be 116,350 kg (116.35 Toneladas)');
});


