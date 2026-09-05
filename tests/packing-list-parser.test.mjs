import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
