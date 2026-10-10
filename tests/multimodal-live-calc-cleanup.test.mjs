import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtmlPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

test('1. Eliminar visualmente el precio inferior duplicado en las tarjetas', () => {
  // Los paneles inferiores summary-panel deben tener display: none !important tanto en CSS como en estilo en línea
  assert.match(
    indexHtml,
    /\.multimodal-tab-pane\s+\.summary-panel\s*\{[^}]*display:\s*none\s*!important;/,
    '.multimodal-tab-pane .summary-panel debe estar oculto con display: none !important en CSS'
  );

  const summaryPanels = indexHtml.match(/<section[^>]*class="summary-panel"[^>]*>/g) || [];
  assert.ok(summaryPanels.length >= 4, 'Deben existir los bloques de resumen de las pestañas');
  summaryPanels.forEach((panel) => {
    assert.match(
      panel,
      /display:\s*none\s*!important/i,
      'Cada summary-panel inferior debe tener display: none !important para eliminar duplicados'
    );
  });
});

test('2. Desconectar los eventos de cálculo en vivo (Live Calculation) en inputs', () => {
  // Comprobar que en los eventos de input/change no se calcula una cotización en vivo ni se inyecta precio en tarjetas
  // bindOriginCurrencyListeners sólo debe llamar a updateQuickQuoteForTab para detectar moneda y etiquetas
  assert.match(
    indexHtml,
    /function\s+bindOriginCurrencyListeners\(\)/,
    'Debe existir bindOriginCurrencyListeners'
  );

  // Los campos de peso y volumen no tienen listeners directos de cotización
  assert.doesNotMatch(
    indexHtml,
    /'air-gross-weight'[^>]*addEventListener\(['"]input['"],\s*calculate/i,
    'No debe existir cálculo en vivo de cotización en air-gross-weight'
  );
  assert.doesNotMatch(
    indexHtml,
    /'lcl-gross-weight'[^>]*addEventListener\(['"]input['"],\s*calculate/i,
    'No debe existir cálculo en vivo de cotización en lcl-gross-weight'
  );
});

test('3. Mantener el flujo asíncrono exclusivo: el precio solo se calcula al pulsar "Calcular Tarifa"', () => {
  // El cálculo de tarifa debe depender de handleCalculateTariff y calculateAndApplyMarketplace
  assert.match(
    indexHtml,
    /function\s+handleCalculateTariff\(\)/,
    'handleCalculateTariff debe ser el orquestador exclusivo al pulsar el botón'
  );
  assert.match(
    indexHtml,
    /calculateAndApplyMarketplace\(\s*activeKey\s*,\s*origin\s*,\s*dest\s*\)/,
    'handleCalculateTariff debe invocar calculateAndApplyMarketplace'
  );
  assert.match(
    indexHtml,
    /arrayProveedores\.sort\(\(a,\s*b\)\s*=>\s*a\.sellPrice\s*-\s*b\.sellPrice\)/,
    'Ordena matemáticamente por sellPrice de menor a mayor'
  );

  // Única fuente de verdad: #multimodal-quote-total y #active-provider-summary
  assert.match(
    indexHtml,
    /id="multimodal-quote-total"/,
    'El panel lateral derecho debe albergar #multimodal-quote-total'
  );
  assert.match(
    indexHtml,
    /id="active-provider-summary"/,
    'El panel lateral derecho debe albergar #active-provider-summary'
  );
});
