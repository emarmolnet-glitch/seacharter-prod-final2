import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, trackingSource, trackingStyles, globeSource, decisionsSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../tracking-live.js', import.meta.url), 'utf8'),
  readFile(new URL('../calculator_view.css', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
  readFile(new URL('../decisiones.html', import.meta.url), 'utf8'),
]);

test('Tracking mounts inside the shared app layout and keeps the global header visible', () => {
  assert.match(trackingSource, /document\.querySelector\('main\.app-main'\)/);
  assert.match(trackingSource, /overlay\.className = 'tracking-live-overlay theme-light text-sm'/);
  assert.doesNotMatch(trackingSource, /Maritime control room/i);
  assert.match(trackingStyles, /\.tracking-live-overlay \{[\s\S]*position: absolute/);
  assert.match(indexSource, /presentation: 'module-overlay'/);
});

test('navigation tracks the mounted module explicitly when Tracking opens and closes', () => {
  assert.match(indexSource, /let activeNavigationModuleId = 'map'/);
  assert.match(indexSource, /let previousContentModuleId = 'map'/);
  assert.match(indexSource, /getMountedContentModuleId\(\)/);
  assert.match(indexSource, /closeTrackingLive\?\.\(\{ restoreNavigation: false \}\)/);
  assert.match(indexSource, /event\?\.detail\?\.restoreNavigation === false/);
});

test('Decisiones starts empty and waits for global voyage data', () => {
  assert.match(indexSource, /id="summary-pol"[^>]*>—</);
  assert.match(indexSource, /id="summary-pod"[^>]*>—</);
  assert.match(indexSource, /id="summary-qty"[^>]*>0 MT</);
  assert.match(indexSource, /id="dss-empty-state"/);
  assert.match(indexSource, /pol: '',\s*pod: '',\s*cargoQty: 0/);
  assert.match(indexSource, /window\.SeaCharterStore\?\.getState\?\.\(\)/);
  assert.doesNotMatch(decisionsSource, /id="summary-pol"[^>]*>Rotterdam</);
  assert.doesNotMatch(decisionsSource, /id="summary-pod"[^>]*>Houston</);
});

test('the reused Tracking globe clears stale routes when restoration is disabled', () => {
  assert.match(globeSource, /if \(options\.restoreRouteState === false\) \{/);
  assert.match(globeSource, /setRouteSegments\(\{\}, key, \{ focus: false, persist: false \}, \{ ballast: \[\], laden: \[\] \}\)/);
});
