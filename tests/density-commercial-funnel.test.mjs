import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('debug commercial modules and controls are permanently removed', async () => {
  await assert.rejects(access(new URL('../src/commercial-filter.js', import.meta.url)));
  await assert.rejects(access(new URL('../src/density-commercial-funnel.js', import.meta.url)));
  assert.doesNotMatch(indexSource, /density-commercial-filter-toggle|matching-commercial-filter-toggle|debug-dwt-filter-toggle/i);
  assert.doesNotMatch(indexSource, /isGlobalDebugActive|matchingDebugIncludeUnknownDwt|debugIncludeUnknownDwt/i);
});

test('density reads the single canonical matching fleet from GlobalStore', () => {
  const start = indexSource.indexOf('function getDensityReactiveVessels()');
  const end = indexSource.indexOf('window.getDensityReactiveVessels', start);
  const densitySource = indexSource.slice(start, end);
  assert.match(densitySource, /GlobalStore\?\.getCanonicalFleet/);
  assert.match(densitySource, /GlobalStore\?\.matchingVessels/);
  assert.doesNotMatch(densitySource, /GlobalStore[^\n]*activeVessels/);
  assert.doesNotMatch(densitySource, /openShipsVesselsCache|backgroundAisData|fetch\s*\(/);
});

test('matching fleet buttons commit the selected array through the canonical renderer', () => {
  const start = indexSource.indexOf('function applyMatchingFleetView');
  const end = indexSource.indexOf('window.applyMatchingFleetView', start);
  const actionSource = indexSource.slice(start, end);
  assert.match(actionSource, /setRenderedMatchingVessels\(displayedVessels/);
  assert.match(actionSource, /laycan-viable-view/);
  assert.match(actionSource, /compatible-fleet-view/);
  assert.match(indexSource, /window\.addEventListener\('canonical-fleet-updated', renderDensitySnapshotFromGlobalStore\)/);
});

test('density table renders the pure AIS collection without row truncation', () => {
  const start = indexSource.indexOf('function renderDensityVesselsTable');
  const end = indexSource.indexOf('window.renderDensityVesselsTable', start);
  const renderer = indexSource.slice(start, end);
  assert.match(renderer, /const displayVessels = getDensityReactiveVessels\(\)/);
  assert.match(renderer, /const visibleRows = displayVessels/);
  assert.doesNotMatch(renderer, /slice\(0, maxRows\)/);
});
