import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('matching fields stay empty while taxonomy receives a global runtime fallback', () => {
  assert.match(source, /id="fleet-intel-taxonomy-summary"[^>]*>Sin categorías seleccionadas</);
  assert.match(source, /id="match-cargo-type"[\s\S]*?<option value="" selected>Sin tipo de carga seleccionado<\/option>/);
  assert.match(source, /id="match-quantity"[^>]*value=""/);
  assert.match(source, /cargoType: ""/);
  assert.match(source, /selectedTaxonomy: '',/);
  assert.doesNotMatch(source, /return legacyValue\.length > 0 \? legacyValue : \['type:bulk'\]/);
});

test('stored taxonomy is validated and auto-loaded through the global provider', () => {
  assert.match(source, /FLEET_INTEL_TAXONOMY_PRESET_VERSION = 2/);
  assert.match(source, /FLEET_INTEL_TAXONOMY_PRESET_MAX_AGE_MS/);
  assert.match(source, /localStorage\.removeItem\(FLEET_INTEL_TAXONOMY_PRESET_KEY\)/);
  assert.match(source, /GlobalTaxonomyProvider\?\.ensure\(\{/);
  assert.match(source, /source: 'density-map-init'/);
  assert.match(source, /setSelectedFleetTaxonomies\(initialTaxonomies, \{ dispatch: false, persist: false, markPending: false \}\)/);
});

test('density map waits for an explicit taxonomy but preserves loaded vessels when filters are empty', () => {
  const loaderStart = source.indexOf('window.loadValidatedAisDensityVessels = async function');
  const loaderEnd = source.indexOf('window.runInitialAisRadarLoad', loaderStart);
  const loader = source.slice(loaderStart, loaderEnd);
  const redrawStart = source.indexOf('window.reapplyCentralFiltersAndRedraw = function');
  const redrawEnd = source.indexOf("window.addEventListener('ais:vessels-updated'", redrawStart);
  const redraw = source.slice(redrawStart, redrawEnd);
  assert.ok(loader.indexOf('if (!selectedTaxonomy)') >= 0);
  assert.ok(loader.indexOf('if (!selectedTaxonomy)') < loader.indexOf('await fetch(endpoint'));
  assert.match(redraw, /const hasSelectedVesselTypes = Array\.isArray\(vesselTypes\) && vesselTypes\.length > 0/);
  assert.doesNotMatch(redraw, /vesselTypes\.length === 0[\s\S]{0,300}updateAisMarkers\(\[\]\)/);
});

test('matching supports manual execution and the validated Auto-Flow pipeline', () => {
  assert.match(source, /onclick="handleMatchingExecutionClick\(event\)"/);
  assert.match(source, /return runMatchingEngine\(hydratedRoute, \{ manual: true \}\)/);
  assert.match(source, /if \(options\.manual !== true && options\.auto !== true\) return false;/);
  assert.match(source, /MATCHING_MANUAL_EXECUTION_TOKEN = Symbol/);
  assert.match(source, /MATCHING_AUTO_EXECUTION_TOKEN = Symbol/);
  assert.match(source, /executionToken !== MATCHING_MANUAL_EXECUTION_TOKEN && executionToken !== MATCHING_AUTO_EXECUTION_TOKEN/);
  assert.match(source, /runMatchingEngine\(readiness\.route, \{ auto: true \}\)/);
  assert.match(source, /selectedVesselTaxonomies\.length === 0[\s\S]*?\|\| !matchingCargoType/);
  assert.match(source, /\|\| !matchingLoadPort[\s\S]*?\|\| !matchingUnloadPort[\s\S]*?\|\| !matchingLaycan/);
  assert.doesNotMatch(source, /if \(typeof executeMatchingEngine === 'function'\) executeMatchingEngine\(\);/);
  assert.doesNotMatch(source, /onchange="executeMatchingEngine\(\)"/);
});
