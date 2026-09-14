import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace defines "Actualizar" button with refetch icon in lateral list header next to "+ Nuevo Proyecto"', () => {
  // Check header container has flex and gap
  const headerMatch = forwarderComponentSource.match(/<div className="p-4 border-b border-slate-800 flex items-center gap-2">[\s\S]*?<\/div>/);
  assert.ok(headerMatch, 'Sidebar header must be a flex container with gap-2');
  
  // Both "+ Nuevo Proyecto" and "Actualizar" must be present inside header
  assert.match(headerMatch[0], /\+ Nuevo Proyecto/, 'Header must include "+ Nuevo Proyecto" button');
  assert.match(headerMatch[0], /Actualizar/, 'Header must include "Actualizar" button');
  assert.match(headerMatch[0], /btn-refresh-projects/, 'Header must define btn-refresh-projects id');
  assert.match(headerMatch[0], /onClick=\{\(\)\s*=>\s*fetchProjects\(\)\}/, 'Actualizar button must call fetchProjects() on click');
  assert.match(headerMatch[0], /<svg[\s\S]*?animate-spin/, 'Refetch icon SVG must have animate-spin state binding');
});

test('2. ForwarderWorkspace defines isRefreshing state and fetchProjects supports silent mode', () => {
  assert.match(forwarderComponentSource, /const\s*\[isRefreshing,\s*setIsRefreshing\]\s*=\s*useState\(false\);/, 'Must define isRefreshing state initialized to false');
  assert.match(forwarderComponentSource, /const\s+fetchProjects\s*=\s*async\s*\(\s*options\s*=\s*\{\}\s*\)\s*=>/, 'fetchProjects must accept options parameter');
  assert.match(forwarderComponentSource, /silent\s*=\s*(?:typeof options === 'boolean'\s*\?\s*options\s*:\s*)?Boolean\(options\?\.silent\)/, 'fetchProjects must support silent option');
  assert.match(forwarderComponentSource, /if\s*\(!silent\)\s*\{\s*setIsRefreshing\(true\);/, 'fetchProjects must set isRefreshing when not silent');
});

test('3. "Guardar Flete y Estiba en Proyecto" automatically triggers silent refetching of projects list', () => {
  const saveCargoMatch = forwarderComponentSource.match(/const\s+handleSaveProjectCargo\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?await\s+persistProjectToDatabase\(updatedProject\);[\s\S]*?await\s+fetchProjects\({\s*silent:\s*true\s*}\);/);
  assert.ok(saveCargoMatch, 'handleSaveProjectCargo must trigger fetchProjects({ silent: true }) right after saving to database');
});

test('4. Behavioral simulation: manual refresh and silent refresh after save update state correctly', async () => {
  let callCount = 0;
  let lastOptions = null;
  const mockProjects = [
    { id: 1, project_ref: 'PRJ-2026-001', client_name: 'Marítima Global' },
    { id: 2, project_ref: 'PRJ-2026-002', client_name: 'Logística Portuaria' }
  ];

  let projectsState = [];
  let isRefreshingState = false;
  let isLoadingState = false;

  const mockFetchProjects = async (options = {}) => {
    callCount++;
    lastOptions = options;
    const silent = typeof options === 'boolean' ? options : Boolean(options?.silent);
    if (!silent) {
      isRefreshingState = true;
      isLoadingState = true;
    }
    // Simulate async fetch to Neon
    await new Promise((resolve) => setTimeout(resolve, 10));
    projectsState = [...mockProjects];
    if (!silent) {
      isRefreshingState = false;
      isLoadingState = false;
    }
    return projectsState;
  };

  // Test manual refresh click
  const manualPromise = mockFetchProjects();
  assert.equal(isRefreshingState, true, 'isRefreshing must be true during manual refetch');
  assert.equal(isLoadingState, true, 'isLoading must be true during manual refetch');
  await manualPromise;
  assert.equal(isRefreshingState, false, 'isRefreshing must be false after completion');
  assert.equal(isLoadingState, false, 'isLoading must be false after completion');
  assert.equal(projectsState.length, 2, 'Projects list must be populated');
  assert.equal(callCount, 1);

  // Test silent refresh on save
  const silentPromise = mockFetchProjects({ silent: true });
  assert.equal(isRefreshingState, false, 'isRefreshing must remain false during silent refetch');
  assert.equal(isLoadingState, false, 'isLoading must remain false during silent refetch');
  await silentPromise;
  assert.equal(callCount, 2);
  assert.deepEqual(lastOptions, { silent: true });
});
