import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, globeSource, viteSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
]);

test('main map keeps explicit viewport dimensions independently from density', () => {
  assert.match(indexSource, /id="map-command-shell"[^>]*min-h-\[600px\][^>]*xl:min-h-\[800px\]/);
  assert.match(indexSource, /id="map-host"[^>]*absolute inset-0 w-full h-full[^>]*min-h-\[600px\]/);
  assert.match(indexSource, /id="map-container"[^>]*absolute inset-0 w-full h-full[^>]*min-h-\[600px\]/);
  assert.doesNotMatch(indexSource, /id="ais-map"/);
});

test('main globe renders a material fallback without waiting for remote textures', () => {
  assert.match(globeSource, /https:\/\/unpkg\.com\/three-globe\/example\/img\/earth-blue-marble\.jpg/);
  assert.match(globeSource, /https:\/\/unpkg\.com\/three-globe\/example\/img\/earth-topology\.png/);
  assert.match(globeSource, /new THREE\.MeshPhongMaterial\(\{[\s\S]*color: GLOBE_FALLBACK_COLOR/);
  assert.match(globeSource, /waitForGlobeReady: false/);
  assert.match(globeSource, /globe\.globeMaterial\(fallbackGlobeMaterial\)/);
});

test('globe stylesheet is published at its stable root path without stale prefetches', () => {
  assert.match(indexSource, /href="\/assets\/css\/density-globe\.css\?v=20260808-main-globe-recovery"/);
  assert.match(viteSource, /"assets\/css\/density-globe\.css"/);
  assert.doesNotMatch(indexSource, /rel="(?:preload|prefetch)"[^>]*(?:earth-blue-marble|earth-topology|density-globe)/i);
});
