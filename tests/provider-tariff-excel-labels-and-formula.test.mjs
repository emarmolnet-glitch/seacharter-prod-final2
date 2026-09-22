import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tariffsSource = readFileSync(new URL('../src/data/defaultProviderTariffs.js', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../src/components/ProviderTariffSidebar.jsx', import.meta.url), 'utf8');

function loadModule(source) {
  const exports = {};
  const module = { exports };
  const cleaned = source
    .replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 = exports.$1 =')
    .replace(/export\s+function\s+(\w+)/g, 'function $1(...args) { return _fn_$1(...args); }; const _fn_$1 = exports.$1 = function')
    .replace(/export\s+default\s+/, 'exports.default = ');

  const fn = new Function('exports', 'module', cleaned);
  fn(exports, module);
  return exports;
}

const { calculateTariffBreakdown, DEFAULT_EXCEL_MATERIALS } = loadModule(tariffsSource);

test('1. TRADUCCIÓN Y REEMPLAZO DE ETIQUETAS FIJAS (Sin restos en francés ni exclusividad a Argelia)', () => {
  // 1. Reemplazo de "FRAIS TRANSIT / SGS" por "Gastos de tránsito"
  assert.match(
    sidebarSource,
    /<span>\+\s*Gastos de tránsito<\/span>/,
    'Debe contener la etiqueta "+ Gastos de tránsito"'
  );
  assert.doesNotMatch(
    sidebarSource,
    /<span>\+\s*Frais Transit \/ SGS<\/span>/,
    'No debe contener la etiqueta en francés "+ Frais Transit / SGS"'
  );

  // 2. Reemplazo de "FRAIS PORT BEJAIA (EPB/EPC)" por "Gastos portuarios"
  assert.match(
    sidebarSource,
    /<span>\+\s*Gastos portuarios<\/span>/,
    'Debe contener la etiqueta "+ Gastos portuarios"'
  );
  assert.doesNotMatch(
    sidebarSource,
    /<span>\+\s*Frais Port Bejaia/i,
    'No debe contener la etiqueta con puerto Bejaia "+ Frais Port Bejaia"'
  );

  // 3. Eliminación de etiquetas francesas "Prix GICA" en el desglose
  assert.match(
    sidebarSource,
    /<span>Precio Base \(Sin Dto\.\)<\/span>/,
    'Debe tener etiqueta genérica "Precio Base (Sin Dto.)"'
  );
  assert.match(
    sidebarSource,
    /<span>Descuento \(Rabais\)<\/span>/,
    'Debe tener etiqueta "Descuento (Rabais)"'
  );
  assert.match(
    sidebarSource,
    /Precio Base Neto \(\{currency\}\)/,
    'Debe tener etiqueta "Precio Base Neto ({currency})"'
  );
  assert.match(
    sidebarSource,
    /<span>\+\s*Envase \(Big Bag \/ Saco\)<\/span>/,
    'Debe traducir envase a español "+ Envase (Big Bag / Saco)"'
  );
});

test('2. CORRECCIÓN DE LA FÓRMULA DEL PRECIO BASE (RABAIS): PRECIO BASE NETO = PRECIO BASE * FACTOR DE DESCUENTO', () => {
  // Test con producto CEM I 42,5N/R y factor de descuento 0.85
  const item = {
    name: 'CEM I 42,5N/R',
    basePriceDzd: 5800.00,
    rabaisMultiplier: 0.85, // Factor de descuento (ej. 0.85)
    packagingCost: 3.50,
    inlandTransport: 6.80,
    sgsInspection: 0.80,
    bejaiaPortDues: 3.70,
    commercialMargin: 5.00
  };

  const breakdown = calculateTariffBreakdown(item, {
    exchangeRateDzdUsd: 134.50,
    useFspe: true,
    commercialModality: 'FOB'
  });

  // PRECIO BASE NETO = 5800.00 * 0.85 = 4930.00 DZD
  assert.equal(breakdown.basePriceDzd, 5800.00);
  assert.equal(breakdown.rabaisMultiplier, 0.85);
  assert.equal(breakdown.netPriceDzd, 4930.00, 'Precio Base Neto en DZD debe ser exactamente 4930.00');

  // En USD: 4930.00 / 134.50 = 36.65 USD
  assert.equal(breakdown.netMaterialCost, 36.65, 'Base Neta en USD debe ser 36.65 USD/MT');

  // El Precio Base Neto se suma con envase (3.50), logística (6.80), gastos de tránsito (0.80) y gastos portuarios (3.70)
  // Total Coste Unitario FOB = 36.65 + 3.50 + 6.80 + 0.80 + 3.70 = 51.45 USD/MT
  assert.equal(breakdown.totalUnitCost, 51.45, 'Coste Unitario FOB debe ser la suma exacta con Precio Base Neto');

  // Precio de Venta FOB Final = Coste + Margen (51.45 + 5.00 = 56.45 USD/MT)
  assert.equal(breakdown.suggestedSalePrice, 56.45, 'Precio Venta FOB debe ser 56.45 USD/MT');
});

test('3. VALORES POR DEFECTO DEL EXCEL: CEM I 42,5N/R y aplicación dinámica del Tipo de Cambio', () => {
  // Verificar catálogo oficial de materiales del Excel
  assert.ok(Array.isArray(DEFAULT_EXCEL_MATERIALS), 'DEFAULT_EXCEL_MATERIALS debe ser un array');
  const cem425 = DEFAULT_EXCEL_MATERIALS.find(m => m.name.includes('42,5'));
  assert.ok(cem425, 'Debe existir CEM I 42,5N/R en el catálogo por defecto del Excel');
  assert.equal(cem425.basePriceDzd, 5800.00);
  assert.equal(cem425.rabaisMultiplier, 0.85);

  // Con Tipo de Cambio DZD/USD oficial (134.50)
  const calcOfficial = calculateTariffBreakdown(cem425, {
    exchangeRateToUsd: 134.50,
    commercialModality: 'FOB'
  });
  assert.equal(calcOfficial.netMaterialCost, 36.65);

  // Con Tipo de Cambio modificado por el usuario (ej. 140.00 DZD/USD)
  const calcDynamic = calculateTariffBreakdown(cem425, {
    exchangeRateToUsd: 140.00,
    commercialModality: 'FOB'
  });
  // 4930.00 / 140.00 = 35.21 USD
  assert.equal(calcDynamic.netMaterialCost, 35.21, 'El cambio dinámico de divisa/TC debe reflejarse en la base neta USD');
  assert.equal(calcDynamic.totalUnitCost, Math.round((35.21 + 3.50 + 6.80 + 0.80 + 3.70) * 100) / 100);

  // Sidebar maneja el cambio de producto y carga los valores base del Excel
  assert.match(
    sidebarSource,
    /DEFAULT_EXCEL_MATERIALS/,
    'ProviderTariffSidebar debe importar DEFAULT_EXCEL_MATERIALS'
  );
  assert.match(
    sidebarSource,
    /handleMaterialChange/,
    'ProviderTariffSidebar debe incluir handleMaterialChange'
  );
});
