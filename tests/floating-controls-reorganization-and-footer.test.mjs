import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forwarderSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const tariffCssSource = readFileSync(new URL('../assets/css/provider-tariff-sidebar.css', import.meta.url), 'utf8');
const seaAssistantCss = readFileSync(new URL('../assets/css/sea-assistant.css', import.meta.url), 'utf8');
const widgetSource = readFileSync(new URL('../src/components/AgenteProyectosWidget.jsx', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('1. Eliminación de duplicados: No hay botones repetidos de Data Bridge ni widgets duplicados en el reporte', () => {
  // En ForwarderWorkspace ya no se duplica stack-databridge-status ni stack-btn-project-agent ni stack-btn-provider-tariffs
  assert.doesNotMatch(forwarderSource, /id="stack-databridge-status"/, 'No debe existir botón duplicado de databridge en ForwarderWorkspace');
  assert.doesNotMatch(forwarderSource, /id="stack-btn-project-agent"/, 'No debe existir botón duplicado de project agent en ForwarderWorkspace');
  assert.doesNotMatch(forwarderSource, /id="stack-btn-provider-tariffs"/, 'No debe existir botón duplicado de tarifas en ForwarderWorkspace');

  // El botón genérico btn-print-executive-report debe estar eliminado
  assert.doesNotMatch(forwarderSource, /id="btn-print-executive-report"/, 'El botón genérico btn-print-executive-report debe estar eliminado');
});

test('2. Nuevo contenedor central: Acciones del reporte centradas abajo con estilos exactos', () => {
  // Debe existir el contenedor central report-actions-center-toolbar
  assert.match(forwarderSource, /id="report-actions-center-toolbar"/);

  // Estilos requeridos: position fixed, bottom 2rem, left 50%, transform translateX(-50%), gap 1rem, justify-content center, z-index 999
  assert.match(forwarderSource, /bottom:\s*'2rem'/);
  assert.match(forwarderSource, /left:\s*'50%'/);
  assert.match(forwarderSource, /transform:\s*'translateX\(-50%\)'/);
  assert.match(forwarderSource, /gap:\s*'1rem'/);
  assert.match(forwarderSource, /justifyContent:\s*'center'/);
  assert.match(forwarderSource, /zIndex:\s*999/);

  // Contiene los botones de acción del documento
  assert.match(forwarderSource, /id="btn-close-executive-report"/);
  assert.match(forwarderSource, /id="btn-print-internal-report"/);
  assert.match(forwarderSource, /id="btn-print-client-report"/);
});

test('3. Limpieza de la esquina derecha: Asistentes y Data Bridge posicionados a bottom: 4rem / right: 1.5rem sin solaparse', () => {
  // FAB del Asistente a bottom: 4rem y right: 1.5rem
  assert.match(seaAssistantCss, /\.sea-assistant-fab[\s\S]*?right:\s*1\.5rem/);
  assert.match(seaAssistantCss, /\.sea-assistant-fab[\s\S]*?bottom:\s*4rem/);

  // Data Bridge launcher en index.html a right-6 (1.5rem)
  assert.match(indexHtmlSource, /id="web-databridge-launcher"[\s\S]*?right-6/);
});

test('4. Reubicación Tarifas: Mueve el botón de Tarifas Proveedores / Clientes de vuelta al margen izquierdo', () => {
  // En el CSS del sidebar de tarifas, la pestaña flotante debe estar anclada a la izquierda (left: 0, right: auto)
  assert.match(tariffCssSource, /\.pt-drawer-trigger-tab[\s\S]*?left:\s*0/, 'La pestaña flotante debe ubicarse en left: 0');
  assert.match(tariffCssSource, /\.pt-drawer-trigger-tab[\s\S]*?right:\s*auto/, 'La pestaña flotante debe tener right: auto');
  assert.match(tariffCssSource, /\.pt-drawer-trigger-tab[\s\S]*?bottom:\s*96px/, 'La pestaña flotante debe mantener elevación en bottom: 96px');
});

test('5. AgenteProyectosWidget soporta hideFloatingLauncher para evitar duplicados en el reporte', () => {
  assert.match(widgetSource, /hideFloatingLauncher\s*=\s*false/);
  assert.match(widgetSource, /if\s*\(hideFloatingLauncher\)\s*\{\s*return null;\s*\}/);
  assert.match(forwarderSource, /<AgenteProyectosWidget[\s\S]*?hideFloatingLauncher=\{showExecutiveReport\}/);
});
