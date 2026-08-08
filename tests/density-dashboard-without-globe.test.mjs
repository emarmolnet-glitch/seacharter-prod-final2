import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const densityViewStart = source.indexOf('<div id="view-ais"');
const densityViewEnd = source.indexOf('</main>', densityViewStart);
const densityView = source.slice(densityViewStart, densityViewEnd);

test('density dashboard omits its WebGL globe while preserving analytical panels', () => {
  assert.ok(densityViewStart >= 0 && densityViewEnd > densityViewStart);
  assert.doesNotMatch(densityView, /id="ais-map"|data-globe-renderer|density-globe-stage/);
  assert.match(densityView, /id="ais-density-count"/);
  assert.match(densityView, /id="ais-rate-fair"/);
  assert.match(densityView, /id="density-commercial-filter-toggle"/);
  assert.match(densityView, /id="global-opportunities-panel"/);
  assert.match(densityView, /id="ais-vessels-tbody"/);
});

test('density data consumers retain the canonical matchingVessels source', () => {
  assert.match(source, /function getDensityReactiveVessels\(\)[\s\S]*window\.GlobalStore\?\.matchingVessels/);
  assert.match(source, /function renderDensitySnapshotFromGlobalStore\(\)[\s\S]*window\.renderDensityVesselsTable\?\.\(matchingVessels\)/);
  assert.match(source, /function calculateAndDisplayAisFreight\(\)/);
});
