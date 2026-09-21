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

test('1. [PARSER EXCEL] Lee estrictamente la columna "Coût Logística Marché (Sans FSPE)" con valor 4.63 USD', async () => {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [
      'Produit',
      'Prix GICA',
      'Rabais',
      'Big Bag / Sac',
      'Coût Logistique FSPE',
      'Coût Logística Marché (Sans FSPE)',
      'Frais Transit & SGS',
      'Frais Port Bejaia'
    ],
    [
      'CEM I 52.5N Envasado',
      6590.50,
      0.9388,
      3.50,
      6.80,
      4.63, // Valor exacto de mercado sin FSPE solicitado
      0.80,
      3.70
    ],
    [
      'CEM II 42.5 Granel',
      5514.50,
      0.9512,
      0.00,
      5.20,
      4.63,
      0.60,
      2.90
    ]
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Matriz');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const result = await parseExcelTariff(buffer, 'Tarifas_GICA_2026.xlsx');
  assert.equal(result.materials.length, 2);

  const item1 = result.materials[0];
  assert.equal(item1.name, 'CEM I 52.5N Envasado');
  assert.equal(item1.basePriceDzd, 6590.50);
  assert.equal(item1.rabaisMultiplier, 0.9388);
  assert.equal(item1.packagingCost, 3.50);
  assert.equal(item1.inlandTransport, 6.80, 'FSPE debe ser 6.80');
  assert.equal(item1.marketInlandCostPerMt, 4.63, 'Marché Sans FSPE debe ser estrictamente 4.63 USD');
  assert.equal(item1.sgsInspection, 0.80);
  assert.equal(item1.bejaiaPortDues, 3.70);

  const item2 = result.materials[1];
  assert.equal(item2.inlandTransport, 5.20);
  assert.equal(item2.marketInlandCostPerMt, 4.63);
});

test('2. [FSPE vs SANS FSPE] Cálculo exacto: 6.80 con FSPE y 4.63 sin FSPE (Eliminación de 12.50)', () => {
  const rowItem = {
    name: 'CEM I 52.5N Envasado',
    basePriceDzd: 6590.50,
    rabaisMultiplier: 0.9388,
    packagingCost: 3.50,
    inlandTransport: 6.80,
    marketInlandCostPerMt: 4.63, // Exacto del Excel
    sgsInspection: 0.80,
    bejaiaPortDues: 3.70,
    commercialMargin: 5.00
  };

  // Con FSPE: usa 6.80 USD
  const conFspe = calculateTariffBreakdown(rowItem, { useFspe: true, commercialModality: 'FOB' });
  assert.equal(conFspe.inlandTransport, 6.80, 'Con FSPE debe usar 6.80');
  assert.notEqual(conFspe.inlandTransport, 12.50, 'Nunca debe usar 12.50');

  // Sin FSPE (Mercado): usa 4.63 USD estrictamente
  const sinFspe = calculateTariffBreakdown(rowItem, { useFspe: false, commercialModality: 'FOB' });
  assert.equal(sinFspe.inlandTransport, 4.63, 'Sin FSPE debe usar exactamente 4.63 de la columna Excel');
  assert.notEqual(sinFspe.inlandTransport, 12.50, 'Se elimina cualquier 12.50 fijo');
});

test('3. [INTEGRACIÓN LAND CHARTER & PURGA DE 12.50] Si el Excel no tiene columna mercado, usa Land Charter (no 12.50)', () => {
  const rowItemSinMercado = {
    name: 'Clinker gris',
    basePriceDzd: 4707.50,
    rabaisMultiplier: 0.9428,
    packagingCost: 0.00,
    inlandTransport: 5.20,
    marketInlandCostPerMt: 0, // No figura en Excel
    sgsInspection: 0.60,
    bejaiaPortDues: 2.90
  };

  // Integrado con Land Charter (ej. tarifa calculada de 7.25 USD/MT)
  const calcWithLandCharter = calculateTariffBreakdown(rowItemSinMercado, {
    useFspe: false,
    commercialModality: 'FOB',
    landCharterRateUsdMt: 7.25
  });
  assert.equal(calcWithLandCharter.inlandTransport, 7.25, 'Debe tomar la tarifa de Land Charter');

  // Si no hay Land Charter ni columna mercado, debe ser 0 y NO 12.50
  const calcSinNada = calculateTariffBreakdown(rowItemSinMercado, {
    useFspe: false,
    commercialModality: 'FOB'
  });
  assert.equal(calcSinNada.inlandTransport, 0, 'Sin datos de mercado debe evaluar a 0, nunca 12.50');
  assert.notEqual(calcSinNada.inlandTransport, 12.50);
});

test('4. [BINDING NUMÉRICO REAL] Los 6 inputs del desglose financiero existen y están vinculados reactivamente', () => {
  // 1. Precio GICA
  assert.match(sidebarComponentSource, /id="pt-input-gica"/, 'Debe existir input pt-input-gica');
  assert.match(sidebarComponentSource, /value=\{breakdown\.basePriceDzd\}/, 'pt-input-gica debe vincular breakdown.basePriceDzd');

  // 2. Rabais
  assert.match(sidebarComponentSource, /id="pt-input-rabais"/, 'Debe existir input pt-input-rabais');
  assert.match(sidebarComponentSource, /value=\{breakdown\.rabaisMultiplier\}/, 'pt-input-rabais debe vincular breakdown.rabaisMultiplier');

  // 3. Envase
  assert.match(sidebarComponentSource, /id="pt-input-packaging"/, 'Debe existir input pt-input-packaging');
  assert.match(sidebarComponentSource, /value=\{breakdown\.packagingCost\}/, 'pt-input-packaging debe vincular breakdown.packagingCost');

  // 4. Logística activa
  assert.match(sidebarComponentSource, /id="pt-input-inland"/, 'Debe existir input pt-input-inland');
  assert.match(sidebarComponentSource, /value=\{breakdown\.inlandTransport\}/, 'pt-input-inland debe vincular breakdown.inlandTransport');

  // 5. SGS
  assert.match(sidebarComponentSource, /id="pt-input-sgs"/, 'Debe existir input pt-input-sgs');
  assert.match(sidebarComponentSource, /value=\{breakdown\.sgsInspection\}/, 'pt-input-sgs debe vincular breakdown.sgsInspection');

  // 6. Puerto
  assert.match(sidebarComponentSource, /id="pt-input-port"/, 'Debe existir input pt-input-port');
  assert.match(sidebarComponentSource, /value=\{breakdown\.bejaiaPortDues\}/, 'pt-input-port debe vincular breakdown.bejaiaPortDues');
});

test('5. [REACTIVIDAD AL CAMBIO DE FILA Y TOGGLE FSPE] handleMaterialChange y handleToggleFspe limpian overrides para datos 1:1', () => {
  assert.match(sidebarComponentSource, /handleMaterialChange/, 'Debe existir handler handleMaterialChange');
  assert.match(sidebarComponentSource, /handleToggleFspe/, 'Debe existir handler handleToggleFspe');
  // Verifica que no quede ningún marketLandCharterRate inicializado en 12.50
  assert.doesNotMatch(sidebarComponentSource, /useState\(12\.50\)/, 'marketLandCharterRate no debe estar inicializado a 12.50');
  // Verifica que defaultProviderTariffs no tenga || 12.50
  assert.doesNotMatch(tariffsSource, /\|\|\s*12\.50/, 'defaultProviderTariffs no debe tener fallback a 12.50');
});
