import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectRefSource = readFileSync(new URL('../src/utils/projectRef.mjs', import.meta.url), 'utf8');
const projectContextSource = readFileSync(new URL('../src/context/ProjectContext.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dossiersSource = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const contractRefSource = readFileSync(new URL('../contract-reference.js', import.meta.url), 'utf8');

test('1. Función generadora: formato canonical RDM/2026-XXXX con 4 dígitos aleatorios', async () => {
  const { generateRandomProjectRef } = await import('../src/utils/projectRef.mjs');
  assert.equal(typeof generateRandomProjectRef, 'function', 'generateRandomProjectRef must be an exported function');

  const refs = new Set();
  for (let i = 0; i < 50; i++) {
    const ref = generateRandomProjectRef();
    assert.match(ref, /^RDM\/2026-\d{4}$/, `Reference ${ref} must match RDM/2026-XXXX format`);
    const num = parseInt(ref.replace('RDM/2026-', ''), 10);
    assert.ok(num >= 1000 && num <= 9999, `Suffix ${num} must be a 4-digit number between 1000 and 9999`);
    refs.add(ref);
  }
  assert.ok(refs.size > 10, 'Generator must produce pseudo-random references across multiple calls');

  assert.match(projectRefSource, /RDM\/2026-\$\{Math\.floor\(1000\s*\+\s*Math\.random\(\)\s*\*\s*9000\)\}/);
  assert.match(projectContextSource, /generateRandomProjectRef/);
  assert.match(appSource, /generateRandomProjectRef/);
  assert.match(contractRefSource, /generateRandomProjectRef/);
  assert.match(contractRefSource, /generateNewProjectRef/);
  assert.match(indexHtml, /window\.generateRandomProjectRef\s*=/);
  assert.match(indexHtml, /window\.generateNewProjectRef\s*=/);
});

test('2. Detener bucle infinito e inicialización on mount sin bucles de navegación', () => {
  // useEffect with empty dependency array [] and early return if already exists
  assert.match(projectContextSource, /useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(activeRefRef\.current[\s\S]*?return;[\s\S]*?\}, \[\]\);/);

  // No window.location.reload()
  assert.doesNotMatch(projectContextSource, /window\.location\.reload/);

  // Uses window.history.replaceState for URL update without reloading or re-rendering
  assert.match(projectContextSource, /window\.history\.replaceState/);

  // Syncs to quick-ref input
  assert.match(projectContextSource, /const\s+quickRefEl\s*=\s*document\.getElementById\('quick-ref'\)/);
  assert.match(indexHtml, /function\s+checkStartupProjectRef\(\)/);
  assert.match(indexHtml, /quickRefEl\.value\s*=\s*newRef/);
});

test('3. Input de la barra superior restaurado y conectado con activeProjectRef', () => {
  // Input in TopNav in App.jsx
  assert.match(appSource, /export function TopNav\(\)/);
  assert.match(appSource, /id="header-vessel-search-container"/);
  assert.match(appSource, /id="header-voyage-ref-container"/);
  assert.match(appSource, /id="quick-ref"/);
  assert.match(appSource, /value=\{activeProjectRef\s*\|\|\s*''\}/);

  // Input in index.html header
  assert.match(indexHtml, /<header[^>]*class="app-header/);
  assert.match(indexHtml, /id="header-vessel-search-container"/);
  assert.match(indexHtml, /id="header-voyage-ref-container"/);
  assert.match(indexHtml, /id="quick-ref"/);
});

test('4. Botón Nuevo Proyecto (+) en sidebar ejecuta lógica de estado pura: const newRef, setActiveProjectRef, y limpia puertos', () => {
  // Sidebar button
  assert.match(indexHtml, /id="new-estimation-btn"/);

  // index.html handleNewProject
  assert.match(indexHtml, /const newRef = "RDM\/2026-" \+ Math\.floor\(1000 \+ Math\.random\(\) \* 9000\);/);
  assert.match(indexHtml, /window\.setActiveProjectRef\(newRef\)/);
  assert.match(indexHtml, /clearGeographicData\(\)/);

  // dossiers.js requestNewEstimation
  assert.match(dossiersSource, /const newRef = "RDM\/2026-" \+ Math\.floor\(1000 \+ Math\.random\(\) \* 9000\);/);
  assert.match(dossiersSource, /window\.setActiveProjectRef\(newRef\)/);
  assert.match(dossiersSource, /clearGeographicData/);

  // ProjectContext button listener
  assert.match(projectContextSource, /document\.getElementById\('new-estimation-btn'\)/);
  assert.match(projectContextSource, /const newRef = "RDM\/2026-" \+ Math\.floor\(1000 \+ Math\.random\(\) \* 9000\);/);
  assert.match(projectContextSource, /setActiveProjectRef\(newRef\)/);
  assert.match(projectContextSource, /'port-pol',\s*'port-pod'/);
});
