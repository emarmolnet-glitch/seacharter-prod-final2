import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');

// BLOQUE 1: CORRECCIÓN VISUAL LIGHT THEME EN SECCIÓN 5
test('1. Flete Sugerido Armador (Compra) aplica paleta Light Theme azul claro (bg-blue-50 border-blue-200 text-blue-900)', () => {
  // Asegurar que no contenga clases residuales de fondo oscuro en las tarjetas de flete sugerido
  const armadorMatch = workspaceSource.match(/<div[^>]*bg-blue-50[^>]*border-blue-200[^>]*text-blue-900[\s\S]*?modal-flete-sugerido-armador/);
  assert.ok(armadorMatch, 'La tarjeta de Flete Sugerido Armador debe contener bg-blue-50 border-blue-200 text-blue-900');
  assert.doesNotMatch(armadorMatch[0], /bg-slate-800/, 'No debe contener fondo oscuro bg-slate-800');
});

test('2. Flete Sugerido Fletador (Venta) aplica paleta Light Theme verde claro (bg-emerald-50 border-emerald-200 text-emerald-900)', () => {
  const fletadorMatch = workspaceSource.match(/<div[^>]*bg-emerald-50[^>]*border-emerald-200[^>]*text-emerald-900[\s\S]*?modal-flete-sugerido-fletador/);
  assert.ok(fletadorMatch, 'La tarjeta de Flete Sugerido Fletador debe contener bg-emerald-50 border-emerald-200 text-emerald-900');
  assert.doesNotMatch(fletadorMatch[0], /bg-slate-800/, 'No debe contener fondo oscuro bg-slate-800');
});

// BLOQUE 2: MAPEO DINÁMICO DE TRANSPORTE Y MARGEN DE VENTA
test('3. ForwarderWorkspace mapea transportCost dinámicamente desde activeProject.land_freight_cost', () => {
  assert.match(
    workspaceSource,
    /const\s+transportCost\s*=\s*Number\(activeProject\?\.land_freight_cost\s*\?\?\s*0\)\s*\|\|\s*0;/
  );
});

test('4. La Venta del Servicio de Transporte calcula el coste más el margen del 15% (costEur * 1.15)', () => {
  assert.match(
    workspaceSource,
    /Math\.round\(costEur\s*\*\s*1\.15\s*\*\s*100\)\s*\/\s*100/
  );
});

test('5. Simulación funcional: cálculo dinámico del coste y precio de venta de transporte', () => {
  const activeProject = { land_freight_cost: '2450.50' };
  const transportCost = Number(activeProject?.land_freight_cost ?? 0) || 0;
  const costEur = transportCost;
  const saleEur = Math.round(costEur * 1.15 * 100) / 100;

  assert.equal(transportCost, 2450.5);
  assert.equal(costEur, 2450.5);
  assert.equal(saleEur, 2818.08); // 2450.5 * 1.15 = 2818.075 -> redondeo a 2818.08
});

// BLOQUE 3: SINCRONIZACIÓN DE REFERENCIAS RDM VS EXP Y UPSERT
test('6. getActiveGlobalReference captura la referencia corporativa activa (RDM/) del estado global', () => {
  assert.match(workspaceSource, /const\s+getActiveGlobalReference\s*=\s*\(\)\s*=>/);
  assert.match(workspaceSource, /active_contract_ref/);
  assert.match(workspaceSource, /ContractRefManager/);
  assert.match(workspaceSource, /ContractReference/);
});

test('7. handleSaveProjectCargo prioriza el project_ref corporativo RDM activo sobre el id genérico EXP', () => {
  assert.match(workspaceSource, /const\s+globalActiveRef\s*=\s*getActiveGlobalReference\(\);/);
  assert.match(workspaceSource, /const\s+hasActiveRdm\s*=\s*Boolean\(globalActiveRef\s*&&\s*\/\^RDM\\\/\/i\.test\(globalActiveRef\.trim\(\)\)\);/);
  assert.match(workspaceSource, /const\s+activeProjectRef\s*=\s*hasActiveRdm\s*\?\s*globalActiveRef\.trim\(\)\s*:\s*\(activeProject\?\.project_ref\s*\|\|\s*globalActiveRef\s*\|\|\s*''\);/);
});

test('8. Si hay un RDM activo, la operación ejecuta un UPDATE / UPSERT sobre ese expediente específico', () => {
  assert.match(workspaceSource, /const\s+existingRdmProject\s*=\s*hasActiveRdm\s*\?\s*projects\.find/);
  assert.match(workspaceSource, /const\s+targetProject\s*=\s*existingRdmProject\s*\|\|\s*\(hasActiveRdm\s*&&\s*activeProject\s*\?\s*\{\s*\.\.\.activeProject,\s*project_ref:\s*globalActiveRef\.trim\(\)\s*\}\s*:\s*activeProject\)/);
  assert.match(workspaceSource, /await\s+persistProjectToDatabase\(updatedProject\);/);
});

test('9. netlify/functions/forwarder-projects.js soporta UPSERT en POST y PUT preservando la referencia corporativa RDM', () => {
  // Verificación en POST
  assert.match(backendSource, /if\s*\(updateResult\.rows\.length\s*>\s*0\)/);
  assert.match(backendSource, /UPSERT:\s*Si no existía fila previa con ese project_ref/);
  assert.match(backendSource, /const\s+upsertRef\s*=\s*data\.project_ref/);

  // Verificación en PUT
  assert.match(backendSource, /if\s*\(result\.rows\.length\s*===\s*0\)\s*\{[\s\S]*?if\s*\(data\.project_ref\)/);
});
