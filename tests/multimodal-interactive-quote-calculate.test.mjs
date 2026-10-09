import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const reactPanelFile = fs.readFileSync(path.join(rootDir, 'src/components/QuickQuotePanel.jsx'), 'utf-8');
const fclModuleJs = fs.readFileSync(path.join(rootDir, 'fcl-module.js'), 'utf-8');

test('1. Desbloqueo de Inputs FCL: Origen y Destino parten vacíos con placeholders dinámicos', () => {
  // fcl-pol
  const polMatch = indexHtml.match(/<input\s+id="fcl-pol"[^>]*>/);
  assert.ok(polMatch, 'Debe existir input #fcl-pol');
  assert.match(polMatch[0], /type="text"/, 'fcl-pol debe ser tipo text');
  assert.match(polMatch[0], /placeholder="Puerto de origen"/i, 'fcl-pol debe tener placeholder de origen');
  assert.match(polMatch[0], /value=""/, 'fcl-pol debe partir con valor vacío');
  assert.doesNotMatch(polMatch[0], /\bdisabled\b/, 'fcl-pol no debe estar disabled');
  assert.doesNotMatch(polMatch[0], /\breadonly\b/, 'fcl-pol no debe ser readonly');

  // fcl-pod
  const podMatch = indexHtml.match(/<input\s+id="fcl-pod"[^>]*>/);
  assert.ok(podMatch, 'Debe existir input #fcl-pod');
  assert.match(podMatch[0], /type="text"/, 'fcl-pod debe ser tipo text');
  assert.match(podMatch[0], /placeholder="Puerto de destino"/i, 'fcl-pod debe tener placeholder de destino');
  assert.match(podMatch[0], /value=""/, 'fcl-pod debe partir con valor vacío');
  assert.doesNotMatch(podMatch[0], /\bdisabled\b/, 'fcl-pod no debe estar disabled');
  assert.doesNotMatch(podMatch[0], /\breadonly\b/, 'fcl-pod no debe ser readonly');

  // fcl-module.js no debe tener hardcodeado 'Valencia' o 'Jebel Ali' como fallback
  assert.match(fclModuleJs, /pol:\s*getElement\(ids\.pol\)\?\.value\s*\|\|\s*''/, 'fcl-module.js pol debe ser cadena vacía por defecto');
  assert.match(fclModuleJs, /pod:\s*getElement\(ids\.pod\)\?\.value\s*\|\|\s*''/, 'fcl-module.js pod debe ser cadena vacía por defecto');
});

test('2. Inicialización a Cero en Quick Quote: valor por defecto $0.00 / €0.00 y botón PDF disabled', () => {
  // HTML: valor por defecto en 0.00
  assert.match(indexHtml, /<output\s+id="multimodal-quote-total"[^>]*>€0\.00<\/output>/, 'El output en index.html debe partir en €0.00');

  // HTML: Botón PDF deshabilitado inicialmente para evitar PDFs vacíos
  const pdfBtnMatch = indexHtml.match(/<button\s+id="fcl-export-client-pdf-btn"[^>]*>/);
  assert.ok(pdfBtnMatch, 'Debe existir el botón fcl-export-client-pdf-btn');
  assert.match(pdfBtnMatch[0], /\bdisabled\b/, 'fcl-export-client-pdf-btn debe iniciar como disabled');

  // HTML: Botón Sincronizar Data Bridge deshabilitado hasta calcular tarifa
  const syncBtnMatch = indexHtml.match(/<button\s+id="btn-sync-databridge-quote"[^>]*>/);
  assert.ok(syncBtnMatch, 'Debe existir el botón btn-sync-databridge-quote');
  assert.match(syncBtnMatch[0], /\bdisabled\b/, 'btn-sync-databridge-quote debe iniciar como disabled');

  // React: QuickQuotePanel inicializa consolidatedTotal en 0 o null y deshabilita PDF
  assert.match(reactPanelFile, /const\s+\[consolidatedTotal,\s*setConsolidatedTotal\]\s*=\s*useState\(0\);/, 'React QuickQuotePanel debe inicializar consolidatedTotal en 0');
  assert.match(reactPanelFile, /disabled=\{isZeroOrNull\}/, 'React QuickQuotePanel debe deshabilitar botón PDF si es 0 o null');
});

