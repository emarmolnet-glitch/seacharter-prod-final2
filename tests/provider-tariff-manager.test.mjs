import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

// Load files
const tariffsSource = readFileSync(new URL('../src/data/defaultProviderTariffs.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../src/services/providerTariffParser.js', import.meta.url), 'utf8');
const sidebarComponentSource = readFileSync(new URL('../src/components/ProviderTariffSidebar.jsx', import.meta.url), 'utf8');
const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../assets/css/provider-tariff-sidebar.css', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Helper to evaluate modules with clean exports
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

const { DEFAULT_PROVIDER_TARIFFS, OFFICIAL_EXCHANGE_RATE_DZD_USD, calculateTariffBreakdown } = loadModule(tariffsSource);
const { parseCsvTariff, parseExcelTariff, parseTextOrWordTariff } = loadModule(parserSource, { XLSX });

test('1. [ELIMINACIÓN DEL BOTÓN SUPERIOR] No existe botón superior "Tarifas Proveedores FOB"', () => {
  // Ya no debe existir ningún botón con texto "Tarifas Proveedores FOB" en la barra superior o cabecera
  assert.equal(forwarderComponentSource.includes('Tarifas Proveedores FOB'), false, 'El texto "Tarifas Proveedores FOB" no debe figurar en ForwarderWorkspace');
  assert.equal(indexHtmlSource.includes('Tarifas Proveedores FOB'), false, 'El texto "Tarifas Proveedores FOB" no debe figurar en index.html');
});

test('2. [INTEGRACIÓN EXCLUSIVA EN PROJECT CARGO BUILDER] Integrado en modal de empaque', () => {
  // Debe existir botón de apertura dentro de la sección 1 (Packing List) del modal Project Cargo Builder
  assert.match(forwarderComponentSource, /id="btn-open-tariff-manager-modal"/, 'Debe existir botón para abrir tarifas dentro del modal Project Cargo Builder');
  assert.match(forwarderComponentSource, /__IS_CARGO_BUILDER_MODAL_OPEN__/, 'ForwarderWorkspace expone la apertura del modal Project Cargo Builder');
  assert.match(sidebarComponentSource, /__IS_CARGO_BUILDER_MODAL_OPEN__/, 'ProviderTariffSidebar condiciona su visibilidad activa al modal Project Cargo Builder');
});

test('3. [POSICIONAMIENTO LATERAL IZQUIERDO Y ALINEACIÓN DE ALTURA]', () => {
  // Pestaña flotante alineada a la altura inferior (bottom: 96px, similar al Agente de Proyectos)
  assert.match(cssSource, /\.pt-drawer-trigger-tab[\s\S]*?bottom:\s*96px/, 'La pestaña flotante debe ubicarse en bottom: 96px');
  assert.match(cssSource, /\.pt-drawer-container[\s\S]*?z-index:\s*10005/, 'El modal flotante debe tener z-index superior para mostrarse sobre Project Cargo Builder');
});

test('4. [PARSER DE EXCEL: LECTURA 1:1 REAL DE CADA COLUMNA Y FILA]', async () => {
  // Crear libro Excel con columnas exactas
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['Produit', 'Prix GICA', 'Rabais', 'Big Bag / Sac', 'Coût Logistique FSPE', 'Coût Logistique Marché', 'Frais Transit & SGS', 'Frais Port Bejaia'],
    ['CEM I 52,5N big bag', 6590.50, 0.9388, 3.50, 6.80, 14.50, 0.80, 3.70],
    ['CEM II 42,5 vrac', 5514.50, 0.9512, 0.00, 6.80, 14.50, 0.80, 3.70],
    ['Clinker gris granel', 4707.50, 0.9428, 0.00, 5.20, 11.00, 0.60, 2.90]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Tarif GICA');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseExcelTariff(buffer, 'Tarif_Export_GICA.xlsx');
  assert.equal(result.materials.length, 3);

  // Fila 1: CEM I 52,5N big bag
  const mat1 = result.materials[0];
  assert.equal(mat1.name, 'CEM I 52,5N big bag');
  assert.equal(mat1.basePriceDzd, 6590.50);
  assert.equal(mat1.rabaisMultiplier, 0.9388);
  assert.equal(mat1.packagingCost, 3.50);
  assert.equal(mat1.inlandTransport, 6.80);
  assert.equal(mat1.marketInlandCostPerMt, 14.50);
  assert.equal(mat1.sgsInspection, 0.80);
  assert.equal(mat1.bejaiaPortDues, 3.70);

  // Fila 2: CEM II 42,5 vrac
  const mat2 = result.materials[1];
  assert.equal(mat2.name, 'CEM II 42,5 vrac');
  assert.equal(mat2.basePriceDzd, 5514.50);
  assert.equal(mat2.rabaisMultiplier, 0.9512);
  assert.equal(mat2.packagingCost, 0.00);

  // Fila 3: Clinker con costes logísticos diferentes (5.20, no 6.80 genérico)
  const mat3 = result.materials[2];
  assert.equal(mat3.name, 'Clinker gris granel');
  assert.equal(mat3.basePriceDzd, 4707.50);
  assert.equal(mat3.inlandTransport, 5.20, 'Debe respetar los 5.20 de su celda y no imponer 6.80');
  assert.equal(mat3.bejaiaPortDues, 2.90, 'Debe respetar los 2.90 de su celda y no imponer 3.70');
});

test('5. [SELECTOR FSPE Y CÁLCULO FINANCIERO 1:1]', () => {
  const rowItem = {
    name: 'CEM I 52,5N big bag',
    basePriceDzd: 6590.50,
    rabaisMultiplier: 0.9388,
    packagingCost: 3.50,
    inlandTransport: 6.80, // FSPE
    marketInlandCostPerMt: 14.50, // Marché
    sgsInspection: 0.80,
    bejaiaPortDues: 3.70,
    commercialMargin: 5.00
  };

  // Con FSPE: Usa 6.80
  const fspeCalc = calculateTariffBreakdown(rowItem, { useFspe: true, commercialModality: 'FOB' });
  // Neto DZD = 6590.50 * 0.9388 = 6187.16 DZD / 134.50 = 46.00 USD
  // Coste = 46.00 + 3.50 + 6.80 + 0.80 + 3.70 = 60.80
  assert.equal(fspeCalc.inlandTransport, 6.80);
  assert.equal(fspeCalc.totalUnitCost, 60.80);

  // Sin FSPE: Usa tarifa real de mercado de la fila (14.50)
  const marcheCalc = calculateTariffBreakdown(rowItem, { useFspe: false, commercialModality: 'FOB' });
  // Coste = 46.00 + 3.50 + 14.50 + 0.80 + 3.70 = 68.50
  assert.equal(marcheCalc.inlandTransport, 14.50);
  assert.equal(marcheCalc.totalUnitCost, 68.50);
});

test('6. [ESTADO INICIAL VACÍO SIN ENTIDADES ESTÁTICAS]', () => {
  assert.equal(DEFAULT_PROVIDER_TARIFFS.length, 0);
  assert.match(sidebarComponentSource, /entities\.length === 0/);
});
