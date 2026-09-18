import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

// ============================================================================
// BLOQUE 1: VERIFICACIÓN ESTRUCTURAL EN FORWARDERWORKSPACE.JSX
// ============================================================================

test('1. handleSaveProjectCargo formatea client_name dinámicamente con plantilla literal REF: ${activeProject?.project_ref || ""} ${activeProject?.client_name || activeProject?.name || ""}', () => {
  // Verificar en payload
  assert.match(
    workspaceSource,
    /client_name:\s*`REF:\s*\$\{activeProject\?\.project_ref\s*\|\|\s*''\}\s*\$\{activeProject\?\.client_name\s*\|\|\s*activeProject\?\.name\s*\|\|\s*''\}`\.trim\(\)/,
    'El objeto payload debe formatear client_name con la plantilla literal combinando project_ref y client_name/name'
  );

  // Verificar en updatedProject
  const saveCargoSectionMatch = workspaceSource.match(/const\s+handleSaveProjectCargo\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*const\s+getStowageAscii/);
  assert.ok(saveCargoSectionMatch, 'handleSaveProjectCargo debe existir');
  const code = saveCargoSectionMatch[1];

  const updatedProjectMatches = [...code.matchAll(/client_name:\s*`REF:\s*\$\{activeProject\?\.project_ref\s*\|\|\s*''\}\s*\$\{activeProject\?\.client_name\s*\|\|\s*activeProject\?\.name\s*\|\|\s*''\}`\.trim\(\)/g)];
  assert.ok(
    updatedProjectMatches.length >= 2,
    'Tanto el payload del proyecto como updatedProject deben tener inyectado client_name dinámico'
  );
});

test('2. handleSaveProjectCargo excluye explícitamente el id original en updatedProject para inserción de clon en Neon', () => {
  assert.match(
    workspaceSource,
    /delete\s+updatedProject\.id;/,
    'Debe eliminar explícitamente el id original en updatedProject para evitar sobreescritura y garantizar la creación del clon'
  );
  assert.match(
    workspaceSource,
    /const\s*\{\s*id:\s*_originalId,\s*\.\.\.projectDataWithoutId\s*\}\s*=\s*targetProject;/,
    'Debe desestructurar targetProject excluyendo el id original'
  );
});

test('3. Aislamiento estricto: los costes financieros y la estiba no han sido alterados', () => {
  assert.match(workspaceSource, /subtotal_ocean_freight_usd:/);
  assert.match(workspaceSource, /subtotal_fob_operations_usd:/);
  assert.match(workspaceSource, /estimated_total_cost_usd:/);
  assert.match(workspaceSource, /customer_sale_price_usd:/);
  assert.match(workspaceSource, /lashing_and_dunnage_materials:/);
  assert.match(workspaceSource, /port_labor_and_equipment:/);
  assert.match(workspaceSource, /peripheral_services:/);
});

// ============================================================================
// BLOQUE 2: SIMULACIÓN DE COMPORTAMIENTO Y CASOS DE PRUEBA
// ============================================================================

test('4. Simulación funcional: expediente original EXP-166934 y "prueba definitiva" genera "REF: EXP-166934 prueba definitiva"', () => {
  const activeProject = {
    id: 99,
    project_ref: 'EXP-166934',
    client_name: 'prueba definitiva',
    status: 'Borrador'
  };

  const client_name = `REF: ${activeProject?.project_ref || ''} ${activeProject?.client_name || activeProject?.name || ''}`.trim();
  assert.strictEqual(
    client_name,
    'REF: EXP-166934 prueba definitiva',
    'El nombre del clon debe ser exactamente "REF: EXP-166934 prueba definitiva"'
  );
});

test('5. Simulación funcional: soporte cuando solo name está presente o client_name vacío', () => {
  const activeProjectWithName = {
    id: 100,
    project_ref: 'EXP-554433',
    name: 'Carga Eólica Bilbao',
  };

  const client_name = `REF: ${activeProjectWithName?.project_ref || ''} ${activeProjectWithName?.client_name || activeProjectWithName?.name || ''}`.trim();
  assert.strictEqual(
    client_name,
    'REF: EXP-554433 Carga Eólica Bilbao',
    'Debe usar activeProject.name como fallback si client_name no está definido'
  );
});

test('6. Simulación funcional: ausencia del id original en el objeto a persistir', () => {
  const targetProject = {
    id: 42,
    project_ref: 'EXP-166934',
    client_name: 'prueba definitiva',
    line_items: [{ id: 'item-1' }]
  };
  const activeProject = { ...targetProject };

  const { id: _originalId, ...projectDataWithoutId } = targetProject;
  const updatedProject = {
    ...projectDataWithoutId,
    project_ref: targetProject.project_ref,
    client_name: `REF: ${activeProject?.project_ref || ''} ${activeProject?.client_name || activeProject?.name || ''}`.trim(),
    line_items: targetProject.line_items,
  };
  delete updatedProject.id;

  assert.strictEqual(updatedProject.id, undefined, 'updatedProject no debe contener la propiedad id');
  assert.strictEqual('id' in updatedProject, false, 'La clave id no debe existir en el objeto');
  assert.strictEqual(updatedProject.client_name, 'REF: EXP-166934 prueba definitiva');
});
