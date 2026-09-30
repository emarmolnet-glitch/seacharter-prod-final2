import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dossiersSource = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const contractRefSource = readFileSync(new URL('../contract-reference.js', import.meta.url), 'utf8');
const forwarderProjectsSource = readFileSync(new URL('../netlify/functions/forwarder-projects.js', import.meta.url), 'utf8');
const projectContextSource = readFileSync(new URL('../src/context/ProjectContext.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('1. Estado Global: ProjectContext and activeProjectRef created and integrated', () => {
  assert.match(projectContextSource, /export\s+const\s+ProjectContext\s*=\s*createContext/);
  assert.match(projectContextSource, /export\s+function\s+ProjectProvider/);
  assert.match(projectContextSource, /export\s+function\s+useProjectRef/);
  assert.match(projectContextSource, /activeProjectRef/);
  assert.match(appSource, /import\s*\{\s*ProjectProvider/);
  assert.match(appSource, /<ProjectProvider>/);
});

test('2. Header: activeProjectRef is displayed prominently in top navigation', () => {
  assert.match(indexHtml, /id="header-voyage-ref-container"[^>]*title="[^"]*project_ref[^"]*"/);
  assert.match(indexHtml, /id="quick-ref"/);
  assert.match(indexHtml, /Expediente:/);
  assert.match(contractRefSource, /headerContainer\.dataset\.projectRef\s*=\s*normalized/);
});

test('3. Modal Ineludible: project-init-modal exists in DOM and handles ref initialization', () => {
  assert.match(indexHtml, /id="project-init-modal"/);
  assert.match(indexHtml, /id="project-init-input"/);
  assert.match(indexHtml, /id="btn-project-init-generate"/);
  assert.match(indexHtml, /id="btn-project-init-confirm"/);
  assert.match(indexHtml, /function openProjectInitModal/);
  assert.match(indexHtml, /function confirmProjectInit/);
  assert.match(indexHtml, /function generateAndFillProjectRef/);
});

test('4. URL Parameter: Reads ?ref= or ?project_ref= on startup and skips modal', () => {
  assert.match(indexHtml, /function checkStartupProjectRef/);
  assert.match(indexHtml, /params\.get\('ref'\)\s*\|\|\s*params\.get\('project_ref'\)/);
  assert.match(contractRefSource, /const URL_KEYS = \['ref', 'project_ref'/);
});

test('5. Automatic Save/Export: Eliminates modal prompting for project name and persists with activeProjectRef', () => {
  // dossiers.js requestSave directly persists without opening save modal
  assert.match(dossiersSource, /function requestSave\(\)\s*\{[\s\S]*?persistCurrent/);
  assert.doesNotMatch(dossiersSource, /function requestSave\(\)\s*\{\s*openSaveModal\('save'\);\s*\}/);
  assert.match(dossiersSource, /window\.exportarACrmOperaciones\s*=/);
  assert.match(dossiersSource, /syncDossierToDataBridge/);
});

test('6. Data Bridge UPSERT: Netlify function performs UPSERT updating route_and_chartering under project_ref', () => {
  assert.match(forwarderProjectsSource, /route_and_chartering\s*=\s*COALESCE\(\$12::jsonb,\s*route_and_chartering\)/);
  assert.match(forwarderProjectsSource, /WHERE id = \$4 OR project_ref = \$5/);
  assert.match(forwarderProjectsSource, /UPSERT:\s*Si no existía fila previa con ese project_ref/);
});

test('7. Data Bridge Consolidation: GET returns both land fields and route_and_chartering under same project_ref', () => {
  assert.match(forwarderProjectsSource, /SELECT[\s\S]*?project_ref[\s\S]*?land_origin[\s\S]*?land_destination[\s\S]*?route_and_chartering[\s\S]*?FROM forwarder_projects/);
});
