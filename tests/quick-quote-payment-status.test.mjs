import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const fnMultimodalSync = fs.readFileSync(path.join(rootDir, 'netlify/functions/multimodal-sync.ts'), 'utf-8');
const reactPanelFile = fs.readFileSync(path.join(rootDir, 'src/components/QuickQuotePanel.jsx'), 'utf-8');

test('1. UI: Indicador visual de estado (Badge / Pill) en Quick Quote justo debajo del título dinámico y subtítulo', () => {
  // Verificar contenedor de Quick Quote
  assert.match(indexHtml, /id="multimodal-quick-quote-panel"/, 'El panel Quick Quote debe existir');
  assert.match(indexHtml, /id="quick-quote-mode-title"/, 'El título dinámico del modo debe existir');

  // Verificar que el badge está inmediatamente después del subtítulo
  const subtitleIndex = indexHtml.indexOf('Precio final de venta consolidado para el cliente');
  const badgeIndex = indexHtml.indexOf('id="quick-quote-status-badge"');
  assert.ok(subtitleIndex !== -1, 'El subtítulo debe existir en index.html');
  assert.ok(badgeIndex !== -1, 'El badge id="quick-quote-status-badge" debe existir en index.html');
  assert.ok(badgeIndex > subtitleIndex, 'El badge debe colocarse justo debajo del subtítulo');

  // Elementos internos del badge
  assert.match(indexHtml, /id="quick-quote-status-icon"/, 'Debe incluir icono para el estado');
  assert.match(indexHtml, /id="quick-quote-status-text"/, 'Debe incluir texto para el estado');
  assert.match(indexHtml, /data-status="draft"/, 'El estado inicial debe ser draft (Borrador)');
  assert.match(indexHtml, /Borrador/, 'El texto inicial del indicador debe ser Borrador');
});

test('2. UI & Estilos: Mapeo estricto de estados visuales', () => {
  // Estado 1: Borrador (gris claro)
  assert.match(indexHtml, /bg-slate-100\s+text-slate-600\s+border\s+border-slate-200/, 'Estado Borrador debe tener fondo gris claro');

  // Estado 2: Enviado - Esperando Pago (fondo amarillo/naranja claro, texto oscuro)
  assert.match(indexHtml, /Enviado - Esperando Pago/, 'Debe mapear el texto "Enviado - Esperando Pago"');
  assert.match(indexHtml, /bg-amber-100\s+text-amber-900\s+border\s+border-amber-300/, 'Estado Enviado - Esperando Pago debe tener fondo amarillo/naranja y texto oscuro');

  // Estado 3: Pago Recibido - Booking Confirmado (fondo verde suave, texto verde oscuro, icono check ✓)
  assert.match(indexHtml, /Pago Recibido - Booking Confirmado/, 'Debe mapear el texto "Pago Recibido - Booking Confirmado"');
  assert.match(indexHtml, /bg-emerald-50\s+text-emerald-900\s+border\s+border-emerald-300/, 'Estado confirmado debe tener fondo verde suave y texto verde oscuro');
  assert.match(indexHtml, /✓/, 'Debe incluir el icono check (✓)');
});

test('3. Polling: Consulta en segundo plano cada 15-20 segundos a la base de datos Neon / endpoint de lectura', () => {
  // Verificación de intervalo configurado (15-20s -> 15000ms)
  assert.match(indexHtml, /setInterval\([\s\S]*?,\s*(15000|20000)\)/, 'Debe iniciar un setInterval con periodicidad de 15 a 20 segundos');
  assert.match(indexHtml, /fetch\(\s*`?\/api\/multimodal\/sync\?/, 'El polling debe consultar el endpoint /api/multimodal/sync');
  assert.match(indexHtml, /quickQuotePollingInterval/, 'Debe registrar la referencia del intervalo de polling');

  // Limpieza estricta del intervalo
  assert.match(indexHtml, /clearInterval\(quickQuotePollingInterval\)/, 'Debe limpiar el intervalo con clearInterval');
  assert.match(indexHtml, /stopQuickQuotePolling/, 'Debe definir función de detención y limpieza del polling');
});

test('4. Cese de Polling: Detención automática cuando el estado es el definitivo ("Booking Confirmado")', () => {
  assert.match(indexHtml, /isBookingConfirmedStatus/, 'Debe evaluar si el estado devuelto es de confirmación de booking/pago');
  assert.match(indexHtml, /stopQuickQuotePolling\(\)/, 'Debe detener el polling al confirmarse el booking');
});

test('5. Bloqueo de Acciones: Deshabilitar botón "Sincronizar Data Bridge" al confirmarse el booking', () => {
  assert.match(indexHtml, /syncBtn\.disabled\s*=\s*true/, 'Debe deshabilitar syncBtn al recibir la confirmación de booking');
  assert.match(indexHtml, /syncBtn\.classList\.add\(['"]opacity-60['"],\s*['"]cursor-not-allowed['"]\)/, 'Debe añadir clases de bloqueo visual al botón');
});

test('6. Backend Netlify Function: /api/multimodal/sync soporta consulta específica por referencia/id y actualización de estado', () => {
  assert.match(fnMultimodalSync, /url\.searchParams\.get\(\s*["']ref["']\s*\)/, 'Soporta parámetro ref');
  assert.match(fnMultimodalSync, /url\.searchParams\.get\(\s*["']referencia["']\s*\)/, 'Soporta parámetro referencia');
  assert.match(fnMultimodalSync, /url\.searchParams\.get\(\s*["']id["']\s*\)/, 'Soporta parámetro id');
  assert.match(fnMultimodalSync, /WHERE referencia = \$1/, 'Filtra por referencia');
  assert.match(fnMultimodalSync, /req\.method\s*===\s*["']PATCH["']\s*\|\|\s*req\.method\s*===\s*["']PUT["']/, 'Soporta métodos PATCH/PUT para actualizar estado');
  assert.match(fnMultimodalSync, /UPDATE multimodal_operations/, 'Permite actualizar estado en la base de datos Neon');
});

test('7. Componente React QuickQuotePanel: Implementa useEffect con polling de 15-20s, badge y bloqueo de sincronización', () => {
  assert.match(reactPanelFile, /export\s+function\s+QuickQuotePanel/, 'Debe exportar el componente QuickQuotePanel');
  assert.match(reactPanelFile, /useEffect\(/, 'Debe implementar useEffect para el ciclo de vida del polling');
  assert.match(reactPanelFile, /setInterval\(/, 'Debe implementar setInterval en el useEffect');
  assert.match(reactPanelFile, /clearInterval\(/, 'Debe limpiar el intervalo al desmontarse o confirmarse');
  assert.match(reactPanelFile, /id="quick-quote-status-badge"/, 'Renderiza el badge de estado');
  assert.match(reactPanelFile, /Pago Recibido - Booking Confirmado/, 'Incluye estado Pago Recibido - Booking Confirmado');
  assert.match(reactPanelFile, /Enviado - Esperando Pago/, 'Incluye estado Enviado - Esperando Pago');
  assert.match(reactPanelFile, /Borrador/, 'Incluye estado Borrador');
  assert.match(reactPanelFile, /disabled=\{status === 'confirmed'/, 'Deshabilita botón Sincronizar Data Bridge cuando el estado es confirmed');
});
