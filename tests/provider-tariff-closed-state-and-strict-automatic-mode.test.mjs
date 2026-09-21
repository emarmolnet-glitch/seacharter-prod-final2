import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const tariffsSource = readFileSync(new URL('../src/data/defaultProviderTariffs.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../src/services/providerTariffParser.js', import.meta.url), 'utf8');
const sidebarComponentSource = readFileSync(new URL('../src/components/ProviderTariffSidebar.jsx', import.meta.url), 'utf8');
const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

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

test('1. [ESTADO INICIAL CERRADO] ProviderTariffSidebar inicia estrictamente colapsado (isOpen = false)', () => {
  // Verifica inicialización en false
  assert.match(sidebarComponentSource, /const\s+\[isOpen,\s*setIsOpen\]\s*=\s*useState\(false\);/, 'isOpen debe inicializarse estrictamente en false');

  // Verifica que handleCargoModalVisibility NO fuerce setIsOpen(true)
  assert.doesNotMatch(
    sidebarComponentSource,
    /handleCargoModalVisibility[\s\S]*?if\s*\(\s*open\s*\)\s*\{\s*setIsOpen\(true\);?\s*\}/,
    'handleCargoModalVisibility no debe abrir automáticamente el sidebar'
  );

  // Solo debe cerrar si modal está cerrado
  assert.match(
    sidebarComponentSource,
    /if\s*\(\s*!open\s*\)\s*\{\s*setIsOpen\(false\);?\s*\}/,
    'handleCargoModalVisibility debe cerrar si open es false'
  );
});

test('2. [MODO AUTOMÁTICO POR DEFECTO] isManualEditMode inicia en false y se mantiene estrictamente', () => {
  assert.match(sidebarComponentSource, /const\s+\[isManualEditMode,\s*setIsManualEditMode\]\s*=\s*useState\(false\);/, 'isManualEditMode debe inicializarse estrictamente en false');

  // Al cambiar de material se resetea a false
  assert.match(
    sidebarComponentSource,
    /const handleMaterialChange = \(newMaterialId\) => \{[\s\S]*?setIsManualEditMode\(false\);/,
    'handleMaterialChange debe forzar setIsManualEditMode(false)'
  );

  // Al subir archivo se resetea a false
  assert.match(
    sidebarComponentSource,
    /handleFileUpload[\s\S]*?setIsManualEditMode\(false\);/,
    'handleFileUpload debe forzar setIsManualEditMode(false)'
  );
});

test('3. [CERO INTERFERENCIA MANUAL] Los inputs no activan modo manual y son readOnly en automático', () => {
  // handleNumericChange NO debe llamar a setIsManualEditMode(true)
  assert.doesNotMatch(
    sidebarComponentSource,
    /const handleNumericChange[\s\S]*?setIsManualEditMode\(true\);/,
    'handleNumericChange no debe activar modo manual por su cuenta'
  );

  // handleNumericChange debe comprobar if (!isManualEditMode) return;
  assert.match(
    sidebarComponentSource,
    /if\s*\(\s*!isManualEditMode\s*\)\s*\{\s*return;?\s*\}/,
    'handleNumericChange debe abortar si no está activo isManualEditMode'
  );

  // Inputs del desglose tienen readOnly={!isManualEditMode}
  assert.match(sidebarComponentSource, /id="pt-input-gica"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-gica debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-rabais"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-rabais debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-packaging"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-packaging debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-inland"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-inland debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-sgs"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-sgs debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-port"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-port debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-margin"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-margin debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-input-sale-price"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-input-sale-price debe ser readOnly');
  assert.match(sidebarComponentSource, /id="pt-quantity-input"[\s\S]*?readOnly=\{!isManualEditMode\}/, 'pt-quantity-input debe ser readOnly');
});

test('4. [BOTÓN EXPLÍCITO DE MODO MANUAL] Existe botón con texto "Modo Manual" para activación deliberada', () => {
  assert.match(
    sidebarComponentSource,
    /id="btn-toggle-manual-mode"/,
    'Debe existir botón con id btn-toggle-manual-mode'
  );
  assert.match(
    sidebarComponentSource,
    /id="btn-toggle-manual-mode"[\s\S]*?\{isManualEditMode \? 'Desactivar Modo Manual' : 'Modo Manual'\}/,
    'El botón debe mostrar Modo Manual / Desactivar Modo Manual'
  );
});

test('5. [CÁLCULO AUTOMÁTICO DE PRECIO DE VENTA REAL] Fórmula real y erradicación de valores erróneos de 3 USD', () => {
  const rowItem = {
    name: 'CEM I 52,5N big bag',
    basePriceDzd: 6590.50,
    rabaisMultiplier: 0.9388,
    packagingCost: 3.50,
    inlandTransport: 6.80, // FSPE
    marketInlandCostPerMt: 4.63,
    sgsInspection: 0.80,
    bejaiaPortDues: 3.70,
    commercialMargin: 3.00 // Margen comercial configurado de 3 USD
  };

  // Cálculo con FSPE:
  // Base neta: 6590.50 * 0.9388 / 134.50 = 46.00 USD
  // Coste unitario total = 46.00 + 3.50 + 6.80 + 0.80 + 3.70 = 60.80 USD
  // Precio de venta sugerido real = 60.80 + 3.00 = 63.80 USD/MT
  const breakdown = calculateTariffBreakdown(rowItem, { useFspe: true, commercialModality: 'FOB' });
  assert.equal(breakdown.totalUnitCost, 60.80, 'Coste unitario total debe ser exactamente 60.80 USD');
  assert.equal(breakdown.commercialMargin, 3.00, 'Margen comercial debe ser 3.00 USD');
  assert.equal(breakdown.suggestedSalePrice, 63.80, 'Precio de venta debe ser 63.80 USD (coste + margen), NUNCA 3 USD');
  assert.notEqual(breakdown.suggestedSalePrice, 3.00, 'El precio de venta nunca debe ser el valor fijo de 3 USD');
});

test('6. [PROTECCIÓN CONTRA VALORES CORRUPTOS EN PARSER EXCEL] Columna FOB o costes menores no sobreescriben precio de venta con 3 USD', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [
      'Produit',
      'Prix GICA',
      'Rabais',
      'Big Bag / Sac',
      'Coût Logistique FSPE',
      'Coût Logistique Marché',
      'Frais Transit & SGS',
      'Frais Port Bejaia',
      'Incoterm FOB Bejaia' // Columna que contiene FOB con valor 3.00 o similar
    ],
    [
      'CEM I 52,5N SAC 50 KG',
      6590.50,
      0.9388,
      3.50,
      6.80,
      14.50,
      0.80,
      3.70,
      3.00
    ]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Matriz');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseExcelTariff(buffer, 'Tarif_GICA.xlsx');
  const item = result.materials[0];

  // suggestedFobSalePrice no debe capturar el 3.00 del Incoterm
  assert.notEqual(item.suggestedFobSalePrice, 3.00, 'No debe confundir Incoterm FOB con precio de venta de 3 USD');

  // Breakdown financiero
  const breakdown = calculateTariffBreakdown(item, { useFspe: true, commercialModality: 'FOB' });
  assert.equal(breakdown.totalUnitCost, 60.80);
  assert.notEqual(breakdown.suggestedSalePrice, 3.00, 'suggestedSalePrice no debe ser 3 USD');
  assert.ok(breakdown.suggestedSalePrice >= 60.80, 'Precio de venta debe ser al menos igual al coste unitario total');
});
