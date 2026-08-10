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
