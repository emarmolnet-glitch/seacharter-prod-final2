import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectRefSource = readFileSync(new URL('../src/utils/projectRef.mjs', import.meta.url), 'utf8');
const projectContextSource = readFileSync(new URL('../src/context/ProjectContext.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dossiersSource = readFileSync(new URL('../dossiers.js', import.meta.url), 'utf8');
const contractRefSource = readFileSync(new URL('../contract-reference.js', import.meta.url), 'utf8');

test('1. Generador canónico delegado al contador persistente', async () => {
  const { generateRandomProjectRef } = await import('../src/utils/projectRef.mjs');
  assert.equal(typeof generateRandomProjectRef, 'function', 'generateRandomProjectRef must be an exported function');

  let next = 1;
  globalThis.FixtureReferenceService = { create: () => `RDM/2026-${String(next++).padStart(4, '0')}` };
  try {
    const refs = new Set(Array.from({ length: 1000 }, () => generateRandomProjectRef()));
    assert.equal(refs.size, 1000);
    for (const ref of refs) assert.match(ref, /^RDM\/2026-\d{4}$/);
  } finally { delete globalThis.FixtureReferenceService; }
  assert.match(projectRefSource, /FixtureReferenceService/);
  assert.doesNotMatch(projectRefSource, /crypto.randomUUID/);
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

test('4. Nueva estimación usa un único reseteo sin un segundo listener React', () => {
  assert.match(indexHtml, /id="new-estimation-btn"/);
  assert.match(indexHtml, /function handleNewProject\(\) \{\s*return resetTotalEstimation\(\);/);
  assert.match(dossiersSource, /function requestNewEstimation\(\) \{\s*return window.resetTotalEstimation\(\);/);
  assert.doesNotMatch(projectContextSource, /addBtn.addEventListener/);
  assert.doesNotMatch(indexHtml, /const newRef = "RDM\/2026-"/);
});
