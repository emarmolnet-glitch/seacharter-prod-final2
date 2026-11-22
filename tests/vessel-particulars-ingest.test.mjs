import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDeterministicParticulars, normalizeFlagCode } from '../netlify/functions/_shared/vessel-particulars-parser.mjs';

const [indexSource, endpointSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../netlify/functions/vessel-particulars-ingest.ts', import.meta.url), 'utf8'),
]);

test('1. Deterministic parser extracts Baltic description correctly (BBC UKRAINE example)', () => {
  const rawText = "M/V BBC UKRAINE, IMO 9811983, Built 2021, 12500 DWT, 13.5 kt on 14.5 mt VLSFO, port 1.8 mt MGO";
  const parsed = parseDeterministicParticulars(rawText);

  assert.ok(parsed, 'Parser returned a result');
  assert.equal(parsed.vessel_name, 'BBC UKRAINE');
  assert.equal(parsed.imo_number, '9811983');
  assert.equal(parsed.year_built, 2021);
  assert.equal(parsed.dwt, 12500);
  assert.equal(parsed.spd_ballast, 13.5);
  assert.equal(parsed.spd_laden, 13.5);
  assert.equal(parsed.cons_sea, 14.5);
  assert.equal(parsed.cons_port, 1.8);
});

test('2. Deterministic parser extracts full multi-line Baltic particulars (OCEAN TRADER example)', () => {
  const balticText = `M/V OCEAN TRADER
IMO: 9456123
FLAG: PANAMA
BUILT: 2011
DWT: 32,500 MT ON 10.2M SSW
DWCC: ABT 31,000 MT
GT / NT: 21,200 / 11,500
LOA / BEAM: 179.90 M / 28.40 M
DRAFT: 10.2 M
SPEED & CONSUMPTION:
BALLAST: ABT 13.5 KTS ON ABT 22.0 MT VLSFO + 0.1 MT MGO
LADEN: ABT 12.5 KTS ON ABT 24.5 MT VLSFO + 0.1 MT MGO
IN PORT IDLE: ABT 1.8 MT VLSFO / WORKING: ABT 2.5 MT VLSFO`;

  const parsed = parseDeterministicParticulars(balticText);

  assert.ok(parsed, 'Parser returned a result');
  assert.equal(parsed.vessel_name, 'OCEAN TRADER');
  assert.equal(parsed.imo_number, '9456123');
  assert.equal(parsed.flag, 'PANAMA');
  assert.equal(parsed.year_built, 2011);
  assert.equal(parsed.dwt, 32500);
  assert.equal(parsed.dwcc, 31000);
  assert.equal(parsed.gross_tonnage, 21200);
  assert.equal(parsed.net_tonnage, 11500);
  assert.equal(parsed.loa_meters, 179.9);
  assert.equal(parsed.beam_meters, 28.4);
  assert.equal(parsed.draft_meters, 10.2);
  assert.equal(parsed.spd_ballast, 13.5);
  assert.equal(parsed.spd_laden, 12.5);
  assert.equal(parsed.cons_sea, 24.5);
  assert.equal(parsed.cons_port, 1.8);
});

test('3. Deterministic parser handles Spanish WhatsApp message format', () => {
  const spanishText = `M/V ATLANTIC STAR
IMO: 9123456
Bandera: Panama
Año: 2015
DWT: 18500 mts
Calado: 8.9 m
Eslora: 145 m
Manga: 22.5 m
Velocidad: 12.0 kt / Consumo mar: 13.5 t/d
Consumo puerto: 1.2 t/d`;

  const parsed = parseDeterministicParticulars(spanishText);

  assert.ok(parsed, 'Parser returned a result');
  assert.equal(parsed.vessel_name, 'ATLANTIC STAR');
  assert.equal(parsed.imo_number, '9123456');
  assert.equal(parsed.flag, 'Panama');
  assert.equal(parsed.year_built, 2015);
  assert.equal(parsed.dwt, 18500);
  assert.equal(parsed.draft_meters, 8.9);
  assert.equal(parsed.loa_meters, 145);
  assert.equal(parsed.beam_meters, 22.5);
  assert.equal(parsed.spd_ballast, 12.0);
  assert.equal(parsed.spd_laden, 12.0);
  assert.equal(parsed.cons_sea, 13.5);
  assert.equal(parsed.cons_port, 1.2);
});

