import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [indexSource, routeConfiguratorSource, lazyGlobeSource, globeSource] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/RouteConfigurator.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/LazyGlobeMap.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8'),
]);

test('the global store supports selector subscriptions without breaking legacy listeners', () => {
  assert.match(indexSource, /subscribe\(selectorOrListener, maybeListener, equalityFn = Object\.is\)/);
  assert.match(indexSource, /const nextSlice = selector\(state\)/);
  assert.match(indexSource, /if \(equalityFn\(currentSlice, nextSlice\)\) return/);
  assert.match(indexSource, /this\.listeners\.add\(selectorOrListener\)/);
});

test('principal reactive consumers subscribe only to their required state slices', () => {
  assert.match(routeConfiguratorSource, /selectRouteState/);
  assert.match(routeConfiguratorSource, /routeStateEqual/);
  assert.match(routeConfiguratorSource, /SeaCharterStore\?\.subscribe\?\.\([\s\S]*selectRouteState/);
  assert.match(indexSource, /\(state\) => \[state\.pol, state\.pod, state\.laycanDate\]/);
  assert.match(indexSource, /const selectCostPlusState = \(state\) => \[/);
});

test('the globe React wrapper is memoized and cancels deferred work', () => {
  assert.match(lazyGlobeSource, /const GlobeCanvasContent = memo\(/);
  assert.match(lazyGlobeSource, /const LazyGlobeMap = memo\(/);
  assert.match(lazyGlobeSource, /window\.cancelIdleCallback\(idleCallbackId\)/);
  assert.match(lazyGlobeSource, /window\.clearTimeout\(checkTimer\)/);
  assert.doesNotMatch(lazyGlobeSource, /lazy\(|Suspense/);
});

test('WebGL resize and hidden telemetry updates are coalesced', () => {
  assert.match(globeSource, /if \(!view \|\| view\.resizeFrameId\) return/);
  assert.match(globeSource, /view\.resizeFrameId = requestAnimationFrame/);
  assert.match(globeSource, /size\.width === view\.lastWidth && size\.height === view\.lastHeight/);
  assert.match(globeSource, /view\.pendingVesselSync = true/);
  assert.match(globeSource, /if \(!isViewVisible\(view\)\)/);
});
