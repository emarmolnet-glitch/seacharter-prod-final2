import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const forwarderComponentSource = readFileSync(new URL('../src/components/ForwarderWorkspace.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexHtmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/forwarder-workspace-entry.jsx', import.meta.url), 'utf8');

test('1. ForwarderWorkspace.jsx defines two-column fullscreen layout with Tailwind CSS', () => {
  // Sidebar w-80
  assert.match(forwarderComponentSource, /w-80/);
  assert.match(forwarderComponentSource, /shrink-0/);
  // Main canvas flex-1
  assert.match(forwarderComponentSource, /flex-1/);
  // Maritime slate/blue palette
  assert.match(forwarderComponentSource, /bg-slate-950/);
  assert.match(forwarderComponentSource, /bg-slate-900/);
  assert.match(forwarderComponentSource, /border-slate-800/);
});

test('2. ForwarderWorkspace.jsx implements "+ Nuevo Proyecto" with prompt and POST to forwarder-projects endpoint', () => {
  assert.match(forwarderComponentSource, /\+ Nuevo Proyecto/);
  assert.match(forwarderComponentSource, /window\.prompt\(/);
  assert.match(forwarderComponentSource, /fetch\(['"]\/\.netlify\/functions\/forwarder-projects['"]/);
  assert.match(forwarderComponentSource, /method:\s*['"]POST['"]/);
  assert.match(forwarderComponentSource, /client_name/);
});

test('3. ForwarderWorkspace.jsx fetches projects on mount with isLoading state and displays project details', () => {
  assert.match(forwarderComponentSource, /useEffect\(/);
  assert.match(forwarderComponentSource, /fetchProjects/);
  assert.match(forwarderComponentSource, /method:\s*['"]GET['"]/);
  assert.match(forwarderComponentSource, /isLoading/);
  assert.match(forwarderComponentSource, /project_ref/);
  assert.match(forwarderComponentSource, /client_name/);
  assert.match(forwarderComponentSource, /status/);
});

test('4. ForwarderWorkspace.jsx manages activeProject state and renders header and dashed services placeholder', () => {
  assert.match(forwarderComponentSource, /activeProject/);
  assert.match(forwarderComponentSource, /setActiveProject/);
  // Empty state when no active project
  assert.match(forwarderComponentSource, /Expediente de Transitario/);
  assert.match(forwarderComponentSource, /Selecciona un proyecto de la lista lateral/);
  // Header with active project
  assert.match(forwarderComponentSource, /activeProject\.client_name/);
  assert.match(forwarderComponentSource, /activeProject\.project_ref/);
  assert.match(forwarderComponentSource, /activeProject\.status/);
  // Dashed border placeholder with button
  assert.match(forwarderComponentSource, /border-dashed/);
  assert.match(forwarderComponentSource, /No hay servicios logísticos añadidos a este proyecto/);
  assert.match(forwarderComponentSource, /➕ Añadir Servicio/);
});

test('5. App.jsx conditionally renders ForwarderWorkspace when view is FORWARDERS while preserving all hooks', () => {
  assert.match(appSource, /import\s*\{\s*ForwarderWorkspace\s*\}\s*from\s*['"]\.\/components\/ForwarderWorkspace\.jsx['"]/);
  assert.match(appSource, /currentView === 'FORWARDERS'\s*\?\s*\(\s*<ForwarderWorkspace\s*\/>\s*\)\s*:\s*\(\s*children\s*\)/);
  assert.match(appSource, /useSeaCharterSync\(\)/);
  assert.match(appSource, /useUrlImoAutoLookup\(\)/);
  assert.match(appSource, /usePendingImoSync\(\)/);
});

test('6. index.html includes visual vertical separator and 💼 PROYECTOS button to the right of AUDITORIA', () => {
  const renderNavStart = indexHtmlSource.indexOf('function renderPrimaryNavigation()');
  const renderNavEnd = indexHtmlSource.indexOf('function updateMobileModuleNavLabel', renderNavStart);
  const renderNavSource = indexHtmlSource.slice(renderNavStart, renderNavEnd);

  assert.match(renderNavSource, /tab-btn-forwarders/);
  assert.match(renderNavSource, /💼 PROYECTOS/);
  assert.match(renderNavSource, /w-px.*bg-slate-700/);
  assert.match(renderNavSource, /switchTab\(['"]FORWARDERS['"]\)/);
});

test('7. index.html defines view-forwarders and switchTab hides other views (including 3D globe and INPUT GEOGRAFICO)', () => {
  assert.match(indexHtmlSource, /id="view-forwarders"/);
  assert.match(indexHtmlSource, /id="forwarder-workspace-root"/);
  assert.match(indexHtmlSource, /src="\.\/src\/forwarder-workspace-entry\.jsx"/);

  const switchTabStart = indexHtmlSource.indexOf('function switchTab(tabId)');
  const switchTabEnd = indexHtmlSource.indexOf('function closeMobileSessionMenu()', switchTabStart);
  const switchTabSource = indexHtmlSource.slice(switchTabStart, switchTabEnd);

  assert.match(switchTabSource, /tabId === 'FORWARDERS'/);
  assert.match(switchTabSource, /view-forwarders/);
  assert.match(switchTabSource, /window\.mountForwarderWorkspace/);
  assert.match(switchTabSource, /window\.currentView = 'FORWARDERS'/);
});

test('8. forwarder-workspace-entry.jsx mounts ForwarderWorkspace to DOM container', () => {
  assert.match(entrySource, /createRoot/);
  assert.match(entrySource, /mountForwarderWorkspace/);
  assert.match(entrySource, /<ForwarderWorkspace \/>/);
});