test('4. normalizeFlagCode standardizes flags to max 3 characters or null', () => {
  assert.equal(normalizeFlagCode("ANTIGUA & BARBUDA"), "AG");
  assert.equal(normalizeFlagCode("ANTIGUA AND BARBUDA"), "AG");
  assert.equal(normalizeFlagCode("Panama"), "PA");
  assert.equal(normalizeFlagCode("Liberia"), "LR");
  assert.equal(normalizeFlagCode("Marshall Islands"), "MH");
  assert.equal(normalizeFlagCode("Malta"), "MT");
  assert.equal(normalizeFlagCode("Bahamas"), "BS");
  assert.equal(normalizeFlagCode("Cyprus"), "CY");
  assert.equal(normalizeFlagCode("Singapore"), "SG");
  assert.equal(normalizeFlagCode("Hong Kong"), "HK");
  assert.equal(normalizeFlagCode("Portugal"), "PT");
  assert.equal(normalizeFlagCode("Spain"), "ES");
  assert.equal(normalizeFlagCode("España"), "ES");
  assert.equal(normalizeFlagCode("PA"), "PA");
  assert.equal(normalizeFlagCode("PAN"), "PAN");
  assert.equal(normalizeFlagCode("LR"), "LR");
  assert.equal(normalizeFlagCode("UNKNOWN_LONG_FLAG_STRING"), null);
  assert.equal(normalizeFlagCode(""), null);
  assert.equal(normalizeFlagCode(null), null);
});

test('5. Backend endpoint vessel-particulars-ingest.ts uses UPDATE first then conditional INSERT and detailed error reporting', () => {
  // Config path
  assert.match(endpointSource, /\/api\/vessel-particulars-ingest/);
  assert.match(endpointSource, /\/\.netlify\/functions\/vessel-particulars-ingest/);

  // CORS
  assert.match(endpointSource, /createCorsHeaders\(req,\s*"POST,\s*OPTIONS"\)/);

  // Action parse and upsert
  assert.match(endpointSource, /action === "parse"/);
  assert.match(endpointSource, /action === "upsert"/);

  // IMO validation (strict 7 digits)
  assert.match(endpointSource, /\/\^\\d\{7\}\$\//);
  assert.match(endpointSource, /IMO_REQUIRED/);

  // Flag normalization imported and called
  assert.match(endpointSource, /normalizeFlagCode/);
  assert.match(endpointSource, /flagCode\s*=\s*normalizeFlagCode\(rawFlag\)/);

  // Step A: UPDATE vessels_master first
  assert.match(endpointSource, /UPDATE vessels_master/);
  assert.match(endpointSource, /WHERE imo_number = \$1::integer OR imo = \$1::integer/);
  assert.match(endpointSource, /COALESCE\(vessels_master\.source_payload,\s*'\{\}'::jsonb\)\s*\|\|\s*\$13::jsonb/);

  // Step B: INSERT only if update returned 0 rows
  assert.match(endpointSource, /INSERT INTO vessels_master/);
  assert.match(endpointSource, /updateResult\.rows\.length > 0/);
  assert.match(endpointSource, /broker_particulars/);

  // H15 reading in action parse
  assert.match(endpointSource, /h15\.vlsfo_sea_design_mt_day/);
  assert.match(endpointSource, /h15\.vlsfo_sea_eco_mt_day/);
  assert.match(endpointSource, /h15\.mgo_port_working_mt_day/);

  // Detailed error formatting
  assert.match(endpointSource, /error\?\.detail/);
  assert.match(endpointSource, /error\?\.constraint/);
  assert.match(endpointSource, /error\?\.column/);
});

test('6. Frontend index.html has complete Add Vessel specs form with raw particulars, IMO input, and Neon checkbox', () => {
  assert.match(indexSource, /id="add-v-raw-particulars"/);
  assert.match(indexSource, /id="btn-comp-autofill-specs"/);
  assert.match(indexSource, /onclick="autoFillVesselSpecsForComparison\(\)"/);
  assert.match(indexSource, /id="add-v-imo"/);
  assert.match(indexSource, /id="add-v-save-neon"/);
});

test('7. Frontend autoFillVesselSpecsForComparison calls /api/vessel-particulars-ingest parse action and populates inputs', () => {
  assert.match(indexSource, /fetch\('\/api\/vessel-particulars-ingest'/);
  assert.match(indexSource, /action:\s*'parse'/);
  assert.match(indexSource, /window\.__compExtractedParticulars\s*=/);
  assert.match(indexSource, /showToast\(`✨ \$\{extractedCount\} campos extraídos con éxito/);
});

test('8. Frontend saveNewVesselFromUI validates IMO, handles Neon errors with visible banner in comp-search-results-container', () => {
  assert.match(indexSource, /function saveNewVesselFromUI\(\)/);
  assert.match(indexSource, /action:\s*'upsert'/);
  assert.match(indexSource, /fetch\('\/api\/vessel-particulars-ingest'/);
  assert.match(indexSource, /document\.getElementById\('comp-search-results-container'\)/);
  assert.match(indexSource, /Rechazo de guardado en Neon DB/);
  assert.match(indexSource, /✅ Buque "\$\{name\}" \(IMO \$\{imo\}\) guardado en tu comparativa y actualizado en Neon\./);
  assert.match(indexSource, /ℹ️ Guardado solo en tu comparativa local \(añade un IMO de 7 dígitos para subirlo a Neon\)\./);
});
