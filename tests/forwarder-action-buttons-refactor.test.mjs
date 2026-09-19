import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(
  new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url),
  'utf8'
);

test('1. MANTENER SUPERIORES: Los botones Volver a Proyectos y Sync DataBridge se renderizan en la parte más alta del proyecto', () => {
  // Verifies the presence of the superior actions container above Torre de Control
  assert.match(
    componentSource,
    /BOTONES SUPERIORES[\s\S]*?← Volver a Proyectos[\s\S]*?⚡ Sync DataBridge[\s\S]*?torre-de-control-dashboard/,
    'Los botones Volver a Proyectos y Sync DataBridge deben mantenerse en la parte superior antes del dashboard Torre de Control'
  );
});

test('2. LIMPIAR "LISTA DE EMPAQUE": La fila de "1. Lista de Empaque" no tiene los botones duplicados y conserva el resto de controles', () => {
  const packingListRowRegex = /1\.\s*Lista de Empaque \(Packing List\)[\s\S]*?<div className="flex items-center gap-2">([\s\S]*?)<\/section>/;
  const match = componentSource.match(packingListRowRegex);
  assert.ok(match, 'Debe existir la fila con el título 1. Lista de Empaque (Packing List)');

  const rowContent = match[1];
  // Must NOT contain the duplicated buttons in this specific container
  assert.doesNotMatch(rowContent, /← Volver a Proyectos/, 'No debe incluir el botón ← Volver a Proyectos en la cabecera de la lista de empaque');
  assert.doesNotMatch(rowContent, /⚡ Sync DataBridge/, 'No debe incluir el botón ⚡ Sync DataBridge en la cabecera de la lista de empaque');

  // Must keep the other elements intact
  assert.match(rowContent, /handleTriggerImport[\s\S]*?Importar PDF\/Excel/, 'Debe mantener el botón Importar PDF/Excel intacto');
  assert.match(rowContent, /cargo-category-select-section1/, 'Debe mantener el selector de Tarifa intacto');
  assert.match(rowContent, /handleAddCargoPiece[\s\S]*?\+\s*Añadir Pieza/, 'Debe mantener el botón + Añadir Pieza intacto');
  assert.match(rowContent, /btn-recalculate-cargo[\s\S]*?handleRecalculate/, 'Debe mantener el botón Recalcular intacto');
});

test('3. REUBICAR AL FINAL (BOTTOM): Contenedor flexbox debajo de "Herramientas Comerciales y Regulatorias" y antes del footer', () => {
  assert.match(
    componentSource,
    /Herramientas Comerciales y Regulatorias[\s\S]*?<\/section>\s*\{\/\* BOTONES DE ACCIÓN INFERIORES: VOLVER A PROYECTOS Y SYNC DATABRIDGE \*\/\}\s*<div className="flex flex-wrap items-center gap-3 mt-8 mb-4">([\s\S]*?)<\/div>\s*<\/div>\s*<div className="bg-slate-50 p-6 border-t border-slate-200 flex justify-between items-end shrink-0">/,
    'El nuevo contenedor div con flexbox debe ubicarse inmediatamente después de la sección Herramientas Comerciales y Regulatorias y antes del footer de Guardar Flete'
  );

  // Verifies the buttons inside the bottom container
  const bottomContainerMatch = componentSource.match(/<div className="flex flex-wrap items-center gap-3 mt-8 mb-4">([\s\S]*?)<\/div>/);
  assert.ok(bottomContainerMatch, 'El contenedor inferior debe existir');

  const bottomContent = bottomContainerMatch[1];
  assert.match(bottomContent, /← Volver a Proyectos/, 'El contenedor inferior debe incluir el botón ← Volver a Proyectos');
  assert.match(bottomContent, /setIsCargoModalOpen\(false\)/, 'El botón inferior debe resetear el modal');
  assert.match(bottomContent, /setActiveProject\(null\)/, 'El botón inferior debe resetear activeProject');
  assert.match(bottomContent, /⚡ Sync DataBridge/, 'El contenedor inferior debe incluir el botón ⚡ Sync DataBridge');
  assert.match(bottomContent, /handleSyncCalculatorData/, 'El botón inferior debe invocar handleSyncCalculatorData');
  assert.match(bottomContent, /isSyncingCalculator/, 'El botón inferior debe reaccionar a isSyncingCalculator');
});
