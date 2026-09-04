import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, globeSource, viteSource, loaderSource, lazyMapSource, trackingSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/map-cartography-loader.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/LazyGlobeMap.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
]);

test('main map keeps explicit viewport dimensions independently from density', () => {
  assert.match(indexSource, /id="map-command-shell"[^>]*min-h-\[600px\][^>]*xl:min-h-\[800px\]/);
  assert.match(indexSource, /id="map-host"[^>]*absolute inset-0 w-full h-full[^>]*min-h-\[600px\]/);
  assert.match(indexSource, /id="map-container"[^>]*absolute inset-0 w-full h-full[^>]*min-h-\[600px\]/);
  assert.doesNotMatch(indexSource, /id="ais-map"/);
});

test('main globe renders a material fallback without waiting for remote textures', () => {
  assert.match(globeSource, /\/\/unpkg\.com\/three-globe\/example\/img\/earth-blue-marble\.jpg/);
  assert.match(globeSource, /\/\/unpkg\.com\/three-globe\/example\/img\/earth-topology\.png/);
  assert.match(globeSource, /new THREE\.MeshPhongMaterial\(\{[\s\S]*color: GLOBE_FALLBACK_COLOR/);
  assert.match(globeSource, /waitForGlobeReady: false/);
  assert.match(globeSource, /globe\.globeMaterial\(fallbackGlobeMaterial\)/);
});

test('globe stylesheet is published at its stable root path without stale prefetches', () => {
  assert.match(loaderSource, /stylesheet\.href = '\/assets\/css\/density-globe\.css\?v=20260808-main-globe-recovery'/);
  assert.match(viteSource, /"assets\/css\/density-globe\.css"/);
  assert.doesNotMatch(indexSource, /rel="(?:preload|prefetch)"[^>]*(?:earth-blue-marble|earth-topology|density-globe)/i);
});

test('map cartography loads only through dynamic entry points', () => {
  assert.doesNotMatch(indexSource, /<script[^>]+src="https:\/\/unpkg\.com\/globe\.gl/);
  assert.doesNotMatch(indexSource, /<script[^>]+src="\.\/GlobalFleetGlobe\.js/);
  assert.match(indexSource, /import\('\.\/src\/map-cartography-loader\.js'\)/);
  assert.match(trackingSource, /import\('\.\/src\/map-cartography-loader\.js'\)/);
  assert.match(loaderSource, /loadClassicScript\(GLOBE_SCRIPT_ID, GLOBE_RUNTIME_URL\)/);
  assert.match(loaderSource, /import\(\/\* @vite-ignore \*\/ GLOBE_MODULE_URL\)/);
});

test('map unmount cancels schedulers and releases WebGL resources', () => {
  assert.match(lazyMapSource, /window\.clearTimeout\(mountTimerId\)/);
  assert.match(lazyMapSource, /window\.cancelAnimationFrame\(resizeFrameId\)/);
  assert.match(lazyMapSource, /resizeObserver\?\.disconnect\(\)/);
  assert.match(lazyMapSource, /GlobalFleetGlobe\?\.destroy\?\.\(globeKey\)/);
  assert.match(globeSource, /view\.globe\?\._destructor\?\.\(\)/);
  assert.match(globeSource, /disposeSceneResources\(view\.globe\)/);
  assert.match(globeSource, /renderer\?\.dispose\?\.\(\)/);
  assert.match(globeSource, /renderer\?\.forceContextLoss\?\.\(\)/);
});
