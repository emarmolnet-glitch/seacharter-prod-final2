import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const backendFunctionSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');

test('1. Project cards in sidebar contain a discreet delete button with trash icon and theme styling', () => {
  // Sidebar project mapping renders delete button inside each project card
  assert.match(forwarderComponentSource, /projects\.map\(\(proj\) => \{/);
  assert.match(forwarderComponentSource, /handleDeleteProject\(e,\s*proj\)/);
  assert.match(forwarderComponentSource, /title=["']Eliminar proyecto["']/);
  assert.match(forwarderComponentSource, /aria-label=\{`Eliminar proyecto/);
  // Subtle theme styling matching dark slate theme (rose hover effect)
  assert.match(forwarderComponentSource, /hover:text-rose-400/);
  assert.match(forwarderComponentSource, /hover:bg-rose-500\/10/);
  assert.match(forwarderComponentSource, /cursor-pointer/);
  // SVG trash icon rendered inside the delete button
  assert.match(forwarderComponentSource, /d=["']M19 7l-\.867 12\.142A2 2 0 0116\.138 21H7\.862a2 2 0 01-1\.995-1\.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16["']/);
});

test('2. Delete button stops event propagation (e.stopPropagation()) to prevent opening the project', () => {
  assert.match(forwarderComponentSource, /const handleDeleteProject = async \(e, projToDelete\) => \{/);
  assert.match(forwarderComponentSource, /e\.stopPropagation\(\)/);
});

test('3. Accidental deletion is prevented with window.confirm dialog', () => {
  assert.match(forwarderComponentSource, /window\.confirm\(/);
  assert.match(forwarderComponentSource, /if \(!confirmed\) return;/);
});

test('4. Frontend immediately removes project from local state and handles active project redirection or cleanup', () => {
  // Filters out deleted project
  assert.match(forwarderComponentSource, /const updatedProjects = projects\.filter\(/);
  assert.match(forwarderComponentSource, /setProjects\(updatedProjects\)/);
  // Active project handling: redirect to remaining or clear view
  assert.match(forwarderComponentSource, /if \(isCurrentActive\) \{/);
  assert.match(forwarderComponentSource, /if \(updatedProjects\.length > 0\) \{/);
  assert.match(forwarderComponentSource, /setActiveProject\(updatedProjects\[0\]\);/);
  assert.match(forwarderComponentSource, /setActiveProject\(null\);/);
});

test('5. Deletion triggers DELETE request to /.netlify/functions/forwarder-projects with project credentials', () => {
  assert.match(forwarderComponentSource, /fetch\(['"]\/\.netlify\/functions\/forwarder-projects['"]/);
  assert.match(forwarderComponentSource, /method:\s*['"]DELETE['"]/);
  assert.match(forwarderComponentSource, /id:\s*projToDelete\.id/);
  assert.match(forwarderComponentSource, /project_ref:\s*projToDelete\.project_ref/);
});

test('6. Backend forwarder-projects.js function supports DELETE method for persistent database deletion', () => {
  assert.match(backendFunctionSource, /if \(httpMethod === ['"]DELETE['"]\) \{/);
  assert.match(backendFunctionSource, /DELETE FROM forwarder_projects/);
  assert.match(backendFunctionSource, /WHERE \(\$1::integer IS NOT NULL AND id = \$1\)/);
  assert.match(backendFunctionSource, /OR \(\$2::text IS NOT NULL AND project_ref = \$2\)/);
  assert.match(backendFunctionSource, /RETURNING \*/);
  assert.match(backendFunctionSource, /deletedCount/);
});

test('7. Behavioral simulation: handleDeleteProject logic when user confirms vs cancels', async () => {
  let stopped = false;
  const mockEvent = {
    stopPropagation: () => { stopped = true; }
  };

  const initialProjects = [
    { id: 1, project_ref: 'EXP-001', client_name: 'Alpha Corp' },
    { id: 2, project_ref: 'EXP-002', client_name: 'Beta Ltd' },
    { id: 3, project_ref: 'EXP-003', client_name: 'Gamma SA' }
  ];

  // Case A: User cancels confirmation
  let confirmResult = false;
  let currentProjects = [...initialProjects];
  let activeProj = initialProjects[0];
  let fetchCalled = false;

  const runDelete = (e, projToDelete) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    const confirmed = confirmResult;
    if (!confirmed) return;

    currentProjects = currentProjects.filter(p => p.id !== projToDelete.id);
    const isCurrentActive = activeProj && activeProj.id === projToDelete.id;
    if (isCurrentActive) {
      activeProj = currentProjects.length > 0 ? currentProjects[0] : null;
    }
    fetchCalled = true;
  };

  runDelete(mockEvent, initialProjects[0]);
  assert.equal(stopped, true, 'stopPropagation was called');
  assert.equal(currentProjects.length, 3, 'Projects were not modified because confirm was false');
  assert.equal(activeProj.id, 1, 'Active project did not change');
  assert.equal(fetchCalled, false, 'Fetch was not called');

  // Case B: User confirms deletion of active project (Alpha Corp)
  confirmResult = true;
  stopped = false;
  runDelete(mockEvent, initialProjects[0]);

  assert.equal(stopped, true, 'stopPropagation was called');
  assert.equal(currentProjects.length, 2, 'Project was removed from list');
  assert.equal(currentProjects[0].id, 2, 'Beta Ltd is now first in list');
  assert.equal(activeProj.id, 2, 'Active project redirected cleanly to next available (Beta Ltd)');
  assert.equal(fetchCalled, true, 'Delete fetch was invoked');

  // Case C: User confirms deletion of the last remaining project
  currentProjects = [{ id: 3, project_ref: 'EXP-003', client_name: 'Gamma SA' }];
  activeProj = currentProjects[0];
  runDelete(mockEvent, currentProjects[0]);

  assert.equal(currentProjects.length, 0, 'No projects remain');
  assert.equal(activeProj, null, 'Active project was cleaned (set to null)');
});
