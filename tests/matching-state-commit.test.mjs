import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const saveHandlerStart = source.indexOf("document.getElementById('btn-save-taxonomy-preset')?.addEventListener('click'");
const saveHandlerEnd = source.indexOf('getStoredFleetTaxonomyPreset();', saveHandlerStart);
const saveHandlerSource = source.slice(saveHandlerStart, saveHandlerEnd);

test('matching button starts locked until taxonomy state is committed', () => {
  assert.match(source, /id="btn-run-matching"[^>]*disabled[^>]*data-matching-ready="false"[^>]*data-ready-vessel-count="0"/);
  assert.match(source, /matchingSelectionPending \|\| \(count === 0 && !matchingReady\)/);
  assert.match(source, /Guarda los cambios de taxonomía para activar el motor/);
});

test('GlobalStore commits selected taxonomies and the filtered vessel snapshot', () => {
  assert.match(source, /selectedTaxonomies: \[\],[\s\S]*matchingReady: false,[\s\S]*matchingSelectionPending: false,[\s\S]*matchingSelection: null/);
  assert.match(source, /commitMatchingSelection\(taxonomies, vessels = this\.filteredVessels\)/);
  assert.match(source, /window\.getUnifiedMacroMatchingVessels\(vessels\)/);
  assert.match(source, /this\.selectedTaxonomies = selectedTaxonomies/);
  assert.match(source, /this\.matchingVessels = matchingVessels/);
  assert.match(source, /this\.matchingSelection = \{[\s\S]*commitId,[\s\S]*taxonomies: selectedTaxonomies\.slice\(\),[\s\S]*vessels: matchingVessels\.slice\(\),[\s\S]*vesselCount: matchingVessels\.length/);
});

test('unsaved taxonomy changes invalidate readiness until another commit', () => {
  assert.match(source, /markMatchingSelectionPending\(taxonomies\)/);
  assert.match(source, /this\.matchingSelectionPending = selectedTaxonomies\.length !== committedTaxonomies\.length/);
  assert.match(source, /this\.matchingReady = !this\.matchingSelectionPending && committedTaxonomies\.length > 0/);
  assert.match(source, /window\.GlobalStore\?\.markMatchingSelectionPending\?\.\(normalizedValues\)/);
});

test('save action commits the exact array returned by the table redraw', () => {
  assert.ok(saveHandlerStart >= 0 && saveHandlerEnd > saveHandlerStart);
  const filteredArrayIndex = saveHandlerSource.indexOf('const filteredVessels = typeof window.reapplyCentralFiltersAndRedraw');
  const redrawIndex = saveHandlerSource.indexOf('window.reapplyCentralFiltersAndRedraw()');
  const commitIndex = saveHandlerSource.indexOf('commitMatchingSelection?.(values, filteredVessels)');
  const dispatchIndex = saveHandlerSource.indexOf("new CustomEvent('READY_FOR_MATCHING'");

  assert.ok(filteredArrayIndex >= 0 && redrawIndex > filteredArrayIndex);
  assert.ok(commitIndex > redrawIndex && dispatchIndex > commitIndex);
  assert.doesNotMatch(saveHandlerSource, /runMatchingEngine|executeMatchingEngine|fetch\s*\(/);
});

test('taxonomy change redraws the AIS table from the derived filtered array', () => {
  assert.match(source, /document\.getElementById\('fleet-intel-vessel-type'\)\?\.addEventListener\('change',[\s\S]*const filteredVessels = typeof window\.reapplyCentralFiltersAndRedraw[\s\S]*setVesselClassContext\(selectedTaxonomy, filteredVessels\)/);
  assert.match(source, /const tbody = document\.getElementById\('ais-vessels-tbody'\)[\s\S]*primaryVisibleVessels\.forEach/);
});

test('matching engine listener enables the button and publishes the ready vessel count', () => {
  assert.match(source, /window\.addEventListener\('READY_FOR_MATCHING', handleReadyForMatching\)/);
  assert.match(source, /const matchingVessels = Array\.isArray\(store\.matchingSelection\?\.vessels\)/);
  assert.match(source, /button\.dataset\.matchingReady = 'true'/);
  assert.match(source, /button\.dataset\.readyVesselCount = String\(vesselCount\)/);
  assert.match(source, /resultsBadge\.innerText = `\$\{vesselCount\} Buque/);
  assert.match(source, /resultsBadge\.dataset\.counterSource = 'ready-for-matching'/);
});

test('matching execution consumes the unified committed array without taxonomy regrouping', () => {
  assert.match(source, /window\.GlobalStore\?\.matchingReady === true[\s\S]*window\.GlobalStore\?\.matchingSelectionPending !== true[\s\S]*window\.GlobalStore\.selectedTaxonomies\.slice\(\)/);
  assert.match(source, /const committedMatchingVessels = window\.GlobalStore\?\.matchingSelection\?\.vessels/);
  assert.match(source, /vessels: JSON\.parse\(JSON\.stringify\(committedMatchingVessels\)\)/);
  assert.match(source, /radarSnapshot: radarSnapshot\.vessels/);
  const captureStart = source.indexOf('const captureRadarSnapshotForFleetMatching');
  const captureEnd = source.indexOf('const btn = document.getElementById', captureStart);
  assert.doesNotMatch(source.slice(captureStart, captureEnd), /groupAisVesselsByTaxonomy|getAisMacroTaxonomyLabel/);
  assert.match(source, /source: 'global_matching_commit'/);
});

test('successful state commit confirms activation with the requested toast', () => {
  assert.match(saveHandlerSource, /showToast\('Configuración guardada\. Motor de Coincidencia activado'\)/);
});
