import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('1. Título dinámico en Quick Quote vinculado a la pestaña activa (ej. AÉREO, FCL)', () => {
  assert.match(indexHtml, /id="quick-quote-mode-title"/, 'Debe existir id="quick-quote-mode-title" en el panel Quick Quote');
  assert.match(indexHtml, /TAB_MODE_LABELS\s*=\s*\{[^}]*air:\s*['"]AÉREO['"]/, 'Debe mapear air como AÉREO');
  assert.match(indexHtml, /TAB_MODE_LABELS\s*=\s*\{[^}]*fcl:\s*['"]FCL['"]/, 'Debe mapear fcl como FCL');
  assert.match(indexHtml, /titleEl\.textContent\s*=\s*`QUICK QUOTE \$\{modeLabel\}`/, 'Debe actualizar el título dinámico según la pestaña');
});

test('2. Total renderizado en Quick Quote proviene de la simulación del tab activo', () => {
  assert.match(indexHtml, /TAB_TOTAL_OUTPUT_IDS/, 'Debe mapear los IDs de salida de cada pestaña');
  assert.match(indexHtml, /air-quote-total/, 'Mapea pestaña aérea a air-quote-total');
  assert.match(indexHtml, /lcl-quote-total/, 'Mapea pestaña LCL a lcl-quote-total');
  assert.match(indexHtml, /ground-quote-total/, 'Mapea pestaña terrestre a ground-quote-total');
  assert.match(indexHtml, /amazon-quote-total/, 'Mapea pestaña amazon a amazon-quote-total');
  assert.match(indexHtml, /totalField\.textContent\s*=\s*formattedTabTotal/, 'Quick Quote totalField debe renderizar el total formateado de la pestaña activa');
});

test('3. Array EU_COUNTRIES y lógica inteligente de divisas (USD por defecto / EUR para Europa)', () => {
  assert.match(indexHtml, /const\s+EU_COUNTRIES\s*=\s*\[\s*['"]ES['"],\s*['"]FR['"],\s*['"]DE['"],\s*['"]IT['"],\s*['"]PT['"],\s*['"]NL['"],\s*['"]BE['"],\s*['"]UK['"],\s*['"]GB['"],\s*['"]IE['"]\s*\]/, 'Debe incluir el array EU_COUNTRIES con los países requeridos');
  assert.match(indexHtml, /function\s+detectOriginCurrency\s*\(\s*originRaw\s*\)/, 'Debe definir la función detectOriginCurrency');
  assert.match(indexHtml, /prefix\s*=\s*cleaned\.slice\(0,\s*2\)/, 'Debe extraer las primeras 2 letras del origen');
  assert.match(indexHtml, /EU_COUNTRIES\.includes\(prefix\)/, 'Debe comprobar coincidencia con EU_COUNTRIES');
  assert.match(indexHtml, /return\s+['"]EUR['"]/, 'Retorna EUR si coincide');
  assert.match(indexHtml, /return\s+['"]USD['"]/, 'Retorna USD por defecto si no coincide o está vacío');
});

test('4. Escuchadores reactivos en campos de Origen (fcl-pol, lcl-pol, air-origin, ground-pickup-zip, amazon-origin-port)', () => {
  assert.match(indexHtml, /bindOriginCurrencyListeners/, 'Debe implementar la función de enlace de inputs de origen');
  assert.match(indexHtml, /'fcl-pol',\s*'lcl-pol',\s*'air-origin',\s*'ground-pickup-zip',\s*'amazon-origin-port'/, 'Debe escuchar todos los campos de origen multimodal');
});

test('5. Sincronización Data Bridge envía la variable currency correcta (USD o EUR) sin romper el payload', () => {
  assert.match(indexHtml, /currency:\s*getCurrentMultimodalCurrency\(\)/, 'El payload de sincronización Data Bridge debe enviar la moneda calculada');
  assert.match(indexHtml, /modalidad:\s*currentTab/, 'Conserva la modalidad');
  assert.match(indexHtml, /coste_api:\s*baseCost/, 'Conserva coste_api');
  assert.match(indexHtml, /venta_agencia:\s*quickQuoteTotal/, 'Conserva venta_agencia');
  assert.match(indexHtml, /fee_plataforma:\s*50\.00/, 'Conserva fee_plataforma de 50.00');
  assert.match(indexHtml, /estado:\s*['"]Cotizado['"]/, 'Conserva estado Cotizado');
});

test('6. Simulación funcional de detectOriginCurrency', () => {
  const EU_COUNTRIES = ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'BE', 'UK', 'GB', 'IE'];
  function detectOriginCurrency(originRaw) {
    const cleaned = String(originRaw || '').trim().toUpperCase();
    if (!cleaned || cleaned.length < 2) return 'USD';
    const prefix = cleaned.slice(0, 2);
    if (EU_COUNTRIES.includes(prefix)) {
      return 'EUR';
    }
    return 'USD';
  }

  // España (ESBCN) -> EUR
  assert.equal(detectOriginCurrency('ESBCN'), 'EUR');
  assert.equal(detectOriginCurrency('esval'), 'EUR');
  assert.equal(detectOriginCurrency('DEHAM'), 'EUR');
  assert.equal(detectOriginCurrency('FRLEH'), 'EUR');
  assert.equal(detectOriginCurrency('ITGOA'), 'EUR');
  assert.equal(detectOriginCurrency('PTLIS'), 'EUR');
  assert.equal(detectOriginCurrency('NLRTM'), 'EUR');
  assert.equal(detectOriginCurrency('BEANR'), 'EUR');
  assert.equal(detectOriginCurrency('GBFXT'), 'EUR');
  assert.equal(detectOriginCurrency('UKLON'), 'EUR');
  assert.equal(detectOriginCurrency('IEDUB'), 'EUR');

  // No Europa / Estados Unidos / Asia / LatAm -> USD
  assert.equal(detectOriginCurrency('USNYC'), 'USD');
  assert.equal(detectOriginCurrency('CNSHA'), 'USD');
  assert.equal(detectOriginCurrency('SGSIN'), 'USD');
  assert.equal(detectOriginCurrency('BRSSZ'), 'USD');
  assert.equal(detectOriginCurrency(''), 'USD');
  assert.equal(detectOriginCurrency(null), 'USD');
  assert.equal(detectOriginCurrency(undefined), 'USD');
});
