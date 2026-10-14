import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../src/global-splash-screen.js', import.meta.url), 'utf8');

test('global splash covers the complete interface from the first body paint', () => {
  assert.match(indexSource, /<body class="[^"]*bg-slate-900[^"]*" data-app-ready="false" aria-busy="true">/);
  assert.match(indexSource, /id="global-splash-screen" class="fixed inset-0 z-50 bg-slate-900"/);
  assert.match(indexSource, /SeaCharter Core PRO - Iniciando motor\.\.\./);
  assert.match(indexSource, /#global-splash-screen \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*z-index: 2147483000 !important;/);
});

test('startup controller keeps the map mounted behind the splash', () => {
  assert.match(controllerSource, /window\.ensureRouteMapReady\('map-host'\)/);
  assert.match(controllerSource, /mapContainer\.dataset\.renderKey !== 'mounted'/);
  assert.match(controllerSource, /mapContainer\.querySelector\('canvas'\)/);
  assert.match(controllerSource, /new ResizeObserver\(scheduleMount\)/);
  assert.doesNotMatch(controllerSource, /display\s*=\s*['"]none|remove\(\)/);
});

test('startup controller releases the interface after WebGL or a safe timeout', () => {
  assert.match(controllerSource, /complete\('webgl-mounted'\)/);
  assert.match(controllerSource, /const STARTUP_TIMEOUT_MS = 15000/);
  assert.match(controllerSource, /complete\('startup-timeout'\)/);
  assert.match(controllerSource, /document\.body\.dataset\.appReady = 'true'/);
  assert.match(controllerSource, /seacharter:app-ready/);
});

test('splash screen displays dual visual identity: Sub-Brand above and Master Brand below', () => {
  const splashMatch = indexSource.match(/<div id="global-splash-screen"[\s\S]*?<\/div>\s*<\/div>\s*<!-- NAVBAR TOP -->/);
  assert.ok(splashMatch, 'Splash screen element found in index.html');
  const splashHtml = splashMatch[0];

  // Sub-Brand: SeaCharter Core PRO above
  assert.match(splashHtml, /<!-- Sub-Brand: SeaCharter Core PRO -->/);
  assert.match(splashHtml, /<div style="font-size: 24px; font-weight: 800; color: #0E3A5D; letter-spacing: -0.02em;">SeaCharter<\/div>/);
  assert.match(splashHtml, /<div style="font-size: 17px; font-weight: 700; color: #2898B8; letter-spacing: -0.01em; margin-top: 2px;">Core PRO<\/div>/);

  // Central block intact
  assert.match(splashHtml, /<p class="global-splash__title">SeaCharter Core PRO - Iniciando motor\.\.\.<\/p>/);
  assert.match(splashHtml, /<div class="global-splash__progress" aria-hidden="true"><\/div>/);

  // Master Brand: CHARTER CORE PRO below progress bar (unified circular logo and typography)
  assert.match(splashHtml, /<!-- Nuevo icono circular de la Master Brand unificada -->/);
  assert.match(splashHtml, /<img src="\/assets\/master-brand-unified\.png" alt="Charter Core PRO"/);
  assert.match(splashHtml, /CHARTER<br\/><span style="color: #2898B8;">CORE PRO<\/span>/);
  assert.doesNotMatch(splashHtml, /linearGradient id="mGrad"/);

  // Anchor icon replaced
  assert.doesNotMatch(splashHtml, /M12 3v12m-4-8h8M5 12l7 4 7-4-1.5 6H6.5L5 12Z/);
});
