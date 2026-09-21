import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const tariffsSource = readFileSync(new URL('../src/data/defaultProviderTariffs.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../src/services/providerTariffParser.js', import.meta.url), 'utf8');
const sidebarComponentSource = readFileSync(new URL('../src/components/ProviderTariffSidebar.jsx', import.meta.url), 'utf8');

function loadModule(source, context = {}) {
  const exports = {};
  const module = { exports };
  const cleaned = source
    .replace(/import\s+\*\s+as\s+XLSX\s+from\s+['"]xlsx['"];?/, '')
    .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*defaultProviderTariffs\.js['"];?/, 'const OFFICIAL_EXCHANGE_RATE_DZD_USD = 134.50;')
    .replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 = exports.$1 =')
    .replace(/export\s+function\s+(\w+)/g, 'function $1(...args) { return _fn_$1(...args); }; const _fn_$1 = exports.$1 = function')
    .replace(/export\s+async\s+function\s+(\w+)/g, 'function $1(...args) { return _fn_$1(...args); }; const _fn_$1 = exports.$1 = async function')
    .replace(/export\s+default\s+/, 'exports.default = ');

  const fn = new Function('exports', 'module', 'XLSX', cleaned);
  fn(exports, module, context.XLSX || XLSX);
  return exports;
}

const { calculateTariffBreakdown, OFFICIAL_EXCHANGE_RATE_DZD_USD } = loadModule(tariffsSource);
const { parseExcelTariff } = loadModule(parserSource, { XLSX });

test('1. [PARSER EXCEL: SALTO DE FILAS INSTITUCIONALES GICA] Detecta la cabecera real evitando __EMPTY', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['TARIF OFFICIEL GICA EXPORT 2026'],
    ['Date: Septembre 2026', 'Incoterm: FOB Bejaia'],
    ['', ''], // fila vacía
    [
      'Produit',
      'Prix GICA',
      'Rabais',
      'Sac / Big Bag',
      'Coût Logistique FSPE',
      'Coût Logística Marché (Sans FSPE)',
      'Frais Transit & SGS',
      'Frais Port Bejaia'
    ],
    [
      'CEM I 52,5N SAC 50 KG',
      6590.50,
      0.9388,
      3.50,
      6.80,
      4.63,
      0.80,
      3.70
    ]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Matriz GICA');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseExcelTariff(buffer, 'Tarif_GICA_officiel.xlsx');
  assert.equal(result.materials.length, 1, 'Debe detectar exactamente 1 producto válido');

  const item = result.materials[0];
  assert.equal(item.name, 'CEM I 52,5N SAC 50 KG');
  assert.equal(item.basePriceDzd, 6590.50, 'Precio GICA debe ser 6590.50 DZD');
  assert.equal(item.rabaisMultiplier, 0.9388);
  assert.equal(item.packagingCost, 3.50);
  assert.equal(item.inlandTransport, 6.80);
  assert.equal(item.marketInlandCostPerMt, 4.63);
  assert.equal(item.sgsInspection, 0.80);
  assert.equal(item.bejaiaPortDues, 3.70);
});

test('2. [PARSER EXCEL: NO COLISIÓN CON "USINE" FRANCÉS] "Prix Sortie Usine" es DZD y no USD', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [
      'Désignation du Produit',
      'Prix Sortie Usine',
      'Rabais',
      'Big Bag / Sac',
      'Coût Logistique FSPE',
      'Coût Logística Marché (Sans FSPE)',
      'Frais Transit & SGS',
      'Frais Port Bejaia'
    ],
    [
      'CEM I 52,5N SAC 50 KG',
      6590.50,
      0.9388,
      3.50,
      6.80,
      4.63,
      0.80,
      3.70
    ]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Usine');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseExcelTariff(buffer, 'Tarif_Usine.xlsx');
  const item = result.materials[0];
  assert.equal(item.basePriceDzd, 6590.50, 'Precio base debe ser 6590.50 DZD');
  // baseMaterialCost debe ser 6590.50 / 134.50 = 49.00 USD, NO 6590.50 USD
  assert.equal(item.baseMaterialCost, 49.00, 'Base material cost en USD debe ser 49.00');
  assert.notEqual(item.basePriceDzd, 886422.25, 'No debe multiplicar 6590.50 * 134.50');
});

test('3. [MODO MANUAL: APAGADO POR DEFECTO AL CAMBIAR DE PRODUCTO] handleMaterialChange resetea a modo automático', () => {
  assert.match(sidebarComponentSource, /const handleMaterialChange = \(newMaterialId\) => \{[\s\S]*?setSelectedMaterialId\(newMaterialId\);[\s\S]*?setManualOverrides\(\{\}\);[\s\S]*?setIsManualEditMode\(false\);/, 'handleMaterialChange debe forzar setIsManualEditMode(false)');
});

test('4. [MODO MANUAL: EVENTOS SINTÉTICOS / PROGRAMÁTICOS NO LO ACTIVAN] handleNumericChange verifica isTrusted', () => {
  assert.match(sidebarComponentSource, /event\.nativeEvent\.isTrusted === false/, 'handleNumericChange debe rechazar eventos sintéticos');
});
