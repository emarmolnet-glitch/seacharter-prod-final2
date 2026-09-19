import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace declara estado reactivo para la Referencia Activa del Topbar', () => {
  assert.match(
    workspaceSource,
    /const\s*\[\s*referenciaActivaGlobal\s*,\s*setReferenciaActivaGlobal\s*\]\s*=\s*useState\s*\(\s*\(\)\s*=>\s*getActiveGlobalReference\(\)\s*\)/,
    'Debe declarar referenciaActivaGlobal inicializada con getActiveGlobalReference()'
  );
  assert.match(
    workspaceSource,
    /const\s+activeContractRef\s*=\s*referenciaActivaGlobal;/,
    'Debe definir alias activeContractRef'
  );
});

test('2. ForwarderWorkspace implementa helpers defensivos para extracción y validación de referencia padre', () => {
  assert.match(
    workspaceSource,
    /const\s+getProjectParentRef\s*=\s*\(p\)\s*=>/,
    'Debe implementar getProjectParentRef'
  );
  assert.match(
    workspaceSource,
    /const\s+isProjectMatchingActiveDossier\s*=\s*\(p,\s*activeRef\)\s*=>/,
    'Debe implementar isProjectMatchingActiveDossier'
  );
  assert.match(workspaceSource, /p\.referenciaPadre/);
  assert.match(workspaceSource, /p\.dossier_ref/);
  assert.match(workspaceSource, /p\.parent_ref/);
});

test('3. ForwarderWorkspace aplica un .filter() estricto en el frontend antes del .map()', () => {
  // Asegura que projects.filter(p => p.referenciaPadre === referenciaActivaGlobal ...).map(...)
  assert.match(
    workspaceSource,
    /projects\s*\.filter\(\s*\(p\)\s*=>\s*\(?p\.referenciaPadre\s*===\s*referenciaActivaGlobal/,
    'Debe filtrar projects verificando p.referenciaPadre === referenciaActivaGlobal antes del .map()'
  );
  assert.match(
    workspaceSource,
    /\.map\(\(proj\) => \{/,
    'Debe mapear los proyectos filtrados'
  );
});

test('4. Lista lateral se renderiza vacía cuando la referencia del Topbar está vacía (workspace en blanco)', () => {
  assert.match(
    workspaceSource,
    /const\s+displayedProjects\s*=\s*!referenciaActivaGlobal\s*\?\s*\[\]\s*:/,
    'Si referenciaActivaGlobal está vacía, displayedProjects debe ser un array vacío []'
  );
});

test('5. Creación de nuevos proyectos hereda la referencia activa del expediente padre', () => {
  assert.match(
    workspaceSource,
    /dossier_ref:\s*currentGlobalRef\s*\|\|\s*undefined/,
    'handleCreateProject debe asociar dossier_ref con la referencia activa'
  );
  assert.match(
    workspaceSource,
    /parent_ref:\s*currentGlobalRef\s*\|\|\s*undefined/,
    'handleCreateProject debe asociar parent_ref con la referencia activa'
  );
  assert.match(
    workspaceSource,
    /referenciaPadre:\s*refPadre/,
    'handleCreateProject debe asociar referenciaPadre'
  );
});

test('6. Simulación funcional: filtrado estricto Padre-Hijo con referencias activas vs vacías', () => {
  // Extraer la lógica de coincidencia simulada idéntica al componente
  const isMatching = (p, activeRef) => {
    if (!p || typeof p !== 'object' || !activeRef) return false;
    const cleanActive = String(activeRef).trim().toUpperCase();
    if (!cleanActive || cleanActive === '—' || cleanActive === '-') return false;

    if (p.referenciaPadre && String(p.referenciaPadre).trim().toUpperCase() === cleanActive) return true;
    if (p.dossier_ref && String(p.dossier_ref).trim().toUpperCase() === cleanActive) return true;
    if (p.parent_ref && String(p.parent_ref).trim().toUpperCase() === cleanActive) return true;

    const rawRef = (p.project_ref || '').trim().toUpperCase();
    if (rawRef === cleanActive) return true;
    if (rawRef.startsWith(cleanActive + '-') || rawRef.startsWith(cleanActive + '/') || rawRef.startsWith(cleanActive + '_')) return true;

    return false;
  };

  const mockDbProjects = [
    { id: 1, project_ref: 'RDM/2026-3490', client_name: 'Proyecto RDM Directo', referenciaPadre: 'RDM/2026-3490' },
    { id: 2, project_ref: 'EXP-101', client_name: 'Sub-Proyecto 1', dossier_ref: 'RDM/2026-3490', referenciaPadre: 'RDM/2026-3490' },
    { id: 3, project_ref: 'RDM/2026-3490-EXP-02', client_name: 'Sub-Proyecto 2', parent_ref: 'RDM/2026-3490', referenciaPadre: 'RDM/2026-3490' },
    { id: 4, project_ref: 'RDM/2026-9999', client_name: 'Proyecto de Otro Expediente', referenciaPadre: 'RDM/2026-9999' },
    { id: 5, project_ref: 'EXP-999', client_name: 'Proyecto Huérfano Antiguo' },
  ];

  // Caso 1: Expediente activo RDM/2026-3490 en Topbar
  const activeRef = 'RDM/2026-3490';
  const filteredActive = mockDbProjects.filter((p) => isMatching(p, activeRef));
  assert.equal(filteredActive.length, 3, 'Deben mostrarse únicamente los 3 proyectos del expediente RDM/2026-3490');
  assert.deepEqual(filteredActive.map((p) => p.id), [1, 2, 3]);

  // Caso 2: Workspace en blanco / referencia vacía en Topbar
  const blankRef = '';
  const filteredBlank = !blankRef ? [] : mockDbProjects.filter((p) => isMatching(p, blankRef));
  assert.equal(filteredBlank.length, 0, 'La lista lateral debe renderizarse vacía si la referencia del Topbar está vacía');

  // Caso 3: Expediente activo RDM/2026-9999
  const otherRef = 'RDM/2026-9999';
  const filteredOther = mockDbProjects.filter((p) => isMatching(p, otherRef));
  assert.equal(filteredOther.length, 1, 'Solo debe mostrarse el proyecto del expediente 9999');
  assert.equal(filteredOther[0].id, 4);

  // Caso 4: Expediente inexistente
  const unkRef = 'RDM/2026-0000';
  const filteredUnk = mockDbProjects.filter((p) => isMatching(p, unkRef));
  assert.equal(filteredUnk.length, 0, 'No debe mostrar ningún proyecto si no coincide con el expediente');
});
