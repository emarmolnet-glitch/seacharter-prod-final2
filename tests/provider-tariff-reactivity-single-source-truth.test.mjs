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

test('1. SINGLE SOURCE OF TRUTH: Precio Unitario Final es una variable calculada en cada render sin valores estáticos congelados', () => {
  // En CEM I 52,5N big bag:
  // Base neta: 6590.50 * 0.9388 / 134.50 = 46.00 USD
  // Packaging: 3.50 USD
  // Inland FSPE: 6.80 USD
  // SGS: 0.80 USD
  // Puerto: 3.70 USD
  // Margen: 5.00 USD
  // Con FSPE: Coste = 46.00 + 3.50 + 6.80 + 0.80 + 3.70 = 60.80 USD. Precio Venta = 60.80 + 5.00 = 65.80 USD
  // Sin FSPE (mercado 14.50): Coste = 46.00 + 3.50 + 14.50 + 0.80 + 3.70 = 68.50 USD. Precio Venta = 68.50 + 5.00 = 73.50 USD
  const mat525 = DEFAULT_EXCEL_MATERIALS.find(m => m.name.includes('52,5'));
  assert.ok(mat525);

  const conFspe = calculateTariffBreakdown(mat525, { useFspe: true, commercialModality: 'FOB' });
  assert.equal(conFspe.totalUnitCost, 60.80);
  assert.equal(conFspe.suggestedSalePrice, 65.80);

  const sinFspe = calculateTariffBreakdown(mat525, { useFspe: false, commercialModality: 'FOB' });
  assert.equal(sinFspe.totalUnitCost, 68.50);
  assert.equal(sinFspe.suggestedSalePrice, 73.50);

  // Verificar que el precio de venta unitario NUNCA se queda congelado en valores incorrectos como 58.74
  assert.notEqual(conFspe.suggestedSalePrice, 58.74);
  assert.notEqual(sinFspe.suggestedSalePrice, 58.74);
});

test('2. SINCRONIZACIÓN ESTRICTA DEL BOTÓN ENVIAR: Multiplicación directa de Precio Venta Final por Tonelaje', () => {
  assert.match(
    sidebarSource,
    /const totalMercanciaUsd = Math\.round\(salePrice \* qty \* 100\) \/ 100;/,
    'handleSendToProject debe calcular el total multiplicando directamente salePrice * qty'
  );

  // Asegura que no recalcula costes por separado
  assert.match(
    sidebarSource,
    /const salePrice = breakdown\.suggestedSalePrice;/,
    'salePrice debe ser exactamente breakdown.suggestedSalePrice'
  );
});

test('3. REACTIVIDAD EN EL SWITCH FSPE: handleToggleFspe limpia overrides e invalida cálculos previos', () => {
  assert.match(
    sidebarSource,
    /delete next\.suggestedFobSalePrice;/,
    'handleToggleFspe debe invalidar cualquier suggestedFobSalePrice anterior'
  );

  assert.match(
    sidebarSource,
    /delete next\.inlandTransport;/,
    'handleToggleFspe debe limpiar inlandTransport'
  );

  assert.match(
    sidebarSource,
    /delete next\.marketInlandCostPerMt;/,
    'handleToggleFspe debe limpiar marketInlandCostPerMt'
  );

  assert.match(
    sidebarSource,
    /setTarifas\(prev => prev\.map/,
    'handleToggleFspe debe actualizar reactivamente el array dinámico de tarifas'
  );
});