test('3. Botón "Calcular Tarifa" en QuickQuotePanel y en index.html con estilo Tailwind requerido', () => {
  // Botón en React QuickQuotePanel
  assert.match(reactPanelFile, /id="btn-calculate-tariff"/, 'React QuickQuotePanel debe incluir botón btn-calculate-tariff');
  assert.match(reactPanelFile, /w-full\s+bg-blue-600\s+text-white\s+font-semibold\s+py-2\s+rounded\s+mb-4\s+hover:bg-blue-700/, 'Debe aplicar estilo Tailwind al botón Calcular Tarifa en React');
  assert.match(reactPanelFile, /<span>Calcular Tarifa<\/span>/, 'El texto del botón debe ser "Calcular Tarifa"');
  assert.match(reactPanelFile, /onClick=\{handleCalculate\}/, 'El botón debe vincularse al manejador handleCalculate');

  // Ubicación en React: justo encima de Total Venta Consolidado
  const reactBtnPos = reactPanelFile.indexOf('id="btn-calculate-tariff"');
  const reactTotalPos = reactPanelFile.indexOf('Total Venta Consolidado');
  assert.ok(reactBtnPos > 0 && reactTotalPos > 0 && reactBtnPos < reactTotalPos, 'El botón Calcular Tarifa debe estar inmediatamente antes de Total Venta Consolidado');

  // Botón en index.html
  assert.match(indexHtml, /id="btn-calculate-tariff"/, 'index.html debe incluir botón btn-calculate-tariff');
  assert.match(indexHtml, /w-full\s+bg-blue-600\s+text-white\s+font-semibold\s+py-2\s+rounded\s+mb-4\s+hover:bg-blue-700/, 'Debe aplicar estilo Tailwind al botón Calcular Tarifa en index.html');
  assert.match(indexHtml, /onclick="handleCalculateTariff\(\)"/, 'index.html debe llamar a handleCalculateTariff()');

  // Ubicación en index.html: justo encima de Total Venta Consolidado
  const htmlBtnPos = indexHtml.indexOf('id="btn-calculate-tariff"');
  const htmlTotalPos = indexHtml.indexOf('Total Venta Consolidado');
  assert.ok(htmlBtnPos > 0 && htmlTotalPos > 0 && htmlBtnPos < htmlTotalPos, 'En index.html el botón Calcular Tarifa debe estar inmediatamente antes de Total Venta Consolidado');
});

test('4. Lógica funcional de cálculo y habilitación en QuickQuotePanel y runtime JS', () => {
  // Verificación en React: handleCalculate cambia importe de 0 al valor de cotización
  assert.match(reactPanelFile, /const\s+handleCalculate\s*=\s*useCallback\(/, 'QuickQuotePanel implementa handleCalculate');
  assert.match(reactPanelFile, /setConsolidatedTotal\(/, 'handleCalculate actualiza el estado consolidatedTotal');

  // Verificación en index.html: handleCalculateTariff cambia isTariffCalculated a true y actualiza estados de botones
  assert.match(indexHtml, /function\s+handleCalculateTariff\(\)\s*\{/, 'index.html implementa handleCalculateTariff');
  assert.match(indexHtml, /isTariffCalculated\s*=\s*true;/, 'handleCalculateTariff activa isTariffCalculated');
  assert.match(indexHtml, /updateCalculateTariffButtonState\(\)/, 'handleCalculateTariff actualiza el estado de los botones');
  assert.match(indexHtml, /window\.handleCalculateTariff\s*=/, 'Expone handleCalculateTariff en window');
  assert.match(indexHtml, /window\.handleCalculate\s*=/, 'Expone handleCalculate en window');
});
