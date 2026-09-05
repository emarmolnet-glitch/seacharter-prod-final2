import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('header removes long subtitle under the title', () => {
  // Ensure the subtitle element is removed from the header DOM
  const headerMatch = indexSource.match(/<header class="app-header[\s\S]*?<\/header>/);
  assert.ok(headerMatch, 'header.app-header must be present');
  const headerHtml = headerMatch[0];
  assert.doesNotMatch(
    headerHtml,
    /Definir Ruta en Mapa ➔ Calcular Costes ➔ Redactar Contrato ➔ Auditar Riesgo/,
    'Header must not contain the long workflow subtitle'
  );
  assert.doesNotMatch(
    headerHtml,
    /data-i18n="global_subtitle"/,
    'Header must not contain the global_subtitle element'
  );
});

test('header title font size is reduced to compact scale', () => {
  assert.match(
    indexSource,
    /<h1 class="text-xs md:text-sm font-bold text-white tracking-tight">SeaCharter Core PRO <span[^>]*>RODAHMAR ENGINE<\/span><\/h1>/,
    'Header title font size must be reduced to text-xs md:text-sm'
  );
});

test('header container uses compact vertical padding', () => {
  assert.match(
    indexSource,
    /<header class="app-header[^"]*\bpy-2\b[^"]*">/,
    'Header must use compact vertical padding py-2'
  );
});

test('adjacent header elements maintain vertical centering with items-center', () => {
  assert.match(
    indexSource,
    /<header class="app-header[^"]*\bitems-center\b[^"]*">/,
    'Header container must maintain vertical centering'
  );
  assert.match(
    indexSource,
    /<div class="module-tabs-wrapper flex items-center">/,
    'Module tabs wrapper must have items-center'
  );
  assert.match(
    indexSource,
    /id="header-vessel-search-container"[^>]*class="[^"]*\bitems-center\b[^"]*"/,
    'Vessel search container must have items-center'
  );
  assert.match(
    indexSource,
    /<div class="header-actions-right flex items-center">/,
    'Right header actions must have items-center'
  );
});

test('application layout flexes to 100% visible height without vertical overflow', () => {
  assert.match(
    indexSource,
    /<body class="[^"]*h-screen flex flex-col overflow-hidden[^"]*"/,
    'Body container must establish a strict full viewport height column'
  );
  assert.match(
    indexSource,
    /<main class="app-main flex-1 overflow-hidden relative">/,
    'Main container must be flex-1 to absorb remaining viewport height'
  );
  assert.match(
    indexSource,
    /<footer class="app-footer[^"]*shrink-0[^"]*">/,
    'Footer must be shrink-0 so it is not pushed off screen'
  );
});
