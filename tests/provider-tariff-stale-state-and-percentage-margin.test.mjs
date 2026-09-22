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

test('1. LIMPIEZA DE STALE STATE: handleToggleFspe elimina suggestedFobSalePrice y commercialMargin', () => {
  assert.match(
    sidebarSource,
    /delete next\.suggestedFobSalePrice;[\s\S]*?delete next\.commercialMargin;/,
    'handleToggleFspe debe limpiar tanto suggestedFobSalePrice como commercialMargin para evitar stale state'
  );
});

test('2. CÁLCULO DE MARGEN PORCENTUAL EN EL MOTOR: soporte para commercialMarginPercentage', () => {
  const mat425 = DEFAULT_EXCEL_MATERIALS.find(m => m.name.includes('42,5'));
  assert.ok(mat425);

  // totalUnitCost para CEM I 42,5N/R con FSPE:
  // Base neta: 5800 * 0.85 / 134.50 = 36.65 USD
  // Packaging: 3.50, Inland: 6.80, SGS: 0.80, Port: 3.70
  // totalUnitCost = 51.45 USD
  // Con margen de 15%: 51.45 * 1.15 = 59.1675 -> 59.17 USD
  const breakdown15 = calculateTariffBreakdown(mat425, {
    useFspe: true,
    commercialModality: 'FOB',
    commercialMarginPercentage: 15
  });

  assert.equal(breakdown15.totalUnitCost, 51.45);
  assert.equal(breakdown15.suggestedSalePrice, 59.17);
  assert.equal(breakdown15.commercialMargin, 7.72);

  // Con margen de 18%: 51.45 * 1.18 = 60.711 -> 60.71 USD
  const breakdown18 = calculateTariffBreakdown(mat425, {
    useFspe: true,
    commercialModality: 'FOB',
    commercialMarginPercentage: 18
  });

  assert.equal(breakdown18.suggestedSalePrice, 60.71);
});

test('3. PROHIBICIÓN DE CÁLCULOS CRUDOS EN LA UI: renderiza estrictamente breakdown.suggestedSalePrice.toFixed(2)', () => {
  assert.match(
    sidebarSource,
    /\$\{breakdown\.suggestedSalePrice\.toFixed\(2\)\}\s*\/\s*MT/,
    'Debe renderizar estrictamente ${breakdown.suggestedSalePrice.toFixed(2)} / MT sin cálculos intermedios en JSX'
  );
  assert.doesNotMatch(
    sidebarSource,
    /\$\{.*\/.*toFixed\(2\)\}/,
    'No debe realizar divisiones crudas en JSX para el precio de venta'
  );
});
